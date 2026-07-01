#!/usr/bin/env node
/**
 * audit-pass-2.mjs — LexiLoop B1 corpus audit gate (segunda pasada)
 *
 * Uso:
 *   node scripts/audit-pass-2.mjs <ruta>                  # archivo o directorio
 *   node scripts/audit-pass-2.mjs <ruta> --json           # salida JSON estructurada
 *   node scripts/audit-pass-2.mjs <ruta> --fail-on=CRITICAL|IMPORTANT|none
 *   node scripts/audit-pass-2.mjs <ruta> --fix-types      # reescribe type:"multiple" in-place
 *   node scripts/audit-pass-2.mjs <ruta> --summary-only   # solo el bloque RESUMEN
 *
 * Flags combinables. Código de salida 1 si hay findings ≥ --fail-on (default: CRITICAL).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BLACKLIST } from './blacklist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Editable constants ────────────────────────────────────────────────────

const CANONICAL_TYPES = new Set([
  'multiple_choice', 'richtig_falsch', 'ja_nein', 'matching', 'short_answer',
]);

/** Blueprint: expected item count per (module, teil). null = variable. */
const BLUEPRINT = {
  'lesen-1':   { count: 6,  types: ['richtig_falsch'] },
  'lesen-2':   { count: 6,  types: ['multiple_choice'] },
  'lesen-3':   { count: 7,  types: ['matching'] },
  'lesen-4':   { count: 7,  types: ['ja_nein'] },
  'lesen-5':   { count: 4,  types: ['multiple_choice'] },
  'horen-1':   { count: 10, types: ['richtig_falsch', 'multiple_choice'] },
  'horen-2':   { count: 5,  types: ['multiple_choice'] },
  'horen-3':   { count: 7,  types: ['richtig_falsch'] },
  'horen-4':   { count: 8,  types: ['matching'] },
  'schreiben': { count: null, types: ['short_answer'] },
  'sprechen':  { count: null, types: ['short_answer'] },
};

/** C1/C2 vocabulary blacklist (case-insensitive). Add here to extend. */
// BLACKLIST imported from ./lib/blacklist.mjs — single source of truth

// ─── Finding type ──────────────────────────────────────────────────────────

const SEV = { CRITICAL: 3, IMPORTANT: 2, MINOR: 1, INFO: 0 };

function finding(id, severity, file, scope, message) {
  return { id, severity, file: path.basename(file || ''), scope: scope || '', message };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeText(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-zäöüß0-9 ]/g, '').trim();
}

function sha1(text) {
  return crypto.createHash('sha1').update(normalizeText(text)).digest('hex');
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4);
}

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const t of sb) if (sa.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function bpKey(q) {
  const mod = String(q.module || '').toLowerCase();
  if (mod === 'schreiben' || mod === 'sprechen') return mod;
  return `${mod}-${q.teil}`;
}

/** Balance key: same as bpKey but also splits by type for mixed-type Teile (e.g. Hören T1). */
function balanceKey(q) {
  return `${bpKey(q)}:${q.type}`;
}

function allTextFields(q) {
  const parts = [q.question, q.signText, q.explanation];
  for (const o of q.options || []) parts.push(String(o));
  return parts.filter(Boolean).join(' ');
}

function passageText(p) {
  return `${p.title || ''} ${p.text || ''}`.trim();
}

// ─── CHK-1: Canonical types ────────────────────────────────────────────────

function chk1(batch, file) {
  const findings = [];
  for (const q of batch.questions || []) {
    if (!CANONICAL_TYPES.has(q.type)) {
      const hint = q.type === 'multiple' ? ' (usar multiple_choice)' : '';
      findings.push(finding('CHK-1', 'CRITICAL', file, q.id,
        `type:"${q.type}" no es canónico${hint}`));
    }
  }
  return findings;
}

// ─── CHK-2: correct === correctAnswer + valid values per type ──────────────

const VALID_CORRECT = {
  richtig_falsch:  v => ['Richtig','Falsch'].includes(v),
  ja_nein:         v => ['Ja','Nein'].includes(v),
  matching:        v => /^[a-jA-J0]$/.test(v),
  multiple_choice: v => /^[a-c]$/.test(v),
  short_answer:    v => v === 'rubric',
};

function chk2(batch, file) {
  const findings = [];
  for (const q of batch.questions || []) {
    const c = q.correct, ca = q.correctAnswer;
    if (c == null || ca == null) {
      findings.push(finding('CHK-2', 'CRITICAL', file, q.id, '`correct` o `correctAnswer` es null'));
      continue;
    }
    if (String(c) !== String(ca)) {
      findings.push(finding('CHK-2', 'CRITICAL', file, q.id,
        `correct="${c}" ≠ correctAnswer="${ca}"`));
    }
    const validator = VALID_CORRECT[q.type];
    if (validator && !validator(String(c))) {
      findings.push(finding('CHK-2', 'CRITICAL', file, q.id,
        `correct="${c}" no válido para type="${q.type}"`));
    }
    // richtig_falsch → options must be []
    if (q.type === 'richtig_falsch' && Array.isArray(q.options) && q.options.length > 0) {
      findings.push(finding('CHK-2', 'IMPORTANT', file, q.id,
        'richtig_falsch debe tener options:[]'));
    }
    // matching Hören T4 → 3 options starting a)/b)/c)
    if (q.type === 'matching' && q.module === 'horen' && Number(q.teil) === 4) {
      const opts = q.options || [];
      if (opts.length !== 3) {
        findings.push(finding('CHK-2', 'CRITICAL', file, q.id,
          `Hören T4 matching debe tener 3 options, tiene ${opts.length}`));
      } else {
        ['a) ', 'b) ', 'c) '].forEach((prefix, i) => {
          if (!String(opts[i] || '').startsWith(prefix)) {
            findings.push(finding('CHK-2', 'IMPORTANT', file, q.id,
              `option[${i}] debe empezar por "${prefix}", tiene "${opts[i]}"`));
          }
        });
      }
    }
    // multiple_choice → 3 options
    if (q.type === 'multiple_choice') {
      const opts = q.options || [];
      if (opts.length !== 3) {
        findings.push(finding('CHK-2', 'IMPORTANT', file, q.id,
          `multiple_choice debe tener 3 options, tiene ${opts.length}`));
      }
    }
  }
  return findings;
}

// ─── CHK-3: Item count vs blueprint ───────────────────────────────────────

function chk3(batch, file) {
  const findings = [];
  // Group by module+teil
  const groups = {};
  for (const q of batch.questions || []) {
    const key = bpKey(q);
    groups[key] = (groups[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(groups)) {
    const spec = BLUEPRINT[key];
    if (!spec || spec.count === null) continue;
    if (count !== spec.count) {
      findings.push(finding('CHK-3', 'CRITICAL', file, key,
        `${key}: se esperan ${spec.count} ítems, hay ${count}`));
    }
  }
  return findings;
}

// ─── CHK-4: Balance de respuestas ─────────────────────────────────────────

function chk4(batch, file) {
  const findings = [];
  const groups = {};
  for (const q of batch.questions || []) {
    const key = balanceKey(q);
    if (!groups[key]) groups[key] = [];
    groups[key].push(q);
  }

  for (const [key, qs] of Object.entries(groups)) {
    const n = qs.length;
    if (n < 2) continue;
    const type = qs[0]?.type;
    const dist = {};
    for (const q of qs) {
      const v = String(q.correct || '').toLowerCase();
      dist[v] = (dist[v] || 0) + 1;
    }

    if (type === 'multiple_choice' || (type === 'matching' && key.startsWith('horen-4'))) {
      // All 3 letters must appear at least once (only enforced for batches with ≥6 MC items;
      // with 5 items it's statistically possible that one letter is absent without bias)
      if (n >= 6) {
        const letters = ['a','b','c'];
        for (const letter of letters) {
          if (!dist[letter]) {
            findings.push(finding('CHK-4', 'IMPORTANT', file, key,
              `Balance MC: letra "${letter}" no aparece ninguna vez. Dist: ${JSON.stringify(dist)}`));
          }
        }
      }
      // No single letter > 65% (allows 3/5=60% which is acceptable with few items)
      for (const [v, cnt] of Object.entries(dist)) {
        const pct = cnt / n;
        const limit = key.startsWith('horen-4') && v === 'a' ? 0.50 : 0.65;
        if (pct > limit) {
          findings.push(finding('CHK-4', 'IMPORTANT', file, key,
            `Balance MC: "${v}"=${Math.round(pct*100)}% supera el máximo 65%. Dist: ${JSON.stringify(dist)}`));
        }
      }
    } else if (type === 'richtig_falsch' || type === 'ja_nein') {
      const vals = Object.values(dist);
      const allSame = vals.length === 1;
      if (allSame && n >= 5) {
        findings.push(finding('CHK-4', 'IMPORTANT', file, key,
          `Balance: todos los ítems tienen la misma respuesta. Dist: ${JSON.stringify(dist)}`));
      }
      // Rango ampliado a 15-85% para richtig_falsch/ja_nein: con pocos items (5-6),
      // distribuciones como 4/1 (80%) son estadísticamente válidas. Solo flagear extremos
      // evidentes (0% o 100% ya cubierto por allSame; aquí cubrimos 1/6=17% o 5/6=83%).
      if (n >= 5) {
        for (const [v, cnt] of Object.entries(dist)) {
          const pct = cnt / n;
          if (pct < 0.15 || pct > 0.85) {
            findings.push(finding('CHK-4', 'IMPORTANT', file, key,
              `Balance R/F o Ja/Nein: "${v}"=${Math.round(pct*100)}% fuera de rango 15–85%. Dist: ${JSON.stringify(dist)}`));
          }
        }
      }
    }
  }
  return findings;
}

// ─── CHK-5: Global passage dedup ──────────────────────────────────────────

function chk5(allBatches) {
  const findings = [];
  // Build passage registry: hash → [{file, id, title}]
  const byHash = {};
  const byTitle = {};
  const entries = []; // {file, id, tokens, title}

  for (const { batch, file } of allBatches) {
    for (const p of batch.passages || []) {
      const text = passageText(p);
      if (text.length < 30) continue;
      const h = sha1(text);
      if (!byHash[h]) byHash[h] = [];
      byHash[h].push({ file, id: p.id, preview: text.slice(0, 60) });

      const normTitle = normalizeText(p.title || '');
      if (normTitle.length > 5) {
        if (!byTitle[normTitle]) byTitle[normTitle] = [];
        byTitle[normTitle].push({ file, id: p.id });
      }

      entries.push({ file, id: p.id, tokens: tokenize(text), title: p.title || '' });
    }
  }

  // Exact hash duplicates
  for (const [, group] of Object.entries(byHash)) {
    if (group.length < 2) continue;
    const files = [...new Set(group.map(g => g.file))];
    if (files.length < 2) continue; // same file is ok (shouldn't happen)
    findings.push(finding('CHK-5', 'IMPORTANT', files[0], group[0].id,
      `Pasaje idéntico (hash exacto) en ${group.length} archivos: ${files.slice(0,5).join(', ')} — "${group[0].preview}"`));
  }

  // Title duplicates (across files)
  for (const [, group] of Object.entries(byTitle)) {
    if (group.length < 2) continue;
    const files = [...new Set(group.map(g => g.file))];
    if (files.length < 2) continue;
    const ids = group.map(g => g.id).join(', ');
    findings.push(finding('CHK-5', 'MINOR', files[0], ids,
      `Título de pasaje duplicado en ${files.length} archivos: "${group[0].file}" … (ids: ${ids.slice(0,80)})`));
  }

  // Jaccard near-duplicates (skip already flagged exact dups)
  const exactHashes = new Set(
    Object.values(byHash).filter(g => g.length >= 2).flatMap(g => g.map(x => x.id))
  );
  const processed = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (exactHashes.has(entries[i].id)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (exactHashes.has(entries[j].id)) continue;
      if (entries[i].file === entries[j].file) continue;
      const key = `${entries[i].id}::${entries[j].id}`;
      if (processed.has(key)) continue;
      processed.add(key);
      const sim = jaccard(entries[i].tokens, entries[j].tokens);
      if (sim > 0.6) {
        findings.push(finding('CHK-5', 'MINOR', entries[i].file, entries[i].id,
          `Jaccard=${(sim*100).toFixed(0)}% con "${entries[j].id}" (${entries[j].file})`));
      }
    }
  }

  return findings;
}

// ─── CHK-6: C1/C2 blacklist ───────────────────────────────────────────────

function chk6(batch, file) {
  const findings = [];
  const check = (text, scope) => {
    if (!text) return;
    for (const entry of BLACKLIST) {
      if (!entry.term.test(text)) continue;
      const match = text.match(entry.term)?.[0] || '';
      const msg = entry.grammar
        ? `Error gramatical "${match}" → ${entry.suggestion}`
        : `Vocabulario C1/C2 "${match}" → usa "${entry.suggestion}" (B1)`;
      findings.push(finding('CHK-6', 'IMPORTANT', file, scope, msg));
    }
  };

  for (const p of batch.passages || []) {
    check(p.text, `passage:${p.id}`);
    check(p.title, `passage:${p.id}:title`);
  }
  for (const q of batch.questions || []) {
    check(q.question, `q:${q.id}:question`);
    check(q.signText, `q:${q.id}:signText`);
    check(q.explanation, `q:${q.id}:explanation`);
    for (const o of q.options || []) check(String(o), `q:${q.id}:option`);
  }
  return findings;
}

// ─── CHK-7: Lesen T4 — affirmative + coherence ────────────────────────────

const T4_NEIN_MARKERS = ['dagegen','lehne','bin gegen','nicht einverstanden','skeptisch','ablehnen','sage ich nein','nicht gut'];
const T4_JA_MARKERS   = ['bin dafür','bin für','finde den vorschlag gut','unterstütze','absolut für','befürworte','einverstanden','sehr gut','sage ich ja'];
const T4_NEGATION_RE  = /\b(nicht|kein|kein\w*|lehnt|gegen|ablehn\w*|widerspricht)\b/i;

function chk7(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    q.type === 'ja_nein' || (q.module === 'lesen' && Number(q.teil) === 4)
  );
  if (!t4qs.length) return findings;

  // Negation in question text (CRITICAL)
  for (const q of t4qs) {
    const m = (q.question || '').match(T4_NEGATION_RE);
    if (m) {
      findings.push(finding('CHK-7', 'CRITICAL', file, q.id,
        `Lesen T4: enunciado contiene negación "${m[0]}". Debe ser afirmativo: "Ist <Name> für den Vorschlag?"`));
    }
  }

  // Homogeneous pattern: all questions start with "Ist " and end with "?" (IMPORTANT)
  const nonAffirmative = t4qs.filter(q => !/^Ist\s/i.test(q.question || '') || !/\?$/.test(q.question || ''));
  if (nonAffirmative.length > 0) {
    findings.push(finding('CHK-7', 'IMPORTANT', file, nonAffirmative[0].id,
      `Lesen T4: ${nonAffirmative.length} pregunta(s) no siguen el patrón "Ist <Name> für …?"`));
  }

  // Coherence: signText stance vs correct (IMPORTANT, heuristic)
  for (const q of t4qs) {
    const st = (q.signText || '').toLowerCase();
    const correct = String(q.correct || '').trim();
    const hasNein = T4_NEIN_MARKERS.some(m => st.includes(m));
    const hasJa   = T4_JA_MARKERS.some(m => st.includes(m));
    const hasTrotzdem = /trotzdem|obwohl|dennoch|zwar/.test(st);

    if (hasNein && !hasTrotzdem && correct === 'Ja') {
      findings.push(finding('CHK-7', 'IMPORTANT', file, q.id,
        `Lesen T4: signText sugiere NEIN ("${T4_NEIN_MARKERS.find(m=>st.includes(m))}") pero correct="${correct}". Revisar manualmente.`));
    }
    if (hasJa && !hasNein && correct === 'Nein') {
      findings.push(finding('CHK-7', 'IMPORTANT', file, q.id,
        `Lesen T4: signText sugiere JA ("${T4_JA_MARKERS.find(m=>st.includes(m))}") pero correct="${correct}". Revisar manualmente.`));
    }

    // Meta-tag antinatural (MINOR)
    if (/\bimplizit\b|\bexplizit\b/i.test(q.signText || '')) {
      findings.push(finding('CHK-7', 'MINOR', file, q.id,
        `Lesen T4: signText contiene meta-etiqueta antinatural ("implizit"/"explizit"). Reformula de forma natural.`));
    }
  }

  // Balance Ja/Nein per file (IMPORTANT)
  const jaCount  = t4qs.filter(q => String(q.correct).toLowerCase() === 'ja').length;
  const neinCount = t4qs.length - jaCount;
  if (t4qs.length === 7 && (jaCount < 3 || jaCount > 4)) {
    findings.push(finding('CHK-7', 'IMPORTANT', file, 'T4-balance',
      `Lesen T4: balance Ja/Nein = ${jaCount}/${neinCount}. Se esperan 3–4 Ja y 3–4 Nein.`));
  }

  return findings;
}

// ─── CHK-8: Basic integrity ────────────────────────────────────────────────

function chk8(batch, file, globalIds) {
  const findings = [];
  const passageIds = new Set((batch.passages || []).map(p => p.id));
  const REQUIRED = ['id','module','teil','type','question','correct','correctAnswer'];

  for (const q of batch.questions || []) {
    // Required fields
    for (const field of REQUIRED) {
      if (q[field] == null || q[field] === '') {
        findings.push(finding('CHK-8', 'CRITICAL', file, q.id || '?',
          `Campo obligatorio faltante: "${field}"`));
      }
    }
    // Global ID uniqueness
    if (q.id) {
      if (globalIds.has(q.id)) {
        findings.push(finding('CHK-8', 'CRITICAL', file, q.id, `ID duplicado globalmente: ${q.id}`));
      } else {
        globalIds.add(q.id);
      }
    }
    // passageId integrity
    const needsPassage = ['lesen','horen'].includes(String(q.module || '').toLowerCase());
    if (needsPassage && q.passageId && !passageIds.has(q.passageId)) {
      findings.push(finding('CHK-8', 'CRITICAL', file, q.id,
        `passageId "${q.passageId}" no encontrado en passages[] del mismo archivo`));
    }
  }
  return findings;
}

// ─── CHK-10: Lenguaje absoluto en Lesen T1 ────────────────────────────────
// Palabras absolutas en ítems RICHTIG hacen el ítem trivialmente correcto (word-match).
// En ítems FALSCH son scope traps legítimas (el Goethe real las usa): no se penalizan.
// La frase "ausschließlich täglich" se penaliza siempre por ser artificialmente obvia.

const ABSOLUTE_WORDS_RE = /\b(immer|nie|niemals|alle[rsn]?|ausschließlich|komplett|völlig|keinerlei|jede[rsn]?|stets|grundsätzlich|absolut|durchgehend|generell)\b/i;
const ABSOLUTE_PHRASE_RE = /ausschließlich\s+täglich/i;

function chk10(batch, file) {
  const findings = [];
  const rfItems = (batch.questions || []).filter(q =>
    q.module === 'lesen' && q.teil === 1 &&
    (q.type === 'richtig_falsch' || q.type === 'true_false'));

  if (rfItems.length === 0) return findings;

  const isFalsch  = q => /^falsch$/i.test(String(q.correct || q.correctAnswer || ''));
  const isRichtig = q => /^richtig$/i.test(String(q.correct || q.correctAnswer || ''));
  const hasAbs    = q => ABSOLUTE_WORDS_RE.test(q.question || '');

  // Frase artificial: siempre IMPORTANT
  for (const q of rfItems) {
    if (ABSOLUTE_PHRASE_RE.test(q.question || '')) {
      findings.push(finding('CHK-10', 'IMPORTANT', file, q.id,
        `Lesen T1: frase artificial "ausschließlich täglich" — reescribir como contradicción de contenido.`));
    }
  }

  const absItems   = rfItems.filter(hasAbs);
  const absFalsch  = absItems.filter(isFalsch);
  const absRichtig = absItems.filter(isRichtig);

  // (1) Sobre-uso: >2 de 6 enunciados con palabra absoluta
  if (absItems.length > 2) {
    findings.push(finding('CHK-10', 'IMPORTANT', file, absItems[0].id,
      `Lesen T1: ${absItems.length} de ${rfItems.length} enunciados usan palabra de alcance (sobre-uso) — el examen se vuelve adivinable.`));
  }
  // (2) Correlación perfecta: ≥2 con absoluta y TODAS en Falsch (0 en Richtig) → "absoluta ⟹ Falsch"
  else if (absItems.length >= 2 && absRichtig.length === 0) {
    findings.push(finding('CHK-10', 'IMPORTANT', file, absFalsch[0].id,
      `Lesen T1: la palabra de alcance predice la respuesta (${absFalsch.length}/${absItems.length} en Falsch, 0 en Richtig). Reparte entre Richtig y Falsch o elimina.`));
  }
  // (3) Un solo caso aislado → MINOR (aceptable, pero a vigilar)
  else if (absItems.length === 1) {
    findings.push(finding('CHK-10', 'MINOR', file, absItems[0].id,
      `Lesen T1: 1 enunciado con palabra de alcance («${(absItems[0].question||'').match(ABSOLUTE_WORDS_RE)?.[0]}») — ok si no predice la respuesta.`));
  }

  return findings;
}

// ─── CHK-9: Beispiel ausente ──────────────────────────────────────────────

const BEISPIEL_TEILE = new Set(['lesen-1','lesen-4','horen-3','horen-4']);

function chk9(batch, file) {
  const findings = [];
  const groups = new Set();
  for (const q of batch.questions || []) {
    const key = bpKey(q);
    if (!BEISPIEL_TEILE.has(key)) continue;
    if (groups.has(key)) continue;
    // Check if any question has beispiel/example marker
    const hasBsp = (batch.questions || []).some(x =>
      bpKey(x) === key && (x.beispiel || x.example || /beispiel|muster/i.test(x.question || ''))
    );
    if (!hasBsp) {
      groups.add(key);
      findings.push(finding('CHK-9', 'INFO', file, key,
        `${key}: el examen oficial incluye un ítem "Beispiel (0)" resuelto. El modelo de datos no lo representa.`));
    }
  }
  return findings;
}

// ─── CHK-11: Hören T4 — coherencia clave↔hablante + anti-copia ────────────

const CHK11_CRITIQUE_RE = /\b(bemängelt|kritisiert|beklagt|lehnt ab|ist dagegen)\b/i;
const CHK11_NEGATIVE_RE = /\b(nicht|kein\w*|problem|schwierig|gegen|schlecht|negativ)\b/i;

function chk11(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    q.module === 'horen' && Number(q.teil) === 4
  );
  if (!t4qs.length) return findings;

  // Build passage text map for anti-copy check
  const passageMap = {};
  for (const p of batch.passages || []) {
    passageMap[p.id] = (p.text || '').toLowerCase();
  }

  // Check each speaker option appears at least once in correct answers
  const correctVals = t4qs.map(q => q.correct || q.correctAnswer).filter(Boolean);
  const speakersSeen = new Set(correctVals);
  const expectedSpeakers = new Set(['a', 'b', 'c']);
  for (const sp of expectedSpeakers) {
    if (!speakersSeen.has(sp)) {
      findings.push(finding('CHK-11', 'IMPORTANT', file, 'T4-hablantes',
        `Hören T4: el hablante "${sp}" nunca es la respuesta correcta — posible desequilibrio de postura.`));
    }
  }

  for (const q of t4qs) {
    const qText = (q.question || '').toLowerCase();
    const pid = q.passageId;
    const pText = pid ? (passageMap[pid] || '') : '';

    // Anti-copia: enunciado no debe compartir ≥5 palabras consecutivas con el pasaje
    if (pText) {
      const qWords = qText.split(/\s+/).filter(w => w.length >= 4);
      if (qWords.length >= 5) {
        for (let i = 0; i <= qWords.length - 5; i++) {
          const chunk = qWords.slice(i, i + 5).join(' ');
          if (pText.includes(chunk)) {
            findings.push(finding('CHK-11', 'IMPORTANT', file, q.id,
              `Hören T4: enunciado comparte ≥5 palabras consecutivas con el pasaje ("${chunk}") — paráfrasis obligatoria.`));
            break;
          }
        }
      }
    }

    // Lint verbo↔postura: verbo de crítica sin marcador negativo en el hablante
    if (CHK11_CRITIQUE_RE.test(q.question || '') && pText && !CHK11_NEGATIVE_RE.test(pText)) {
      findings.push(finding('CHK-11', 'IMPORTANT', file, q.id,
        `Hören T4: enunciado con verbo de crítica (bemängelt/kritisiert…) pero los turnos del hablante no contienen marcadores negativos — posible inversión de postura: revisar manualmente.`));
    }
  }
  return findings;
}

// ─── Load batches ──────────────────────────────────────────────────────────

function flattenExam(examObj) {
  // Aplanar un examen ensamblado {lesenParts, horenParts, ...} a {passages, questions}
  const passages = [];
  const questions = [];
  const MODMAP = { lesenParts: 'lesen', horenParts: 'horen', schreibenParts: 'schreiben', sprechenParts: 'sprechen' };
  for (const [arrKey, module] of Object.entries(MODMAP)) {
    for (const part of examObj[arrKey] || []) {
      const teil = Number(part.teil);

      // Pasajes embebidos en array (ej. Lesen T2 con 2 pasajes: part.passages[])
      if (Array.isArray(part.passages) && part.passages.length > 0) {
        for (const p of part.passages) {
          passages.push({ id: p.id || `${module}-${teil}`, title: p.title || '', text: p.text || '' });
        }
      } else if (part.passageId || part.text) {
        // Pasaje único inline
        passages.push({ id: part.passageId || `${module}-${teil}`, title: part.textTitle || '', text: part.text || '' });
      }

      // Preguntas directas de la parte
      for (const q of part.questions || []) {
        questions.push({ ...q, module, teil, passageId: q.passageId || part.passageId });
      }
      // Hören: preguntas anidadas en segments[]
      for (const seg of part.segments || []) {
        if (seg.text || seg.transcript) {
          passages.push({ id: seg.passageId || `${module}-${teil}-seg`, title: seg.label || '', text: seg.text || seg.transcript || '' });
        }
        for (const q of seg.questions || []) {
          questions.push({ ...q, module, teil, passageId: q.passageId || seg.passageId });
        }
      }
    }
  }
  return { passages, questions };
}

/**
 * loadBatchFile: devuelve siempre un array de batches.
 * - Batch simple → [batch]
 * - Examen ensamblado individual → [flattenExam(exam)]
 * - Array de exámenes → [flattenExam(exam1), flattenExam(exam2), …]
 *   (cada examen se audita por separado para que CHK-3 verifique conteos por examen)
 */
function loadBatchFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Array de exámenes ensamblados: [{id, exam:{lesenParts,...}}, ...]
  if (Array.isArray(raw)) {
    return raw.map(item => {
      const examObj = item.exam || (item.lesenParts || item.horenParts ? item : null);
      return examObj ? flattenExam(examObj) : { passages: [], questions: [] };
    });
  }

  // Examen ensamblado individual: {id, exam:{lesenParts,...}} o {lesenParts,...}
  const exam = raw.exam || (raw.lesenParts || raw.horenParts || raw.schreibenParts || raw.sprechenParts ? raw : null);
  if (exam) {
    return [flattenExam(exam)];
  }

  // Pool plano {meta, passages, questions} o batch {passages, questions}
  return [{
    passages: raw.passages || [],
    questions: raw.questions || [],
  }];
}

function collectFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { recursive: true })
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.includes('.rejected'))
    .map(f => path.join(target, f))
    .filter(f => !path.basename(f).startsWith('.'));
}

// ─── Fix-types helper ──────────────────────────────────────────────────────

function fixTypes(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  let changed = 0;
  for (const q of data.questions || []) {
    if (q.type === 'multiple') { q.type = 'multiple_choice'; changed++; }
    if (q.questionType === 'multiple') { q.questionType = 'multiple_choice'; changed++; }
  }
  if (changed > 0) {
    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  return changed;
}

// ─── Output helpers ────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY;
const C = {
  red:    s => USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s,
  grey:   s => USE_COLOR ? `\x1b[90m${s}\x1b[0m` : s,
  bold:   s => USE_COLOR ? `\x1b[1m${s}\x1b[0m` : s,
  green:  s => USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s,
};

function sevColor(sev) {
  if (sev === 'CRITICAL') return C.red(sev);
  if (sev === 'IMPORTANT') return C.yellow(sev);
  return C.grey(sev);
}

function printFindings(findings, summaryOnly) {
  // INFO findings are never printed (structural notes, not actionable)
  const printable = findings.filter(f => f.severity !== 'INFO');

  if (!summaryOnly) {
    // Group by CHK id
    const byChk = {};
    for (const f of printable) {
      if (!byChk[f.id]) byChk[f.id] = [];
      byChk[f.id].push(f);
    }
    for (const [chk, flist] of Object.entries(byChk).sort()) {
      console.log(C.bold(`\n── ${chk} (${flist.length}) ──`));
      for (const f of flist) {
        console.log(`  [${sevColor(f.severity)}] ${C.grey(f.file)} ${f.scope ? C.grey(`(${f.scope})`) : ''}`);
        console.log(`    ${f.message}`);
      }
    }
  }

  const counts = { CRITICAL: 0, IMPORTANT: 0, MINOR: 0 };
  for (const f of printable) counts[f.severity] = (counts[f.severity] || 0) + 1;

  console.log(C.bold('\n══ RESUMEN ══'));
  console.log(`  ${C.red('CRÍTICOS')}:   ${counts.CRITICAL}`);
  console.log(`  ${C.yellow('IMPORTANTES')}: ${counts.IMPORTANT}`);
  console.log(`  ${C.grey('MENORES')}:    ${counts.MINOR}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { target: null, json: false, failOn: 'CRITICAL', fixTypes: false, summaryOnly: false };
  for (const a of argv.slice(2)) {
    if (a === '--json') args.json = true;
    else if (a === '--fix-types') args.fixTypes = true;
    else if (a === '--summary-only') args.summaryOnly = true;
    else if (a.startsWith('--fail-on=')) args.failOn = a.split('=')[1].toUpperCase();
    else if (!a.startsWith('--')) args.target = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.target) {
    console.error('Uso: node scripts/audit-pass-2.mjs <ruta> [--json] [--fail-on=CRITICAL] [--fix-types] [--summary-only]');
    process.exit(2);
  }

  const target = path.resolve(args.target);
  if (!fs.existsSync(target)) {
    console.error(`No existe: ${target}`);
    process.exit(2);
  }

  const files = collectFiles(target);
  if (!args.json && !args.summaryOnly) {
    console.log(C.bold(`\nAuditando ${files.length} archivo(s) en ${target}`));
  }

  // Fix-types pass (before audit)
  if (args.fixTypes) {
    let totalFixed = 0;
    for (const f of files) {
      const n = fixTypes(f);
      if (n > 0 && !args.json) console.log(`  fix-types: ${path.basename(f)} → ${n} correcciones (backup .bak)`);
      totalFixed += n;
    }
    if (!args.json) console.log(`  Total corregido: ${totalFixed} ocurrencias de type:"multiple"`);
  }

  // Load all batches (loadBatchFile returns array of batches per file)
  const allBatches = [];
  let questionsScanned = 0;
  for (const f of files) {
    try {
      const batches = loadBatchFile(f);
      for (const batch of batches) {
        allBatches.push({ batch, file: f });
        questionsScanned += (batch.questions || []).length;
      }
    } catch (e) {
      if (!args.json) console.warn(`  Saltando ${path.basename(f)}: ${e.message}`);
    }
  }

  // Run per-file checks
  const globalIds = new Set();
  const allFindings = [];

  for (const { batch, file } of allBatches) {
    allFindings.push(...chk1(batch, file));
    allFindings.push(...chk2(batch, file));
    allFindings.push(...chk3(batch, file));
    allFindings.push(...chk4(batch, file));
    allFindings.push(...chk6(batch, file));
    allFindings.push(...chk7(batch, file));
    allFindings.push(...chk8(batch, file, globalIds));
    allFindings.push(...chk9(batch, file));
    allFindings.push(...chk10(batch, file));
    allFindings.push(...chk11(batch, file));
  }

  // Global checks
  allFindings.push(...chk5(allBatches));

  // Output
  const counts = { critical: 0, important: 0, minor: 0 };
  for (const f of allFindings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'IMPORTANT') counts.important++;
    else if (f.severity === 'MINOR') counts.minor++;
    // INFO is intentionally excluded from counts and summary
  }

  if (args.json) {
    console.log(JSON.stringify({
      summary: { ...counts, filesScanned: files.length, questionsScanned },
      findings: allFindings,
    }, null, 2));
  } else {
    printFindings(allFindings, args.summaryOnly);
    if (!args.summaryOnly) {
      console.log(`\n  Archivos escaneados: ${files.length} | Preguntas: ${questionsScanned}`);
    }
  }

  // Exit code
  if (args.failOn !== 'NONE') {
    const failLevel = SEV[args.failOn] ?? SEV.CRITICAL;
    const worstSev = allFindings.reduce((max, f) => Math.max(max, SEV[f.severity] ?? 0), 0);
    if (worstSev >= failLevel) process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(2); });
