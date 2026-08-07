/**
 * nameRotation.mjs — Rotación de nombres propios para Hören/Lesen T4 (AUD-5).
 *
 * Análogo a topicRotation.mjs: elige los nombres menos usados en el banco
 * generado y los inyecta en el prompt para evitar convergencia Dana/Florian.
 *
 * Gender safety (2026-07-10): replaceGuestNamesInBatch refuses replacements that
 * would leave «Herr(n) + female» / «Frau + male» (Marie/Herrn bug).
 */

import fs from 'node:fs';
import path from 'node:path';

/** Pool canónico B1 (~25), mix M/F, sin solapar fonética cercana. */
export const GERMAN_FIRST_NAMES = [
  'Lena', 'Jonas', 'Mira', 'Felix', 'Sofia', 'Tim', 'Nele', 'Lukas', 'Aylin', 'Emil',
  'Hannah', 'Max', 'Zara', 'Paul', 'Marie', 'Leon', 'Amina', 'Noah', 'Laura', 'Erik',
  'Jana', 'Omar', 'Pia', 'Jan', 'Ruth', 'Klara', 'Theo', 'Maja', 'Anton', 'Lina',
  'Samuel', 'Nora', 'Elisa', 'Vincent', 'Helena', 'Julian', 'Milan', 'Amelie', 'Elias',
  'Charlotte', 'Matteo', 'Leonie', 'Fabian', 'Johanna', 'Kilian', 'Sophie', 'Moritz',
  'Valentina', 'Sebastian', 'Alina', 'Tobias', 'Melina', 'Dominik', 'Carla', 'Niklas',
];

/** Nombres que Gemini copia de la plantilla — excluir por defecto en nuevas generaciones. */
export const TEMPLATE_DEFAULT_NAMES = ['Dana', 'Florian', 'Clara', 'Anna', 'David', 'Finn', 'Greta', 'Ben'];

/** Grammatical gender of first names (pool + template defaults). Surnames are absent. */
export const NAME_GENDER = Object.freeze({
  Lena: 'f', Jonas: 'm', Mira: 'f', Felix: 'm', Sofia: 'f', Tim: 'm',
  Nele: 'f', Lukas: 'm', Aylin: 'f', Emil: 'm', Hannah: 'f', Max: 'm',
  Zara: 'f', Paul: 'm', Marie: 'f', Leon: 'm', Amina: 'f', Noah: 'm',
  Laura: 'f', Erik: 'm', Jana: 'f', Omar: 'm', Pia: 'f', Jan: 'm', Ruth: 'f',
  Klara: 'f', Theo: 'm', Maja: 'f', Anton: 'm', Lina: 'f', Samuel: 'm', Nora: 'f',
  Elisa: 'f', Vincent: 'm', Helena: 'f', Julian: 'm', Milan: 'm', Amelie: 'f', Elias: 'm',
  Charlotte: 'f', Matteo: 'm', Leonie: 'f', Fabian: 'm', Johanna: 'f', Kilian: 'm', Sophie: 'f',
  Moritz: 'm', Valentina: 'f', Sebastian: 'm', Alina: 'f', Tobias: 'm', Melina: 'f',
  Dominik: 'm', Carla: 'f', Niklas: 'm',
  Dana: 'f', Florian: 'm', Clara: 'f', Anna: 'f', David: 'm', Finn: 'm',
  Greta: 'f', Ben: 'm',
});

export function getNameGender(name) {
  if (!name) return null;
  return NAME_GENDER[String(name)] || null;
}

export function titleImpliesGender(title) {
  const t = String(title || '');
  if (/^Frau\b/i.test(t)) return 'f';
  if (/^Herr/i.test(t)) return 'm';
  return null;
}

/**
 * Scan text for «Herr(n)|Frau (+ Dr.) + FirstName» where FirstName is in NAME_GENDER
 * and disagrees with the title.
 * @returns {{ title: string, name: string, index: number }[]}
 */
export function findTitleNameGenderMismatches(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  const re = /\b(Herr(?:n)?|Frau)\s+(?:Dr\.\s+)?([A-ZÄÖÜ][a-zäöüß]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const title = m[1];
    const name = m[2];
    const nameG = getNameGender(name);
    if (!nameG) continue; // surname / unknown — skip
    const titleG = titleImpliesGender(title);
    if (titleG && titleG !== nameG) {
      out.push({ title, name, index: m.index });
    }
  }
  return out;
}

/**
 * Gender required for a replacement of `fromName`, inferred from Herr/Frau titles
 * already attached to that name in `text`. Falls back to the name's own gender.
 */
export function requiredGenderForNameInText(text, fromName) {
  if (!fromName) return null;
  const re = new RegExp(
    `\\b(Herr(?:n)?|Frau)\\s+(?:Dr\\.\\s+)?${fromName}\\b`,
    'g',
  );
  const implied = new Set();
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const g = titleImpliesGender(m[1]);
    if (g) implied.add(g);
  }
  if (implied.size === 1) return [...implied][0];
  if (implied.size > 1) {
    throw new Error(
      `nameRotation: «${fromName}» appears with conflicting Herr/Frau titles`,
    );
  }
  return getNameGender(fromName);
}

function batchTextBlob(batch) {
  const blobs = [];
  for (const p of batch?.passages || []) {
    blobs.push(p.text || '', p.transcript || '', p.title || '');
    if (Array.isArray(p.audio)) {
      for (const turn of p.audio) blobs.push(turn.speaker || '', turn.text || '');
    }
  }
  for (const q of batch?.questions || []) {
    blobs.push(q.question || '', q.explanation || '', q.signText || '');
    for (const opt of q.options || []) {
      if (typeof opt === 'string') blobs.push(opt);
      else if (opt && typeof opt === 'object') blobs.push(opt.text || '');
    }
  }
  return blobs.join('\n');
}

/**
 * Extract forum first names from Lesen T4 questions («Ist Klara für …?»).
 * @returns {string[]}
 */
export function extractLesenT4ForumNames(batch) {
  const out = [];
  const re = /\bIst\s+([A-ZÄÖÜ][a-zäöüß]+)\s+für\b/g;
  for (const q of batch?.questions || []) {
    const m = re.exec(String(q.question || ''));
    re.lastIndex = 0;
    if (m?.[1]) out.push(m[1]);
  }
  return [...new Set(out.filter(Boolean))];
}

/**
 * Names used in the most recent Lesen T4 JSON files (cross-file rotation).
 * @param {string[]} dirs
 * @param {number} maxFiles
 */
export function getRecentLesenT4ForumNames(dirs, maxFiles = 35) {
  const files = [];
  for (const dir of dirs || []) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/^lesen-t4.*\.json$/i.test(name) || name.startsWith('.')) continue;
      const abs = path.join(dir, name);
      try {
        const st = fs.statSync(abs);
        files.push({ abs, mtime: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const seen = new Set();
  const names = [];
  for (const f of files.slice(0, maxFiles)) {
    try {
      const batch = JSON.parse(fs.readFileSync(f.abs, 'utf8'));
      for (const n of extractLesenT4ForumNames(batch)) {
        if (!seen.has(n)) {
          seen.add(n);
          names.push(n);
        }
      }
    } catch {
      /* skip */
    }
  }
  return names;
}

/** All forum names appearing in Lesen T4 files under dirs (stronger session rotation). */
export function getAllLesenT4ForumNamesInDirs(dirs, maxFiles = 80) {
  return getRecentLesenT4ForumNames(dirs, maxFiles);
}

export function pickLesenT4ForumNames(generatedDir, opts = {}) {
  const extraDirs = opts.extraDirs || [];
  const scanDirs = [generatedDir, ...extraDirs].filter(Boolean);
  const recent = getAllLesenT4ForumNamesInDirs(scanDirs, opts.recentMaxFiles ?? 80);
  const sessionExclude = [
    ...(opts.sessionExclude || []),
    ...recent,
  ];
  return pickNextNames(generatedDir, 7, {
    module: 'lesen',
    teil: 4,
    sessionExclude,
    avoidTemplateDefaults: opts.avoidTemplateDefaults !== false,
    extraDirs,
  });
}

/**
 * Cuenta apariciones de nombres del pool (+ template defaults) en archivos generados.
 * @param {string} generatedDir
 * @param {{ module?: string, teil?: number }} [opts]
 */
export function getNameStats(generatedDir, { module = null, teil = null, extraDirs = [] } = {}) {
  const track = [...new Set([...GERMAN_FIRST_NAMES, ...TEMPLATE_DEFAULT_NAMES])];
  const counts = Object.fromEntries(track.map((n) => [n, 0]));
  const dirs = [generatedDir, ...(extraDirs || [])].filter(Boolean);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir)) {
      if (!filename.endsWith('.json') || filename.startsWith('.')) continue;
      if (module && !filename.toLowerCase().startsWith(module.toLowerCase())) continue;
      if (teil != null && !new RegExp(`-t${teil}-`).test(filename)) continue;
      try {
        const batch = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
        const hay = batchTextBlob(batch);
        for (const name of track) {
          const re = new RegExp(`\\b${name}\\b`, 'g');
          if (re.test(hay)) counts[name] += 1; // once per file if present
        }
      } catch {
        /* skip corrupt */
      }
    }
  }
  return counts;
}

/**
 * Elige `count` nombres menos usados; excluye sessionExclude + template defaults opcionales.
 * @param {object} [opts]
 * @param {('m'|'f')[]} [opts.genders] — if set, pick[i] must have genders[i]
 * @returns {string[]}
 */
export function pickNextNames(
  generatedDir,
  count = 2,
  {
    module = 'horen',
    teil = 4,
    sessionExclude = [],
    avoidTemplateDefaults = true,
    genders = null,
    extraDirs = [],
  } = {},
) {
  const stats = getNameStats(generatedDir, { module, teil, extraDirs });
  const exclude = new Set([
    ...(sessionExclude || []),
    ...(avoidTemplateDefaults ? TEMPLATE_DEFAULT_NAMES : []),
  ]);
  const ranked = GERMAN_FIRST_NAMES
    .filter((n) => !exclude.has(n))
    .sort((a, b) => {
      const d = (stats[a] || 0) - (stats[b] || 0);
      if (d !== 0) return d;
      return Math.random() - 0.5;
    });

  const picked = [];
  if (Array.isArray(genders) && genders.length) {
    for (let i = 0; i < Math.max(1, count); i++) {
      const want = genders[i] || genders[genders.length - 1];
      const cand = ranked.find(
        (n) => !picked.includes(n) && getNameGender(n) === want,
      );
      if (cand) picked.push(cand);
    }
  } else {
    picked.push(...ranked.slice(0, Math.max(1, count)));
  }

  // Si el pool quedó corto, rellenar sin template-avoid
  if (picked.length < count) {
    for (const n of GERMAN_FIRST_NAMES) {
      if (picked.includes(n) || sessionExclude.includes(n)) continue;
      if (Array.isArray(genders) && genders.length) {
        const want = genders[picked.length] || genders[genders.length - 1];
        if (getNameGender(n) !== want) continue;
      }
      picked.push(n);
      if (picked.length >= count) break;
    }
  }
  return picked;
}

/**
 * Lesen T4 — 7 opiniones del foro con nombres rotados (no plantilla Anna/Ben/…).
 */
export function injectLesenT4ForumNames(prompt, { useNames = [], avoidNames = [] } = {}) {
  const use = useNames.filter(Boolean).slice(0, 7);
  if (!use.length) return prompt;
  const avoid = [...new Set([...(avoidNames || []), ...TEMPLATE_DEFAULT_NAMES])]
    .filter((n) => !use.includes(n));

  let block = '\n## NOMBRES DEL FORO (OBLIGATORIO — Lesen T4)\n';
  block += `Usa EXCLUSIVAMENTE estos nombres de pila (uno por opinión / pregunta):\n`;
  for (let i = 0; i < use.length; i++) {
    block += `- Opinión ${i + 1}: **${use[i]}**\n`;
  }
  block +=
    `Enunciado: «Ist ${use[0]} für den Vorschlag?» (solo cambia el nombre).\n` +
    `PROHIBIDO reutilizar nombres de plantilla: ${avoid.join(', ')}.\n` +
    `Apellidos libres y distintos entre personajes.\n`;
  return prompt + block;
}

/**
 * Inyecta bloque de nombres obligatorios / prohibidos en el prompt.
 */
export function injectNamesIntoPrompt(prompt, { useNames = [], avoidNames = [] } = {}) {
  if (!useNames.length && !avoidNames.length) return prompt;
  const use = useNames.filter(Boolean);
  const avoid = [...new Set([...(avoidNames || []), ...TEMPLATE_DEFAULT_NAMES])]
    .filter((n) => !use.includes(n));

  let block = '\n## NOMBRES DE LOS INVITADOS (OBLIGATORIO)\n';
  if (use.length >= 2) {
    block +=
      `Usa EXCLUSIVAMENTE estos dos nombres de pila para los invitados (no Moderator):\n` +
      `- Invitado 1 (opción b): **${use[0]}**\n` +
      `- Invitado 2 (opción c): **${use[1]}**\n` +
      `Apellidos libres y distintos. Sustituye cualquier ejemplo Dana/Florian de la plantilla.\n` +
      `En transcript, audio[].speaker y options debe aparecer exactamente «${use[0]}» y «${use[1]}».\n` +
      `Si el texto ya usa Herr/Frau/Herrn ante un invitado, el nombre DEBE concordar en género ` +
      `(Herr/Herrn → masculino, Frau → femenino).\n`;
  } else if (use.length === 1) {
    block += `Usa el nombre **${use[0]}** como uno de los dos invitados; el otro de: ${GERMAN_FIRST_NAMES.filter((n) => n !== use[0]).slice(0, 8).join(', ')}.\n`;
  }
  if (avoid.length) {
    block +=
      `\n## NOMBRES PROHIBIDOS EN ESTA GENERACIÓN\n` +
      `No uses estos nombres de pila (ya usados recientemente o plantilla): ${avoid.join(', ')}.\n`;
  }

  const marker = prompt.indexOf('## PALABRAS OBJETIVO');
  if (marker >= 0) return prompt.slice(0, marker) + block + prompt.slice(marker);
  const marker2 = prompt.indexOf('## AUTORREVISIÓN');
  if (marker2 >= 0) return prompt.slice(0, marker2) + block + prompt.slice(marker2);
  const marker3 = prompt.indexOf('## Reglas estrictas');
  if (marker3 >= 0) {
    const insertAt = prompt.indexOf('\n', marker3) + 1;
    return prompt.slice(0, insertAt) + block + prompt.slice(insertAt);
  }
  return prompt + block;
}

/** Acumula nombres usados en la sesión (mirror poolFillSessionExclude). */
export function pushSessionNameExclude(sessionArgs, names) {
  if (!sessionArgs || !names?.length) return;
  sessionArgs._excludeNames = sessionArgs._excludeNames || [];
  for (const n of names) {
    if (n && !sessionArgs._excludeNames.includes(n)) sessionArgs._excludeNames.push(n);
  }
}

/**
 * Sustituye nombres de invitados en un batch T4 ya generado (sin LLM).
 * Reemplaza first names + optional full "First Last" in options/text/speakers.
 *
 * Gender guard: each `to` must match the Herr/Frau gender already attached to `from`
 * in the batch (or the inherent gender of `from` if no title). Prevents «Herrn Marie».
 *
 * @returns {{ batch: object, from: string[], to: string[], replacements: number }}
 */
export function replaceGuestNamesInBatch(batch, fromNames, toNames) {
  if (!batch || !fromNames?.length || !toNames?.length) {
    return { batch, from: fromNames || [], to: toNames || [], replacements: 0 };
  }
  const blob = batchTextBlob(batch);
  const pairs = [];
  for (let i = 0; i < Math.min(fromNames.length, toNames.length); i++) {
    const from = fromNames[i];
    const to = toNames[i];
    if (!from || !to || from === to) continue;
    const need = requiredGenderForNameInText(blob, from);
    const got = getNameGender(to);
    if (need && got && need !== got) {
      throw new Error(
        `nameRotation gender mismatch: cannot replace «${from}» (requires ${need} ` +
          `from Herr/Frau context or name gender) with «${to}» (${got})`,
      );
    }
    pairs.push([from, to]);
  }
  let replacements = 0;
  const replacer = (s) => {
    if (typeof s !== 'string' || !s) return s;
    let out = s;
    for (const [from, to] of pairs) {
      // Genitive first («Florians Bedenken») — longer match before bare name
      const reGen = new RegExp(`\\b${from}s\\b`, 'g');
      const nGen = (out.match(reGen) || []).length;
      if (nGen) {
        replacements += nGen;
        out = out.replace(reGen, `${to}s`);
      }
      const re = new RegExp(`\\b${from}\\b`, 'g');
      const n = (out.match(re) || []).length;
      if (n) {
        replacements += n;
        out = out.replace(re, to);
      }
    }
    return out;
  };

  const next = structuredClone(batch);
  for (const p of next.passages || []) {
    p.text = replacer(p.text);
    p.transcript = replacer(p.transcript);
    p.title = replacer(p.title);
    if (Array.isArray(p.audio)) {
      for (const turn of p.audio) {
        turn.speaker = replacer(turn.speaker);
        turn.text = replacer(turn.text);
      }
    }
  }
  for (const q of next.questions || []) {
    q.question = replacer(q.question);
    q.explanation = replacer(q.explanation);
    q.signText = replacer(q.signText);
    if (Array.isArray(q.options)) {
      q.options = q.options.map((opt) => {
        if (typeof opt === 'string') return replacer(opt);
        if (opt && typeof opt === 'object') return { ...opt, text: replacer(opt.text) };
        return opt;
      });
    }
  }

  const afterMismatches = findTitleNameGenderMismatches(batchTextBlob(next));
  if (afterMismatches.length) {
    const sample = afterMismatches
      .slice(0, 3)
      .map((x) => `${x.title} ${x.name}`)
      .join(', ');
    throw new Error(
      `nameRotation: post-replace title/name gender mismatch still present (${sample})`,
    );
  }

  return { batch: next, from: pairs.map((p) => p[0]), to: pairs.map((p) => p[1]), replacements };
}
