/**
 * Banco de variantes de título T4/T5 + picker con exclusión persistida.
 */
import crypto from 'node:crypto';

import { normTitle } from './structuralMoldDedup.mjs';
import { listT5VariantProfiles } from './lesenT5InstitutionSeeds.mjs';

export function inferInstitutionGender(institutionName, textSubtype = '') {
  const head = String(institutionName || '').split(/\s+/)[0] || '';
  const h = head.toLowerCase();
  if (/verein$/i.test(h) || /^sportverein|^turnverein/i.test(head)) return 'masculine';
  if (
    /zentrum$|studio$|haus$|bad$|park$|treff$|institut$|loft$|hub$|center$|galerie$|passage$/i.test(h) ||
    /^(bürgerzentrum|freizeitzentrum|fitnessstudio|stadthalle|vitalpark|einkaufszentrum|computerraum|schwimmbad|workhub|desklab)/i.test(
      head,
    ) ||
    ['freizeitzentrum', 'sportverein', 'einkaufszentrum', 'coworking', 'computerraum'].includes(textSubtype)
  ) {
    return 'neuter';
  }
  if (
    /bibliothek$|bücherei$|mensa$|kantine$|schule$|markt$|halle$|anlage$|cafeteria$|siedlung$/i.test(h) ||
    ['bibliothek', 'kantine', 'schule', 'markthalle', 'wohnanlage'].includes(textSubtype)
  ) {
    return 'feminine';
  }
  return 'feminine';
}

export function genitiveInstitutionPhrase(institutionName) {
  const parts = String(institutionName || '').trim().split(/\s+/);
  if (!parts.length) return institutionName;
  let head = parts[0];
  if (/zentrum$/i.test(head)) head = head.replace(/zentrum$/i, 'zentrums');
  else if (/studio$/i.test(head)) head = head.replace(/studio$/i, 'studios');
  else if (/haus$/i.test(head)) head = head.replace(/haus$/i, 'hauses');
  else if (/verein$/i.test(head)) head = head.replace(/verein$/i, 'vereins');
  return [head, ...parts.slice(1)].join(' ');
}

const T5_DEFAULT_TEMPLATES = Object.freeze([
  'Hausordnung der {institution}',
  'Benutzungsordnung der {institution}',
  'Nutzungsordnung der {institution}',
  'Nutzungsordnung des {genitiveInstitution}',
  'Ordnung in der {institution}',
  'Ordnung im {institution}',
  'Regeln der {institution}',
  'Regeln des {genitiveInstitution}',
  'Richtlinien der {institution}',
  'Richtlinien des {genitiveInstitution}',
]);

/** Plantillas extra por subtipo (además de las genéricas). */
const T5_SUBTYPE_TEMPLATES = Object.freeze({
  kantine: ['Mensaordnung der {institution}', 'Speiseordnung der {institution}'],
  park: ['Parkordnung {institution}', 'Regeln im {institution}'],
  markthalle: ['Marktordnung {institution}', 'Ordnung auf dem {institution}'],
  einkaufszentrum: ['Center-Ordnung {institution}', 'Hausordnung des {institution}'],
  coworking: ['Workspace-Regeln {institution}', 'Coworking-Ordnung {institution}'],
  bibliothek: ['Benutzungsordnung der {institution}', 'Leihordnung der {institution}'],
  sportverein: ['Vereinsordnung {institution}', 'Hausordnung des {institution}'],
  freizeitzentrum: ['Nutzungsordnung des {institution}', 'Center-Regeln {institution}'],
  wohnanlage: ['Hausordnung der {institution}', 'Wohnanlagen-Ordnung {institution}'],
  schule: ['Schulordnung der {institution}', 'Hausordnung der {institution}'],
  leihgeraete: ['Ausleihordnung der {institution}', 'Leihbedingungen {institution}'],
  computerraum: ['Nutzungsordnung des {institution}', 'PC-Raum-Regeln {institution}'],
  fitness_app: ['Studio-Ordnung {institution}', 'App-Nutzungsbedingungen {institution}'],
});

/** Sufijos por perfil de variante T5. */
const T5_PROFILE_TEMPLATES = Object.freeze({
  prepaid: ['Aufladekarten-Ordnung der {institution}'],
  wochenmarkt: ['Marktordnung im {institution}'],
  gemeinschaftsgarten: ['Gartenordnung {institution}'],
  hallenbad: ['Badeordnung {institution}'],
  fitness: ['Fitness-Ordnung {institution}'],
  veranstaltungen: ['Veranstaltungsordnung {institution}'],
  sonntagsverkauf: ['Sonderöffnungs-Ordnung {institution}'],
});

const T4_TITLE_TEMPLATES = Object.freeze([
  'Forum: {phrase} — ja oder nein?',
  'Diskussion: {phrase} — ja oder nein?',
  'Meinungsforum: {phrase} — ja oder nein?',
  'Stadtforum: {phrase} — ja oder nein?',
  'Forum zur Frage: {phrase} — ja oder nein?',
  'Debatte: {phrase} — ja oder nein?',
]);

function hashPick(key, mod) {
  const h = crypto.createHash('sha256').update(String(key), 'utf8').digest();
  return mod > 0 ? h.readUInt32BE(0) % mod : 0;
}

function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Prepositions/articles that must not end a T4 title phrase (truncation artifact). */
const T4_PHRASE_DANGLING_TAIL =
  /^(?:im|am|zum|zur|vom|für|mit|und|oder|zu|an|auf|in|von|bei|nach|vor|über|unter|durch|als|die|der|das|den|dem|des|ein|eine|einen|einem|einer|eines|pro|sehr|mehr|nur|schon|noch|beim)$/i;

function lastPhraseWord(phrase) {
  const core = String(phrase || '')
    .trim()
    .replace(/[.!?:…]+$/u, '');
  return (core.split(/\s+/).pop() || '').replace(/[^\p{L}\p{N}-]/gu, '');
}

export function isT4TitlePhraseGrammaticallyComplete(phrase) {
  const p = String(phrase || '').trim();
  if (!p || p.length < 12) return false;
  const last = lastPhraseWord(p);
  if (last && T4_PHRASE_DANGLING_TAIL.test(last)) return false;
  return true;
}

/** Full debate proposition for T4 titles (no mid-clause chop + generic suffix). */
function seedToTitlePhrase(seed) {
  const s = String(seed || '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
  if (!s) return 'Aktuelle Debatte';

  const MAX = 140;
  if (s.length <= MAX && isT4TitlePhraseGrammaticallyComplete(s)) return s;

  const clause = s.split(/[,;]/)[0]?.trim() || s;
  if (clause.length <= MAX && isT4TitlePhraseGrammaticallyComplete(clause)) return clause;

  let cut = s.slice(0, MAX);
  let lastSpace = cut.lastIndexOf(' ');
  while (lastSpace > 24) {
    cut = cut.slice(0, lastSpace).trim();
    if (isT4TitlePhraseGrammaticallyComplete(cut)) return cut;
    lastSpace = cut.lastIndexOf(' ');
  }

  return s.length <= MAX ? s : s.slice(0, MAX).trim();
}

/**
 * Candidatos determinísticos de título T5 para subtipo+institución+perfil.
 */
export function buildT5TitleCandidates(textSubtype, institutionName, variantProfile = 'standard') {
  const institution = String(institutionName || '').trim();
  const genitiveInstitution = genitiveInstitutionPhrase(institution);
  const subtype = String(textSubtype || 'park');
  const templates = [
    ...(T5_PROFILE_TEMPLATES[variantProfile] || []),
    ...(T5_SUBTYPE_TEMPLATES[subtype] || []),
    ...T5_DEFAULT_TEMPLATES,
  ];
  const seen = new Set();
  const out = [];
  for (const tpl of templates) {
    const title = fillTemplate(tpl, { institution, genitiveInstitution }).replace(/\s+/g, ' ').trim();
    const nt = normTitle(title);
    if (!title || nt.length < 8 || seen.has(nt)) continue;
    seen.add(nt);
    out.push(title);
  }
  return out;
}

/**
 * Candidatos determinísticos de título T4 para una semilla fija.
 */
export function buildT4TitleCandidates(debateSeed) {
  const phrase = seedToTitlePhrase(debateSeed);
  const seen = new Set();
  const out = [];
  for (const tpl of T4_TITLE_TEMPLATES) {
    const title = fillTemplate(tpl, { phrase }).replace(/\s+/g, ' ').trim();
    const nt = normTitle(title);
    if (!title || nt.length < 8 || seen.has(nt)) continue;
    seen.add(nt);
    out.push(title);
  }
  return out;
}

/**
 * Elige título no usado consultando excludeNormalized (pool persistido + sesión).
 */
export function pickMandatedTitle(opts = {}) {
  const teil = Number(opts.teil);
  const exclude = new Set((opts.excludeNormalized || []).map(normTitle).filter((t) => t.length >= 8));
  const entropy = String(opts.entropy || Date.now());

  let candidates = [];
  if (teil === 5) {
    candidates = buildT5TitleCandidates(
      opts.textSubtype,
      opts.institutionName,
      opts.variantProfile || 'standard',
    );
  } else if (teil === 4) {
    candidates = buildT4TitleCandidates(opts.debateSeed);
  }

  const fresh = candidates.filter((t) => !exclude.has(normTitle(t)));
  if (fresh.length) {
    const start = hashPick(`${entropy}:title`, fresh.length);
    for (let i = 0; i < fresh.length; i++) {
      const title = fresh[(start + i) % fresh.length];
      if (!exclude.has(normTitle(title))) return title;
    }
  }

  const pool = candidates;

  if (!pool.length) {
    const fallback =
      teil === 5
        ? `Ordnung ${opts.institutionName || 'Institution'} (${hashPick(entropy, 999) + 1})`
        : `Forum: ${seedToTitlePhrase(opts.debateSeed)} — ja oder nein? (${hashPick(entropy, 999) + 1})`;
    return fallback;
  }

  return pool[hashPick(`${entropy}:title`, pool.length)];
}

export function buildMandatedTitlePromptBlock(mandatedTitle) {
  if (!mandatedTitle) return '';
  return (
    `\n## TÍTULO OBLIGATORIO (exacto — no lo cambies)\n` +
    `El campo \`passages[0].title\` debe ser **exactamente**:\n` +
    `«${mandatedTitle}»\n` +
    `- **PROHIBIDO** inventar otro título o variante.\n` +
    `- El contenido del pasaje debe ser coherente con este título.\n`
  );
}

/**
 * Verificación title↔content para T4 (regresión).
 */
/**
 * Title phrase must align with _debateSeed (not only end punctuation).
 */
export function checkT4TitleSeedAlignment(title, debateSeed) {
  const seed = String(debateSeed || '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
  if (!seed) return { ok: true, skipped: true };

  const raw = String(title || '').trim();
  let phrase = raw
    .replace(/^Forum:\s*/i, '')
    .replace(/^Diskussion:\s*/i, '')
    .replace(/^Meinungsforum:\s*/i, '')
    .replace(/^Stadtforum:\s*/i, '')
    .replace(/^Forum zur Frage:\s*/i, '')
    .replace(/^Debatte:\s*/i, '')
    .trim();
  phrase = phrase.replace(/\s*[—–-]\s*ja oder nein\?$/i, '').trim();

  if (!isT4TitlePhraseGrammaticallyComplete(phrase)) {
    return {
      ok: false,
      issue: `T4 título: frase incompleta antes de puntuación/sufijo («…${phrase.slice(-32)}»)`,
      phrase,
      seed,
    };
  }

  const seedWords = seed
    .toLowerCase()
    .replace(/[^a-zäöüß\s-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  const tail = seedWords.slice(-3);
  const phraseLow = phrase.toLowerCase();
  const tailHits = tail.filter((w) => phraseLow.includes(w));
  const minTail = Math.min(2, tail.length);

  if (tail.length && tailHits.length < minTail) {
    return {
      ok: false,
      issue:
        `T4 título truncado vs _debateSeed: faltan anclas finales (${tailHits.length}/${minTail}) ` +
        `«${phrase.slice(0, 72)}…» vs seed «${seed.slice(0, 72)}…»`,
      phrase,
      seed,
      tailHits,
    };
  }

  if (phrase.length + 8 < seed.length && !phraseLow.includes(seed.slice(0, 24).toLowerCase())) {
    return {
      ok: false,
      issue: `T4 título demasiado corto vs semilla (${phrase.length} vs ${seed.length} chars)`,
      phrase,
      seed,
    };
  }

  return { ok: true, phrase, seed, tailHits };
}

export function checkT4TitleContentCoherence(batch, debateSeed = null) {
  const seed = String(debateSeed || batch._debateSeed || '').trim();
  if (!seed) return { ok: true, skipped: true };

  const title = String(batch.passages?.[0]?.title || batch.passage?.title || '');
  const intro = String(batch.passages?.[0]?.text || batch.passage?.text || '');
  const blob = `${title} ${intro}`.toLowerCase();

  const seedWords = seed
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5);
  const hits = seedWords.filter((w) => blob.includes(w));
  const minHits = Math.min(2, Math.max(1, seedWords.length));

  if (hits.length >= minHits) {
    return { ok: true, hits, seedWords: seedWords.slice(0, 6) };
  }

  return {
    ok: false,
    issue:
      `T4 title↔content: solo ${hits.length}/${minHits} anclas de la semilla en título+intro ` +
      `(semilla: «${seed.slice(0, 72)}…»)`,
    hits,
    seedWords: seedWords.slice(0, 8),
    title: title.slice(0, 80),
  };
}

/** Estima namespace de títulos únicos por subtipo (para headroom). */
export function estimateT5TitleNamespace(textSubtype, variantProfile = 'standard') {
  const sampleInstitutions = [
    'Stadtpark Westend',
    'Mensa Am Campus',
    'Coworking-Space Mitte',
    'Einkaufszentrum Nord',
    'Wochenmarkt Am Ring',
  ];
  const seen = new Set();
  for (const inst of sampleInstitutions) {
    for (const t of buildT5TitleCandidates(textSubtype, inst, variantProfile)) {
      seen.add(normTitle(t));
    }
  }
  return seen.size;
}

export function estimateCellTitleNamespace(topic, teil, compatibleSubtypes = []) {
  if (Number(teil) !== 5) return null;
  let total = 0;
  for (const id of compatibleSubtypes) {
    for (const p of listT5VariantProfiles(id)) {
      total += estimateT5TitleNamespace(id, p.id);
    }
  }
  return total;
}
