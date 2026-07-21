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
  richtig_falsch:  v => ['Richtig','Falsch','R','F'].includes(v) || /^(richtig|falsch|true|false|r|f)$/i.test(v),
  ja_nein:         v => ['Ja','Nein','J','N'].includes(v)        || /^(ja|nein|j|n|yes|no)$/i.test(v),
  matching:        v => /^[a-jA-J0]$/.test(v),
  // Renderer stores the user's click as optKey() → a single letter (any case).
  // Grading uses normalizeGradingToken() which calls .toLowerCase().
  // Both "A" and "a" grade correctly.  Accept a–d (case-insensitive) to cover
  // parts with up to 4 options (some Lesen T2 / Hören T2 records).
  multiple_choice: v => /^[a-dA-D]$/.test(v),
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

// ─── CHK-3b: Teile completamente ausentes (solo modo examen completo) ─────
// chk3 ya detecta conteos incorrectos para los Teile PRESENTES.
// chk3Absent añade: si un Teil esperado tiene 0 ítems → CRITICAL "Teil ausente".
// Solo se llama desde auditExam — nunca en auditorías de batch/parte suelta.
function chk3Absent(flat, file) {
  const findings = [];
  const presentKeys = new Set();
  for (const q of flat.questions || []) {
    const key = bpKey(q);
    if (BLUEPRINT[key]) presentKeys.add(key);
  }
  for (const [key, spec] of Object.entries(BLUEPRINT)) {
    if (spec.count === null) continue; // short_answer / sprechen = conteo variable
    if (!presentKeys.has(key)) {
      findings.push(finding('CHK-3', 'CRITICAL', file, key,
        `${key}: se esperan ${spec.count} ítems, hay 0 (Teil ausente)`));
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
      // All 3 letters must appear at least once (enforced for ≥5 MC items — V-18 fix:
      // was n≥6, but n=5 with one missing letter still indicates answer-key bias).
      if (n >= 5) {
        const letters = ['a','b','c'];
        for (const letter of letters) {
          if (!dist[letter]) {
            findings.push(finding('CHK-4', 'IMPORTANT', file, key,
              `Balance MC: letra "${letter}" no aparece ninguna vez. Dist: ${JSON.stringify(dist)}`));
          }
        }
      }
      // No single letter > 65% (allows 3/5=60% which is acceptable with few items).
      // ≥75% with n≥5 is CRITICAL (adivinable: marcar siempre esa letra = ≥75% score).
      for (const [v, cnt] of Object.entries(dist)) {
        const pct = cnt / n;
        const limit = key.startsWith('horen-4') && v === 'a' ? 0.50 : 0.65;
        if (pct > limit) {
          const sev = (n >= 5 && pct >= 0.75) ? 'CRITICAL' : 'IMPORTANT';
          findings.push(finding('CHK-4', sev, file, key,
            `Balance MC: "${v}"=${Math.round(pct*100)}% supera el máximo ${Math.round(limit*100)}%${sev === 'CRITICAL' ? ' (≥75% con n≥5 = adivinable)' : ''}. Dist: ${JSON.stringify(dist)}`));
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

  // Homogeneous pattern: accept "Ist <Name> für …?" OR "Sagt die Person: …" (IMPORTANT if neither)
  const isValidT4Question = (q) => {
    const question = q.question || '';
    return (/^Ist\s/i.test(question) && /\?$/.test(question)) ||
           /^Sagt die Person:/i.test(question);
  };
  const nonAffirmative = t4qs.filter(q => !isValidT4Question(q));
  if (nonAffirmative.length > 0) {
    findings.push(finding('CHK-7', 'IMPORTANT', file, nonAffirmative[0].id,
      `Lesen T4: ${nonAffirmative.length} pregunta(s) no siguen el patrón "Ist <Name> für …?" ni "Sagt die Person: …"`));
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

// ─── CHK-10: Lenguaje absoluto en Lesen T1 y Hören T1 ────────────────────
// Palabras absolutas en ítems RICHTIG hacen el ítem trivialmente correcto (word-match).
// En ítems FALSCH son scope traps legítimas (el Goethe real las usa): no se penalizan.
// La frase "ausschließlich täglich" se penaliza siempre por ser artificialmente obvia.

const ABSOLUTE_WORDS_RE = /\b(immer|nie|niemals|alle[rsn]?|ausschließlich|komplett|völlig|keinerlei|jede[rsn]?|stets|grundsätzlich|absolut|durchgehend|generell)\b/i;
const ABSOLUTE_PHRASE_RE = /ausschließlich\s+täglich/i;

function chk10(batch, file) {
  const findings = [];
  // Evalúa lesen T1 y horen T1 con la misma lógica de correlación
  for (const [mod, teil] of [['lesen', 1], ['horen', 1]]) {
    const rfItems = (batch.questions || []).filter(q =>
      q.module === mod && Number(q.teil) === teil &&
      (q.type === 'richtig_falsch' || q.type === 'true_false'));
    if (rfItems.length === 0) continue;

    const isFalsch  = q => /^falsch$/i.test(String(q.correct || q.correctAnswer || ''));
    const isRichtig = q => /^richtig$/i.test(String(q.correct || q.correctAnswer || ''));
    const hasAbs    = q => ABSOLUTE_WORDS_RE.test(q.question || '');

    // Frase artificial: siempre IMPORTANT
    for (const q of rfItems) {
      if (ABSOLUTE_PHRASE_RE.test(q.question || '')) {
        findings.push(finding('CHK-10', 'IMPORTANT', file, q.id,
          `${mod} T1: frase artificial "ausschließlich täglich" — reescribir como contradicción de contenido.`));
      }
    }

    const absItems   = rfItems.filter(hasAbs);
    const absFalsch  = absItems.filter(isFalsch);
    const absRichtig = absItems.filter(isRichtig);

    // (1) Sobre-uso: >~33% de los RF con palabra absoluta
    if (absItems.length > Math.ceil(rfItems.length / 3)) {
      findings.push(finding('CHK-10', 'IMPORTANT', file, absItems[0].id,
        `${mod} T1: ${absItems.length}/${rfItems.length} enunciados con palabra de alcance (sobre-uso, adivinable).`));
    }
    // (2) Correlación perfecta: ≥2 con absoluta y TODAS en Falsch (0 en Richtig) → "absoluta ⟹ Falsch"
    else if (absItems.length >= 2 && absRichtig.length === 0) {
      findings.push(finding('CHK-10', 'IMPORTANT', file, absFalsch[0].id,
        `${mod} T1: la palabra de alcance predice la respuesta (${absFalsch.length} en Falsch, 0 en Richtig).`));
    }
    // (3) Un solo caso aislado → MINOR (aceptable, pero a vigilar)
    else if (absItems.length === 1) {
      findings.push(finding('CHK-10', 'MINOR', file, absItems[0].id,
        `${mod} T1: 1 enunciado con palabra de alcance («${(absItems[0].question||'').match(ABSOLUTE_WORDS_RE)?.[0]}») — ok si no predice la respuesta.`));
    }
  }
  return findings;
}

// ─── CHK-12: Balance Richtig/Falsch en bloques R/F ────────────────────────
// Para cada (módulo,teil) con ítems richtig_falsch: ninguna respuesta debe superar el 70 %.

function chk12(batch, file) {
  const findings = [];
  const groups = {};
  for (const q of batch.questions || []) {
    if (q.type !== 'richtig_falsch' && q.type !== 'true_false') continue;
    const key = `${q.module}-${q.teil}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(String(q.correct || q.correctAnswer || ''));
  }
  for (const [k, arr] of Object.entries(groups)) {
    if (arr.length < 4) continue;
    const r = arr.filter(x => /^richtig$/i.test(x)).length;
    const share = Math.max(r, arr.length - r) / arr.length;
    if (share > 0.70) {
      findings.push(finding('CHK-12', 'IMPORTANT', file, k,
        `${k}: bloque R/F desbalanceado (${r}R/${arr.length - r}F = ${Math.round(share * 100)}% una respuesta). Máx 70%.`));
    }
  }
  return findings;
}

// ─── CHK-13: MC debe usar las 3 letras, ninguna > 55 % ───────────────────
// Para cada (módulo,teil) con multiple_choice de 3 opciones y ≥3 ítems.

function chk13(batch, file) {
  const findings = [];
  const groups = {};
  for (const q of batch.questions || []) {
    if (q.type !== 'multiple_choice') continue;
    if (!Array.isArray(q.options) || q.options.length !== 3) continue;
    const key = `${q.module}-${q.teil}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(String(q.correct || q.correctAnswer || '').toLowerCase());
  }
  for (const [k, arr] of Object.entries(groups)) {
    if (arr.length < 3) continue;
    const present = new Set(arr);
    const missing = ['a', 'b', 'c'].filter(L => !present.has(L));
    const top = Math.max(...['a', 'b', 'c'].map(L => arr.filter(x => x === L).length)) / arr.length;
    if (missing.length) {
      findings.push(finding('CHK-13', 'IMPORTANT', file, k,
        `${k}: MC no usa la(s) letra(s) ${missing.join(',')} en ningún ítem.`));
    } else if (top > 0.55) {
      findings.push(finding('CHK-13', 'IMPORTANT', file, k,
        `${k}: una letra MC supera el 55% (${Math.round(top * 100)}%).`));
    }
  }
  return findings;
}

// ─── CHK-14: Sustantivos alemanes en minúscula ────────────────────────────
// Dos capas de detección, ambas de baja tasa de falsos positivos:
//
//  Capa A — Sufijos exclusivamente nominales: palabras que terminan en -ung,
//    -heit, -keit, -schaft, -tum, -nis (plurales incluidos) escritas en
//    minúscula después de un artículo. Prácticamente imposible que sean
//    adjetivos o verbos, así que el falso-positivo es casi nulo.
//
//  Capa B — Lista explícita de sustantivos comunes que el LLM olvida
//    capitalizar con frecuencia (detectados empíricamente en el banco).

// CHK-14 triggers after these articles/conjunctions/prepositions.
// Flag /gi so sentence-initial capitals (Der, Die, Das, Kein, Keine…) also match;
// the captured word is then checked separately for lowercase-start.
const ARTICLE_RE_14 = /\b(?:die|der|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines|und|oder|mit|für|ohne|durch|um|bei|nach|seit|von|vor|über|unter|neben|zwischen|je)\s+(\S{4,})/gi;

// Nominal suffixes that are unambiguously nouns (never adjectives/verbs).
// Extended: added -bau, -gut, -werk, -stoff, -zeug, -tat to catch compound nouns.
const NOUN_SUFFIX_RE_14 = /(ung|heit|keit|schaft|tum|nis|nisse|sal|bau|werk|stoff|zeug|tat|ion|ität|ismus|ation|anz|enz|ur|tur|ör)s?$/i;

// Known frequently-miscapitalized nouns — empirical list extended with:
//  • English loanwords used as German nouns (must be capitalized in German)
//  • German nouns with "tricky" endings not covered by NOUN_SUFFIX_RE_14
//  • Nouns from B1 topic areas where LLMs make consistent mistakes
//
// NOTE: "junge" (Junge=boy) and "arbeiten" (Arbeiten=works) are intentionally
// NOT included because they are far more commonly used as adjective/verb and
// produce too many false positives after "der/für/und" in normal sentences.
const KNOWN_LOWER_NOUNS_14 = new Set([
  // ── Everyday nouns ──
  'blumen','blume','garten','gärten','straße','straßen','weg','wege',
  'schule','schulen','lehrer','lehrerin','freund','freunde','freundin',
  'arbeit','wohnung','wohnungen','zimmer','küche','keller',
  'sonne','mond','stern','sterne','erde','himmel','berg','berge',
  'wald','wälder','fluss','flüsse','see','seen','meer','insel',
  'hund','hunde','katze','katzen','vogel','vögel','fisch','fische',
  'tisch','tische','stuhl','stühle','fenster','tür','türen',
  'buch','bücher','film','filme','sport','musik','kunst','theater',
  'mann','männer','frau','frauen','kind','kinder','mädchen',
  'familie','familien','eltern','mutter','vater','bruder','schwester',
  'arzt','ärzte','krankenhaus','apotheke','polizei','feuerwehr',
  'bahnhof','flughafen','hotel','restaurant','geschäft','laden',
  'land','länder','stadt','städte','dorf','dörfer','platz','plätze',
  'markt','märkte','park','parks','brunnen','statue',
  // ── Nouns with -e/-en endings (not covered by suffix regex) ──
  'hypothese','these','analyse','phrase','szene','stunde',
  'woche','pause','gruppe','klasse','aufgabe','frage','antwort',
  'reise','sprache','sprachen','übung','regel','stelle',
  // ── Compound nouns ending in -bau,-werk,-stoff etc. ──
  'wohnungsbau','hausbau','stadtbau','ausbau','umbau','neubau',
  'handwerk','kunstwerk','bauwerk','netzwerk','fahrzeug','werkzeug',
  // ── English loanwords used as German nouns (MUST be capitalized) ──
  'deadline','meeting','team','job','hobby','computer','internet',
  'email','video','blog','podcast','app','clip','link','post',
  'chat','design','trend','event','ticket','coach','fan','kit',
  'check','deal','feedback','update','upgrade','login','logout',
  'workshop','startup','backup','download','upload','streaming',
  'hashtag','selfie','smartphone','laptop','tablet','server',
]);

// Words that might be captured by ARTICLE_RE_14 but are NOT nouns —
// commonly adjectives, adverbs, or verbs in German.
// These are excluded to prevent false positives.
const KNOWN_NOT_NOUNS_14 = new Set([
  'ganz','halb','alle','jede','jeder','jedes','alles','beides',
  'junge','alte','neue','kleine','große','lange','kurze','gute','schöne',
  'erste','zweite','dritte','letzte','frühere','andere','eigene',
  'wichtige','richtige','falsche','einfache','schwierige',
  'nächste','gleiche','selbe','bestimmte','meiste',
  'arbeiten','spielen','lernen','wohnen','leben','fahren','gehen',
  'lesen','schreiben','kochen','kaufen','machen','helfen',
]);

function chk14(batch, file) {
  const findings = [];
  function extractTexts(obj, acc = []) {
    if (!obj || typeof obj !== 'object') return acc;
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 8) acc.push(v);
      else if (v && typeof v === 'object') extractTexts(v, acc);
    }
    return acc;
  }
  const texts = extractTexts(batch);
  const seen = new Set();
  for (const text of texts) {
    ARTICLE_RE_14.lastIndex = 0;
    let m;
    while ((m = ARTICLE_RE_14.exec(text)) !== null) {
      const word = m[1].replace(/[.,!?;:»«"()\[\]{}].*$/, ''); // strip trailing punctuation
      if (!word || seen.has(word.toLowerCase())) continue;
      if (!/^[a-zäöü]/.test(word)) continue; // must start lowercase
      if (KNOWN_NOT_NOUNS_14.has(word.toLowerCase())) continue; // common adj/verb false positives
      const isKnownNoun = KNOWN_LOWER_NOUNS_14.has(word.toLowerCase());
      const hasNounSuffix = NOUN_SUFFIX_RE_14.test(word);
      if (!isKnownNoun && !hasNounSuffix) continue;
      seen.add(word.toLowerCase());
      const ctx = text.slice(Math.max(0, m.index - 25), m.index + m[0].length + 30).replace(/\n/g, ' ');
      findings.push(finding('CHK-14', 'IMPORTANT', file, word,
        `Sustantivo en minúscula: "${word}" (tras artículo/conjunción). En alemán los sustantivos van en mayúscula. Contexto: "...${ctx}..."`));
    }
  }
  return findings;
}

// ─── CHK-14b: Adjetivos/adverbios alemanes capitalizados erróneamente ────────
// Complementa CHK-14 en la dirección inversa: detecta palabras de la lista
// NEVER_NOUN_WORDS que aparecen capitalizadas a mitad de frase (no al inicio).
// La lista es conservadora: solo se incluyen palabras sin forma nominal posible.
// Palabras ambiguas (Wissen, Essen, Junge, Lesen, …) se excluyen para evitar FP.

import {
  NEVER_NOUN_WORDS as _NEVER_NOUN,
  // These two sets are needed for the article guard (same logic as decapitalizer)
} from './lib/capitalizeNouns.mjs';

// Mirror the article guard constants here (can't import the unexported ones)
const _SUBSTANTIVISING_ARTICLES = new Set([
  'das','dem','des','die','der','den',
  'ein','eine','einem','einer','eines','einen',
  'kein','keine','keinem','keiner','keines','keinen',
  'dieses','diese','diesem','diesen',
  'jenes','jene','jenem','jenen',
  'welches','welche','welchem','welchen',
  'manches','manche','manchem','manchen',
  'solches','solche','solchem','solchen',
  'etwas','nichts','alles','vieles','weniges',
  'als',
]);

// Pure adverbs (no article guard needed — no Substantivierungsform exists)
const _PURE_ADVERBS_14B = new Set([
  'eher','gerne','gern','leider','vielleicht','bereits','sogar','wirklich',
  'natürlich','eigentlich','trotzdem','allerdings','außerdem','jedoch',
  'dennoch','deshalb','deswegen',
]);

const SENTENCE_END_RE_14B = /[.!?:]\s*$/;

function chk14b(batch, file) {
  const findings = [];
  function collectTexts(obj, acc = []) {
    if (!obj || typeof obj !== 'object') return acc;
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 4) acc.push(v);
      else if (v && typeof v === 'object') collectTexts(v, acc);
    }
    return acc;
  }

  const texts = collectTexts(batch);
  const seen = new Set();

  for (const text of texts) {
    const tokenRe = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
    const tokens = [];
    let m;
    while ((m = tokenRe.exec(text)) !== null) {
      tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });
    }

    let prevContent = '';
    let lastWord = '';

    for (const tok of tokens) {
      if (!tok.isWord) { prevContent += tok.val; continue; }

      const fc = tok.val[0];
      const isCapitalized = (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';

      if (isCapitalized) {
        const lc = tok.val.toLowerCase();
        const isMidSentence = prevContent.length > 0 && !SENTENCE_END_RE_14B.test(prevContent);

        if (isMidSentence && _NEVER_NOUN.has(lc) && !seen.has(lc)) {
          // Apply article guard for adjectives (but not pure adverbs)
          const isArticlePreceding = _SUBSTANTIVISING_ARTICLES.has(lastWord.toLowerCase());
          if (!_PURE_ADVERBS_14B.has(lc) && isArticlePreceding) {
            // "das Schwierige" / "das Mögliche" — legitimate noun, skip
          } else {
            seen.add(lc);
            const start = Math.max(0, tok.pos - 35);
            const end   = Math.min(text.length, tok.pos + tok.val.length + 35);
            const ctx   = text.slice(start, end).replace(/\n/g, ' ');
            findings.push(finding('CHK-14', 'IMPORTANT', file, tok.val,
              `Adjetivo/adverbio "${tok.val}" en mayúscula errónea (debería ser "${lc}"). Contexto: "...${ctx}..."`));
          }
        }
      }

      prevContent += tok.val;
      lastWord = tok.val;
    }
  }
  return findings;
}

// ─── CHK-15: Word count de pasajes/transcripts vs blueprint ──────────────
// Cada Teil tiene un rango de palabras establecido en el Modellsatz oficial.
// Se cuenta el texto principal de cada pasaje o transcript.

// Rangos calibrados a partir del Modellsatz oficial Goethe B1:
//   L1: blog ~180 palabras · L2: prensa ~160-200/texto · L3: anuncio ~30-60
//   L4: opinión foro ~40-100 (Modellsatz real: Stefan ~75, Dagmar ~50 etc.)
//   L5: reglamento/aviso ~180-220
//   H1: segmento ~50-85 · H2: monólogo ~250-300 · H3: diálogo ~280-350 · H4: debate ~320-420
const WORD_COUNT_SPEC = {
  'lesen-1':  { min: 140, max: 260, scope: 'passage text (blog/email)' },
  'lesen-2':  { min: 130, max: 250, scope: 'cada passage individual (prensa, 2 textos)' },
  'lesen-3':  { min: 15,  max: 80,  scope: 'cada anuncio/opción' },
  'lesen-4':  { min: 25,  max: 110, scope: 'intro text o signText (opinión foro ~40-100 palabras)' },
  'lesen-5':  { min: 130, max: 280, scope: 'passage text (reglamento/aviso)' },
  'horen-1':  { min: 30,  max: 110, scope: 'cada segmento/transcript' },
  'horen-2':  { min: 180, max: 380, scope: 'transcript monólogo' },
  'horen-3':  { min: 200, max: 400, scope: 'transcript conversación' },
  'horen-4':  { min: 250, max: 480, scope: 'transcript debate (3 hablantes)' },
};

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(w => w.length > 0).length;
}

function chk15(batch, file) {
  const findings = [];

  // Check passages (lesen)
  for (const p of batch.passages || []) {
    const text = p.text || '';
    if (!text || text.length < 10) continue;

    // Determine which Teil this passage belongs to via questions referencing it
    const refQ = (batch.questions || []).find(q => q.passageId === p.id);
    if (!refQ) continue;
    const key = `${(refQ.module||'').toLowerCase()}-${refQ.teil}`;
    const spec = WORD_COUNT_SPEC[key];
    if (!spec) continue;

    const wc = countWords(text);
    if (wc < spec.min) {
      findings.push(finding('CHK-15', 'IMPORTANT', file, p.id,
        `${key} pasaje demasiado corto: ${wc} palabras (mín ${spec.min}). Scope: ${spec.scope}`));
    } else if (wc > spec.max) {
      findings.push(finding('CHK-15', 'IMPORTANT', file, p.id,
        `${key} pasaje demasiado largo: ${wc} palabras (máx ${spec.max}). Scope: ${spec.scope}`));
    }
  }

  // Check L4 signTexts (they are in questions, not passages)
  const l4qs = (batch.questions || []).filter(q =>
    String(q.module||'').toLowerCase() === 'lesen' && Number(q.teil) === 4 && q.signText);
  const l4spec = WORD_COUNT_SPEC['lesen-4'];
  for (const q of l4qs) {
    const wc = countWords(q.signText);
    if (wc < l4spec.min) {
      findings.push(finding('CHK-15', 'IMPORTANT', file, q.id,
        `lesen-4 signText demasiado corto: ${wc} palabras (mín ${l4spec.min}). Opinión debe ser substantiva.`));
    } else if (wc > l4spec.max) {
      findings.push(finding('CHK-15', 'IMPORTANT', file, q.id,
        `lesen-4 signText demasiado largo: ${wc} palabras (máx ${l4spec.max}). Opinión debe ser concisa.`));
    }
  }

  return findings;
}

// ─── CHK-16: Anti word-matching — L1 y H3 ────────────────────────────────
// Los enunciados de L1 y H3 NO deben copiar frases del pasaje/transcript.
// Copia verbatim de 4+ palabras de contenido consecutivas es un indicio de
// "word-matching" que hace el ítem trivialmente resoluble sin leer el texto.

const STOP_WORDS_16 = new Set([
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer','eines',
  'und','oder','aber','mit','von','zu','in','an','auf','für','ist','sind','war',
  'hat','hat','sein','haben','werden','dass','nicht','auch','als','bei','nach',
  'sie','er','es','ich','wir','ihr','du','man','sich','wie','so','mehr','noch',
  'aber','doch','weil','wenn','da','dann','schon','sehr','immer','nur','alle',
]);

function contentTokens16(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS_16.has(w));
}

function chk16(batch, file) {
  const findings = [];
  const passageMap = {};
  for (const p of batch.passages || []) {
    if (p.text || p.title) passageMap[p.id] = `${p.title || ''} ${p.text || ''}`;
  }

  const TARGETS = [
    { mod: 'lesen', teil: 1, type: 'richtig_falsch', window: 4 },
    { mod: 'horen', teil: 3, type: 'richtig_falsch', window: 4 },
  ];

  for (const { mod, teil, type, window } of TARGETS) {
    const qs = (batch.questions || []).filter(q =>
      String(q.module||'').toLowerCase() === mod &&
      Number(q.teil) === teil &&
      (q.type === type || q.type === 'true_false')
    );
    if (!qs.length) continue;

    // Get passage tokens (may be multiple passages for the same teil)
    const passageIds = [...new Set(qs.map(q => q.passageId).filter(Boolean))];
    const passageTokenSet = new Set();
    const allPassageText = passageIds
      .map(pid => passageMap[pid] || '')
      .join(' ');
    const passTokens = contentTokens16(allPassageText);
    // Build 4-gram set from passage
    const passGrams = new Set();
    for (let i = 0; i <= passTokens.length - window; i++) {
      passGrams.add(passTokens.slice(i, i + window).join(' '));
    }
    if (!passGrams.size) continue;

    for (const q of qs) {
      const qTokens = contentTokens16(q.question || '');
      for (let i = 0; i <= qTokens.length - window; i++) {
        const gram = qTokens.slice(i, i + window).join(' ');
        if (passGrams.has(gram)) {
          findings.push(finding('CHK-16', 'IMPORTANT', file, q.id,
            `${mod.toUpperCase()} T${teil}: enunciado copia "${gram}" del pasaje (word-matching). Parafrasea la idea.`));
          break; // one finding per question
        }
      }
    }
  }
  return findings;
}

// ─── CHK-17: Lesen T3 — estructura y coherencia de la clave ──────────────
//
// El formato canónico de almacenamiento (oficial Goethe / runtime LexiLoop) es:
//   • options[] de 10 entradas A-J IDÉNTICAS en todos los ítems (lista duplicada físicamente).
//   • correct / correctAnswer: letra A-J (mayúscula) o "0" (sin anuncio).
//   • type: "matching".
//   El runtime construye part.ads desde question.options[]; por eso la lista DEBE vivir ahí.
//
// Tres casos posibles:
//
//  A) SHARED DUPLICADO (formato canónico): todos los ítems con options llevan la MISMA lista A-J.
//     Tratar como SHARED: validar claves A-J/0, exactamente 1 "0", sin letras repetidas.
//     → NO emitir IMPORTANT "MCQ-style".
//
//  B) PER-ITEM REAL: las options DIFIEREN entre ítems (cada uno tiene su propio set).
//     Formato estructuralmente incorrecto para B1 L3.
//     → Emitir IMPORTANT "MCQ-style per-item real".
//
//  C) MCQ A2 (options.length ≤ 3, claves a/b/c minúscula): contenido A2 de comprensión
//     lectora mal etiquetado como lesen/teil 3. No es matching B1.
//     → Emitir IMPORTANT "parece MCQ A2 → regenerar" (no CRITICAL de clave inválida).

/** Canonicaliza una línea de option para comparación (trim + colapsar espacios internos). */
function _canonOpt(s) { return String(s).trim().replace(/\s+/g, ' '); }

function chk17(batch, file) {
  const findings = [];
  const t3qs = (batch.questions || []).filter(q =>
    String(q.module||'').toLowerCase() === 'lesen' && Number(q.teil) === 3
  );
  if (!t3qs.length) return findings;

  // ── Detectar caso C (MCQ A2): todos los ítems tienen options.length ≤ 3 ──
  const itemsWithOptions = t3qs.filter(q => Array.isArray(q.options) && q.options.length > 0);
  const allShortOptions = itemsWithOptions.length > 0 &&
    itemsWithOptions.every(q => q.options.length <= 3);

  if (allShortOptions) {
    // Caso C: MCQ A2 — not matching B1. Emit routing finding, not invalid-key CRITICAL.
    findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
      `L3 parece MCQ A2 (opciones a/b/c por ítem, no lista A-J). No es matching B1. ` +
      `Regenerar con la plantilla correcta de Lesen Teil 3.`));
    return findings;
  }

  // ── Detectar caso A vs B: misma lista en todos los ítems o no ──
  const itemsWithLongOptions = t3qs.filter(q => Array.isArray(q.options) && q.options.length >= 5);
  let isSharedDuplicated = false;

  if (itemsWithLongOptions.length >= 2) {
    // Compare every item's canonical options against the first item's
    const referenceOpts = itemsWithLongOptions[0].options.map(_canonOpt);
    isSharedDuplicated = itemsWithLongOptions.every(q => {
      const opts = q.options.map(_canonOpt);
      if (opts.length !== referenceOpts.length) return false;
      return opts.every((o, i) => o === referenceOpts[i]);
    });
  } else if (itemsWithLongOptions.length === 1) {
    // Only 1 item has long options — treat as shared (no other item to differ from)
    isSharedDuplicated = true;
  }
  // If no items have long options but also not short → items have no options (already shared mode)
  if (itemsWithLongOptions.length === 0) isSharedDuplicated = true;

  if (!isSharedDuplicated) {
    // Caso B: true per-item MCQ (options differ between items)
    findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
      `L3 usa opciones distintas por ítem (MCQ per-ítem real). El formato oficial Goethe ` +
      `requiere la misma lista A-J en todos los ítems. Revisar generación.`));

    // Validate each item's correct vs its own options (a/b/c or A-J)
    const invalid = t3qs.filter(q => {
      const c = String(q.correct ?? q.correctAnswer ?? '').toLowerCase();
      if (c === '0') return false;
      return !/^[a-j]$/.test(c);
    });
    if (invalid.length) {
      findings.push(finding('CHK-17', 'CRITICAL', file, 'lesen-3',
        `L3 per-item: ${invalid.length} ítem(s) con clave inválida: ${invalid.map(q=>q.id+':'+q.correct).join(', ')}`));
    }
    return findings;
  }

  // ── Caso A: SHARED DUPLICADO — validar contenido ──
  const corrects = t3qs.map(q => String(q.correct ?? q.correctAnswer ?? '').toUpperCase());

  // Check valid values (A-J or "0")
  const invalid = corrects.filter(c => !/^([A-J]|0)$/.test(c));
  if (invalid.length) {
    findings.push(finding('CHK-17', 'CRITICAL', file, 'lesen-3',
      `L3: clave(s) inválida(s): ${invalid.join(', ')}. Válidas: A–J o "0".`));
  }

  // Exactly 1 zero (no-match)
  const zeros = corrects.filter(c => c === '0').length;
  if (zeros === 0) {
    findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
      `L3: ningún ítem con clave "0" (sin anuncio). El oficial tiene exactamente 1.`));
  } else if (zeros > 1) {
    findings.push(finding('CHK-17', 'IMPORTANT', file, 'lesen-3',
      `L3: ${zeros} ítems con clave "0". El oficial tiene exactamente 1 sin-anuncio.`));
  }

  // No letter repeated (only meaningful in shared mode)
  const letterCounts = {};
  for (const c of corrects.filter(c => c !== '0')) {
    letterCounts[c] = (letterCounts[c] || 0) + 1;
  }
  const repeated = Object.entries(letterCounts).filter(([, n]) => n > 1);
  if (repeated.length) {
    findings.push(finding('CHK-17', 'CRITICAL', file, 'lesen-3',
      `L3: letra(s) repetida(s): ${repeated.map(([l,n])=>`${l}×${n}`).join(', ')}. ` +
      `Cada anuncio A-J solo puede usarse como respuesta correcta 1 vez.`));
  }

  return findings;
}

// ─── CHK-18: Calidad de la explanation ────────────────────────────────────
// Toda pregunta debe tener una explanation substantiva, en alemán, no circular.

// German function words — presence of any 1 confirms text is German.
const GERMAN_MARKER_RE = /\b(der|die|das|den|dem|ein|eine|und|ist|sind|war|haben|wird|nicht|auch|aber|weil|wenn|dass|für|von|zu|auf|aus|mit|an|kein|keine|dieser|welche|bietet|lehrt|hilft|repariert|zeigt|erklärt|sagt|nennt|gibt|wechselt|verkauft|vermietet|organisiert|vermittelt|reinigt|begleitet|unterrichtet|pflegt)\b/i;
const TRIVIAL_EXPL_RE = /^(richtig|falsch|ja|nein|korrekt|genau|das stimmt|das ist richtig|das ist korrekt|das ist falsch)\.?$/i;

function chk18(batch, file) {
  const findings = [];
  const seen = new Set();

  for (const q of batch.questions || []) {
    // Skip schreiben/sprechen (rubric answers)
    if (['schreiben','sprechen'].includes(String(q.module||'').toLowerCase())) continue;

    const expl = String(q.explanation || '').trim();

    // Missing explanation — V-03: emit IMPORTANT (CHK-8 doesn't require explanation;
    // this gap means questions with no explanation at all were silently skipped by CHK-18).
    // Not CRITICAL because absent explanation doesn't break scoring — it breaks correction UX.
    if (!expl) {
      findings.push(finding('CHK-18', 'IMPORTANT', file, q.id,
        'Explanation ausente. Toda pregunta debe incluir una explanation para la pantalla de corrección.'));
      continue;
    }

    // Minimum length: L3 matching items naturally have shorter explanations
    // (format "AdName bietet X." — 3 words — is valid for matching items)
    const isMatchingItem = q.type === 'matching';
    const minWords = isMatchingItem ? 3 : 10;
    const wc = expl.split(/\s+/).filter(w => w.length > 0).length;
    if (wc < minWords) {
      findings.push(finding('CHK-18', 'IMPORTANT', file, q.id,
        `Explanation demasiado corta (${wc} palabras): "${expl.slice(0,60)}". Mínimo: ${minWords} para tipo ${q.type}.`));
      continue;
    }

    // Trivial explanation (just "Richtig" or "Das ist korrekt")
    if (TRIVIAL_EXPL_RE.test(expl)) {
      findings.push(finding('CHK-18', 'IMPORTANT', file, q.id,
        `Explanation trivial: "${expl}". Debe explicar el razonamiento, no solo confirmar la respuesta.`));
      continue;
    }

    // Not in German: flag if no German indicators (umlauts, ß, or common function words).
    // Umlauts (ä/ö/ü/ß) alone are strong evidence of German — only flag if none present.
    const hasUmlauts = /[äöüß]/i.test(expl);
    if (!hasUmlauts && !GERMAN_MARKER_RE.test(expl)) {
      findings.push(finding('CHK-18', 'IMPORTANT', file, q.id,
        `Explanation posiblemente no está en alemán: "${expl.slice(0,80)}..."`));
    }

    // Circular: explanation too similar to question (Jaccard > 0.75)
    if (q.question && !seen.has(q.id)) {
      const qToks = new Set(tokenize(q.question));
      const eToks = new Set(tokenize(expl));
      if (qToks.size >= 4 && eToks.size >= 4) {
        let inter = 0;
        for (const t of eToks) if (qToks.has(t)) inter++;
        const sim = inter / (qToks.size + eToks.size - inter);
        if (sim > 0.75) {
          findings.push(finding('CHK-18', 'IMPORTANT', file, q.id,
            `Explanation circular (${(sim*100).toFixed(0)}% solapamiento con enunciado). Debe añadir información del pasaje, no reformular la pregunta.`));
        }
      }
      seen.add(q.id);
    }
  }
  return findings;
}

// ─── CHK-19: Runs de respuestas consecutivas ─────────────────────────────
// ≥4 respuestas idénticas consecutivas en el mismo Teil sugieren sesgo de
// generación o error sistemático. El examen oficial evita rayaduras largas.

function chk19(batch, file) {
  const findings = [];
  // Group by module+teil, preserving order
  const groups = {};
  for (const q of batch.questions || []) {
    const key = bpKey(q);
    if (!groups[key]) groups[key] = [];
    groups[key].push(String(q.correct ?? q.correctAnswer ?? ''));
  }

  for (const [key, answers] of Object.entries(groups)) {
    if (answers.length < 4) continue;
    let run = 1;
    let runVal = answers[0];
    for (let i = 1; i < answers.length; i++) {
      if (answers[i] === runVal) {
        run++;
        if (run >= 4) {
          findings.push(finding('CHK-19', 'IMPORTANT', file, key,
            `${key}: run de ${run} respuestas "${runVal}" consecutivas (posiciones ${i-run+2}–${i+1}). Evitar rayaduras predecibles.`));
          run = 1; // reset to avoid duplicate findings for same run
        }
      } else {
        run = 1;
        runVal = answers[i];
      }
    }
  }
  return findings;
}

// ─── CHK-20: Hören T1 — estructura por segmento ──────────────────────────
// Cada uno de los 5 segmentos de H1 debe tener exactamente:
//   1 ítem richtig_falsch + 1 ítem multiple_choice (formato oficial Goethe).
// CHK-3 verifica el total (10), pero no la distribución interna por segmento.

function chk20(batch, file) {
  const findings = [];
  // Only relevant if there are H1 questions
  const h1qs = (batch.questions || []).filter(q =>
    String(q.module||'').toLowerCase() === 'horen' && Number(q.teil) === 1
  );
  if (!h1qs.length) return findings;

  // Group by segmentLabel (Aufnahme 1…5 or segment passageId)
  const bySegment = {};
  for (const q of h1qs) {
    const seg = q.segmentLabel || q.passageId || 'seg-unknown';
    if (!bySegment[seg]) bySegment[seg] = { rf: 0, mc: 0, ids: [] };
    if (q.type === 'richtig_falsch' || q.type === 'true_false') bySegment[seg].rf++;
    if (q.type === 'multiple_choice') bySegment[seg].mc++;
    bySegment[seg].ids.push(q.id);
  }

  const segKeys = Object.keys(bySegment);

  // Should have exactly 5 segments
  if (segKeys.length !== 5) {
    findings.push(finding('CHK-20', 'IMPORTANT', file, 'horen-1',
      `Hören T1: se esperan 5 segmentos distintos, hay ${segKeys.length}. Verifica segmentLabel en cada pregunta.`));
  }

  // Each segment: exactly 1 RF + 1 MC
  for (const [seg, counts] of Object.entries(bySegment)) {
    if (counts.rf !== 1 || counts.mc !== 1) {
      findings.push(finding('CHK-20', 'IMPORTANT', file, `horen-1:${seg}`,
        `H1 segmento "${seg}": ${counts.rf} RF + ${counts.mc} MC (se espera 1+1). Cada segmento debe tener exactamente 1 R/F y 1 MCQ.`));
    }
  }

  return findings;
}

// ─── CHK-21: Lesen T4 — coherencia del conjunto de opiniones ─────────────────
//
// El formato oficial Goethe B1 exige que los 7 ítems de Lesen Teil 4 provengan de
// UNA sola fuente/blueprint, con:
//   • signText individual ≥ 15 palabras (no el intro compartido del foro).
//   • Todos los signTexts distintos entre sí (no intro copiado 7 veces).
//   • Autores únicos (extraídos del prefijo "Meinung von NAME:" o "Sagt NAME:").
//
// Un T4 que falla estas reglas es Frankenstein igual que un L3 con lista A-J mezclada.

function chk21(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    String(q.module||'').toLowerCase() === 'lesen' && Number(q.teil) === 4 &&
    (q.type === 'ja_nein' || q.type === 'richtig_falsch' || q.type === 'true_false')
  );
  if (!t4qs.length) return findings;

  // ── signText vacío o muy corto (<15 palabras) ──
  const short = t4qs.filter(q => {
    const words = String(q.signText || '').trim().split(/\s+/).filter(Boolean).length;
    return words < 15;
  });
  if (short.length) {
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: ${short.length} ítem(s) con signText < 15 palabras (${short.map(q=>q.id).join(', ')}). ` +
      `Cada opinión debe ser un texto individual, no el intro del foro.`));
  }

  // ── signTexts no son todos distintos ──
  const texts = t4qs.map(q => String(q.signText || '').trim());
  const uniqueTexts = new Set(texts);
  if (uniqueTexts.size < texts.length) {
    const dups = texts.filter((t, i) => texts.indexOf(t) !== i);
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: ${texts.length - uniqueTexts.size} signText(s) duplicado(s) — ` +
      `posible intro de foro copiado en cada ítem. Los 7 ítems deben tener opiniones distintas.`));
    void dups;
  }

  // ── Autores no únicos ──
  // Pronouns are capitalized in German but are NOT author names.
  const GERMAN_PRONOUNS = new Set(['Ich', 'Er', 'Sie', 'Es', 'Wir', 'Ihr', 'Du', 'Man']);
  function extractAuthor(signText) {
    const t = String(signText || '');
    const m = t.match(/^(?:Meinung von|Sagt)\s+([A-ZÄÖÜ][a-zäöüß]+)/);
    if (m) return m[1];
    const first = t.match(/^([A-ZÄÖÜ][a-zäöüß]+)/)?.[1] || '';
    return GERMAN_PRONOUNS.has(first) ? '' : first;
  }
  const authors = t4qs.map(q => extractAuthor(q.signText));
  const namedAuthors = authors.filter(Boolean);
  if (namedAuthors.length >= 2 && new Set(namedAuthors).size < namedAuthors.length) {
    const counts = {};
    for (const a of namedAuthors) counts[a] = (counts[a] || 0) + 1;
    const dups = Object.entries(counts).filter(([,n]) => n > 1).map(([a,n]) => `${a}×${n}`);
    findings.push(finding('CHK-21', 'IMPORTANT', file, 'lesen-4',
      `L4: autores repetidos en signText: ${dups.join(', ')}. Cada ítem debe ser de un autor distinto.`));
  }

  return findings;
}

// ─── CHK-23: Integridad de claves — conflicto segments vs questions ──────────
//
// Some records have the same question IDs duplicated in two places:
//   rec.segments[i].questions[]  (nested, per-segment — generated in context)
//   rec.questions[]              (flat top-level copy — reconstructed from snapshot)
//
// When both exist with the SAME question ID but DIFFERENT `correct` values,
// flattenExam silently discards the segment copy (dedup by ID, part.questions wins).
// The renderer then uses the wrong answer key for those questions.
//
// CRITICAL — always blocks; wrong answer keys = wrong scoring.

export function chk23(batch, file) {
  const findings = [];
  // batch here is the RAW record (pre-normalization), not the flattened exam.
  // We need to access rec.segments and rec.questions directly.
  // NOTE: this check is called on the raw seed record in isPartPoolReady.
  const segQs = (batch.segments || []).flatMap(s => s.questions || []);
  const dirQs = batch.questions || [];
  if (!segQs.length || !dirQs.length) return findings;

  const dirMap = new Map(dirQs.map(q => [q.id, q]));
  const conflicts = [];
  for (const sq of segQs) {
    const dq = dirMap.get(sq.id);
    if (!dq) continue;
    const segVal = String(sq.correct || '').toLowerCase();
    const dirVal = String(dq.correct || '').toLowerCase();
    if (segVal !== dirVal) {
      conflicts.push(`${sq.id.slice(-10)}: segments.correct=${sq.correct} ≠ questions.correct=${dq.correct}`);
    }
  }
  if (conflicts.length > 0) {
    findings.push(finding('CHK-23', 'CRITICAL', file, bpKey(segQs[0]),
      `Conflicto de claves: ${conflicts.length} pregunta(s) tienen correct diferente en segments[] vs questions[]. ` +
      `flattenExam usa questions[] (incorrecto). Ejemplos: ${conflicts.slice(0, 3).join(' | ')}`,
    ));
  }
  return findings;
}

// ─── CHK-22: Lesen T4 — cross-batch Frankenstein (multiple passageIds) ───────
//
// All 7 T4 questions must belong to the SAME forum topic (same passageId).
// If questions carry multiple distinct passageIds they were spliced from different
// generation batches — the examinee would read opinions about topic A while the
// question header asks about topic B.
//
// This is the structural counterpart of SEM-1's topic-relevance check:
//   CHK-22 catches cross-batch contamination (different passageIds in one file).
//   SEM-1  catches within-batch mismatch (same passageId but incoherent content).
//
// CRITICAL — blocks isPartPoolReady regardless of GATE_BLOCK_CHECKS.

function chk22(batch, file) {
  const findings = [];
  const t4qs = (batch.questions || []).filter(q =>
    String(q.module || '').toLowerCase() === 'lesen' && Number(q.teil) === 4,
  );
  if (t4qs.length < 2) return findings;

  const pids = t4qs.map(q => q.passageId).filter(Boolean);
  const uniquePids = new Set(pids);
  if (uniquePids.size > 1) {
    findings.push(finding('CHK-22', 'CRITICAL', file, 'lesen-4',
      `Lesen T4: ${uniquePids.size} passageIds distintos [${[...uniquePids].join(', ')}]. ` +
      `Todos los ítems deben pertenecer al mismo texto/foro fuente. ` +
      `Contaminación cross-batch detectada (Frankenstein T4).`,
    ));
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

      // Dedup guard: algunos formatos de banco almacenan preguntas en AMBOS part.questions[]
      // y part.segments[].questions[] (duplicado exacto por id). Sin dedup, flattenExam
      // contaría doble → CHK-20 vería 2RF+2MC por segmento en vez del 1+1 esperado.
      // Solo deduplicamos cuando q.id existe; sin id se empuja siempre (no podemos afirmar
      // identidad entre ítems sin id aunque compartan texto).
      const seenQIds = new Set();
      function pushQ(q) {
        const key = q.id;
        if (key && seenQIds.has(key)) return;
        if (key) seenQIds.add(key);
        questions.push(q);
      }

      // Pasajes embebidos en array (ej. Lesen T2 con 2 pasajes: part.passages[])
      // Some seed records store passage identity in `p.passageId` (not `p.id`) — accept both.
      if (Array.isArray(part.passages) && part.passages.length > 0) {
        for (const p of part.passages) {
          passages.push({
            id    : p.id || p.passageId || `${module}-${teil}`,
            title : p.title || p.textTitle || '',
            text  : p.text || '',
          });
        }
      } else if (part.passageId || part.text || part.transcript) {
        // Pasaje único inline (incluyendo transcripts de Hören sin segments)
        passages.push({
          id    : part.passageId || `${module}-${teil}`,
          title : part.textTitle || '',
          text  : part.text || part.transcript || '',
        });
      }

      // Eje-2 Fase B: segments[] es autoridad cuando existe; questions[] es fallback.
      // Si la parte tiene segments → solo se leen segments (questions[] es índice derivado).
      // Si no hay segments → questions[] es la fuente (Lesen, Schreiben, H4 plano).
      if (Array.isArray(part.segments) && part.segments.length > 0) {
        // Path segments-autoridad (Hören T1/T2/T3 reparados y cualquier parte con segments)
        for (const seg of part.segments) {
          if (seg.text || seg.transcript) {
            passages.push({ id: seg.passageId || `${module}-${teil}-seg`, title: seg.label || '', text: seg.text || seg.transcript || '' });
          }
          for (const q of seg.questions || []) {
            pushQ({ ...q, module, teil, passageId: q.passageId || seg.passageId });
          }
          for (const item of seg.items || []) {
            if (item.id && (item.correct != null || item.type)) {
              pushQ({ ...item, module, teil, passageId: item.passageId || seg.passageId });
            }
          }
        }
      } else {
        // Path questions[]-fuente (Lesen, Schreiben, H4 plano, cualquier parte sin segments)
        for (const q of part.questions || []) {
          pushQ({ ...q, module, teil, passageId: q.passageId || part.passageId });
        }
      }

      // Lesen T3/T4: part.items[] (ads matching / forum). Solo existe en Lesen, no en Hören.
      // Se normalizan correctAnswer y question para que pasen CHK-2 y CHK-8.
      const passageIdsSeen = new Set(passages.map(p => p.id));
      for (const item of part.items || []) {
        if (!item.id) continue;
        if (item.correct != null || item.correctAnswer != null || item.type) {
          const effectivePassageId = item.passageId || part.passageId;
          if (item.signText && effectivePassageId && !passageIdsSeen.has(effectivePassageId)) {
            passages.push({ id: effectivePassageId, title: '', text: item.signText });
            passageIdsSeen.add(effectivePassageId);
          }
          const normItem = {
            ...item,
            module,
            teil,
            passageId: effectivePassageId,
            correctAnswer: item.correctAnswer ?? item.correct,
            question: item.question || item.signText || '',
          };
          pushQ(normItem);
        }
      }
    }
  }
  return { passages, questions };
}

// ─── auditExam: audita un examen ensamblado en memoria ────────────────────
// Devuelve { critical, important, minor, findings, questionsScanned }
export function auditExam(examWrapper, label = 'exam') {
  const exam = examWrapper.exam || examWrapper;
  const flat = flattenExam(exam);
  const globalIds = new Set(); // dedup local al examen
  const findings = [
    ...chk1(flat, label),
    ...chk2(flat, label),
    ...chk3(flat, label),
    ...chk3Absent(flat, label), // solo en examen completo — detecta Teile con 0 ítems
    ...chk4(flat, label),
    ...chk5([{ batch: flat, file: label }]),
    ...chk6(flat, label),
    ...chk7(flat, label),
    ...chk8(flat, label, globalIds),
    ...chk10(flat, label),
    ...chk11(flat, label),
    ...chk12(flat, label),
    ...chk13(flat, label),
    ...chk14(flat, label),
    ...chk14b(flat, label),
    ...chk15(flat, label),
    ...chk16(flat, label),
    ...chk17(flat, label),
    ...chk18(flat, label),
    ...chk19(flat, label),
    ...chk20(flat, label),
    ...chk21(flat, label),
    ...chk22(flat, label),
  ];
  const by = s => findings.filter(f => f.severity === s).length;
  return {
    critical: by('CRITICAL'),
    important: by('IMPORTANT'),
    minor: by('MINOR'),
    findings,
    questionsScanned: flat.questions.length,
  };
}

// ─── POOL-2: gate de ingestión al banco (parte suelta → 0 CRITICAL + 0 IMPORTANT) ──

const MODULE_PARTS_KEY = {
  lesen: 'lesenParts',
  horen: 'horenParts',
  schreiben: 'schreibenParts',
  sprechen: 'sprechenParts',
};

function normPartType(type) {
  const t = String(type || '');
  if (t === 'multiple' || t === 'mcq') return 'multiple_choice';
  if (t === 'true_false') return 'richtig_falsch';
  return t;
}

function normPartQuestion(q, module, teil) {
  // `correct` is canonical. Resolve from correctAnswer only when correct is absent.
  const correct = q.correct ?? q.correctAnswer;
  return {
    ...q,
    module,
    teil,
    type: normPartType(q.type || q.questionType),
    correct,
    correctAnswer: correct, // mirror, always equal to correct
    question: q.question || q.signText || q.statement || '',
  };
}

function buildHorenSegments(batch, module, teil) {
  const passageMap = new Map((batch.passages || []).map((p) => [p.id, p]));
  const byPassage = new Map();
  for (const q of batch.questions || []) {
    const pid = q.passageId || '_';
    if (!byPassage.has(pid)) byPassage.set(pid, []);
    byPassage.get(pid).push(normPartQuestion(q, module, teil));
  }
  return [...byPassage.entries()].map(([pid, qs], i) => {
    const p = passageMap.get(pid);
    return {
      id: `seg_${i}`,
      label: qs[0]?.segmentLabel || `Aufnahme ${i + 1}`,
      transcript: p?.text || p?.transcript || '',
      passageId: pid === '_' ? undefined : pid,
      questions: qs,
    };
  });
}

function flatBatchToPartRecord(batch) {
  const qs = batch.questions || [];
  if (!qs.length) return null;
  const module = String(qs.find((q) => q.module)?.module || batch.module || '').toLowerCase();
  const teil = Number(qs[0]?.teil);
  if (!module || !Number.isFinite(teil)) return null;

  const record = {
    id: batch.id,
    module,
    teil,
    instruction: batch.instruction || '',
    questions: qs.map((q) => normPartQuestion(q, module, teil)),
  };

  if (module === 'lesen') {
    const passages = batch.passages || [];
    if (teil === 2 && passages.length >= 2) {
      record.passage = {
        title: passages[0]?.title || '',
        passages: passages.map((p) => ({
          passageId: p.id,
          textTitle: p.title || p.textTitle || '',
          text: p.text || '',
        })),
      };
    } else if (teil === 3) {
      const p0 = passages[0] || {};
      record.passage = {
        title: p0.title || '',
        text: p0.text || '',
        ads: batch.ads || p0.ads || [],
      };
      if (batch.ads) record.ads = batch.ads;
    } else if (teil === 4) {
      // L4 passages are exposed as record.passages[] so partRecordToExamPart can build the
      // exam wrapper correctly.  We intentionally preserve passageId on questions so that
      // CHK-8 can still detect cross-batch contamination (different passageIds in same file).
      // Questions with signText are self-contained for answering, but the passageId signals
      // which forum topic they belong to — CHK-22 uses this to detect Frankenstein mixes.
      record.passages = passages.map((p) => ({
        id        : p.id || p.passageId,
        passageId : p.id || p.passageId,
        textTitle : p.title || p.textTitle || '',
        text      : p.text || '',
      }));
      record.passage = { title: passages[0]?.title || '', text: passages[0]?.text || '' };
    } else {
      const p0 = passages[0] || {};
      record.passage = { title: p0.title || '', text: p0.text || '' };
    }
  } else if (module === 'horen') {
    record.segments = buildHorenSegments(batch, module, teil);
    const texts = (batch.passages || []).map((p) => p.text || p.transcript || '').filter(Boolean);
    record.passage = { text: texts.join('\n\n'), transcript: texts.join('\n\n') };
  } else if (module === 'schreiben' || module === 'sprechen') {
    record.task = qs[0]?.question || batch.task || '';
  }

  return record;
}

function partRecordToExamPart(record) {
  const module = String(record.module || '').toLowerCase();
  const teil = Number(record.teil);
  const part = { teil, instruction: record.instruction || '' };

  if (module === 'lesen') {
    const passage = record.passage || {};
    if (Array.isArray(passage.passages) && passage.passages.length >= 2) {
      part.passages = passage.passages;
      part.textTitle = passage.title || '';
    } else if (teil === 3) {
      part.text = passage.text || '';
      part.textTitle = passage.title || '';
      part.ads = passage.ads || record.ads || [];
    } else if (teil === 4) {
      if (Array.isArray(record.passages) && record.passages.length > 0) {
        part.passages = record.passages;
      } else if (passage.text) {
        // Bank-extracted L4 records store the forum intro in record.passage (singular).
        // Reconstruct passages[] so flattenExam can register the passage and CHK-8 can
        // resolve questions' passageId references against it.
        const pid = (record.questions || []).find((q) => q.passageId)?.passageId;
        if (pid) {
          part.passages = [{ id: pid, text: passage.text, title: passage.title || '' }];
        } else {
          part.text = passage.text;
          part.textTitle = passage.title || '';
        }
      }
      if (Array.isArray(record.ads)) part.ads = record.ads;
    } else {
      part.text = passage.text || '';
      part.textTitle = passage.title || '';
      part.passageId = record.questions?.[0]?.passageId || passage.passageId;
    }
    part.questions = (record.questions || []).map((q) => normPartQuestion(q, module, teil));
    if (record.example) part.example = record.example;
  } else if (module === 'horen') {
    if (Array.isArray(record.segments) && record.segments.length) {
      part.segments = record.segments.map((seg) => ({
        ...seg,
        questions: (seg.questions || []).map((q) => normPartQuestion(q, module, teil)),
      }));
    }
    const passage = record.passage || {};
    part.transcript = passage.transcript || passage.text || '';
    part.questions = (record.questions || []).map((q) => normPartQuestion(q, module, teil));
    // When no segments, propagate the passageId from questions so flattenExam can
    // build the flat passages[] with the correct id and CHK-8 can resolve it.
    if (!part.segments?.length) {
      const firstPid = (record.questions || []).find((q) => q.passageId)?.passageId;
      if (firstPid) part.passageId = firstPid;
    }
  } else if (module === 'schreiben' || module === 'sprechen') {
    part.task = record.task || record.instruction || '';
    part.minWords = record.minWords;
    part.maxWords = record.maxWords;
    part.fieldId = record.fieldId;
    part.taskFormat = record.taskFormat;
    const task = part.task;
    part.questions = (record.questions || []).length
      ? record.questions.map((q) => normPartQuestion(q, module, teil))
      : [{
        id: '1', type: 'short_answer', question: task,
        correct: 'rubric', module, teil,
      }];
  } else {
    return null;
  }

  return part;
}

function partToExamWrapper(record) {
  const module = String(record.module || '').toLowerCase();
  const partsKey = MODULE_PARTS_KEY[module];
  if (!partsKey) return null;
  const part = partRecordToExamPart(record);
  if (!part) return null;
  return { exam: { [partsKey]: [part] } };
}

/** Excluye CHK-3 "Teil ausente" al auditar una sola parte (no examen completo). */
export function filterPartPoolFindings(findings) {
  return findings.filter((f) => {
    if (f.severity === 'INFO') return false;
    if (f.id === 'CHK-3' && String(f.message).includes('Teil ausente')) return false;
    return true;
  });
}

function splitInputIntoPartRecords(input) {
  if (!input || typeof input !== 'object') return [];
  if (input.exam) {
    const exam = input.exam;
    const out = [];
    for (const [partsKey, mod] of Object.entries({
      lesenParts: 'lesen', horenParts: 'horen', schreibenParts: 'schreiben', sprechenParts: 'sprechen',
    })) {
      for (const p of exam[partsKey] || []) {
        out.push({ module: mod, teil: p.teil, ...p, questions: p.questions || p.items || [] });
      }
    }
    return out;
  }
  if (input.lesenParts || input.horenParts || input.schreibenParts || input.sprechenParts) {
    return splitInputIntoPartRecords({ exam: input });
  }
  if (input.module && (input.questions || input.segments || input.task)) {
    return [input];
  }
  if (Array.isArray(input.questions) && input.questions.length) {
    const groups = new Map();
    for (const q of input.questions) {
      const mod = String(q.module || '').toLowerCase();
      const teil = Number(q.teil);
      const key = `${mod}:${teil}`;
      if (!groups.has(key)) {
        groups.set(key, { module: mod, teil, questions: [], passages: input.passages || [], ads: input.ads });
      }
      groups.get(key).questions.push(q);
    }
    return [...groups.values()].map((g) => flatBatchToPartRecord(g)).filter(Boolean);
  }
  return [];
}

function auditSinglePartRecord(record, label) {
  // CHK-23 runs on the raw record BEFORE normalization, because flattenExam
  // collapses the segments/questions duality via ID-dedup (part.questions wins).
  const rawFindings = chk23(record, label);

  const wrapper = partToExamWrapper(record);
  if (!wrapper) {
    return [...rawFindings, finding('AUDIT-ERROR', 'CRITICAL', label, 'part', 'Parte no convertible a examen')];
  }
  const audit = auditExam(wrapper, label);
  return [...rawFindings, ...filterPartPoolFindings(audit.findings)].filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'IMPORTANT',
  );
}

/**
 * POOL-2 — ¿Puede esta parte entrar al banco/pool recién generado?
 * Bloquea TODO finding CRITICAL o IMPORTANT (21 checks vía auditExam, sin GATE_BLOCK_CHECKS).
 *
 * @param {object} part - Batch {passages,questions}, record reusable, o examen parcial
 * @param {object} [opts]
 * @param {boolean} [opts.allowFailures=false] - Solo desarrollo: aviso rojo, no bloquea
 * @returns {{ ok: boolean, blocking: object[] }}
 *
 * Multi-Teil: divide por (module, teil), audita cada grupo con auditExam y acumula
 * blocking. ok=false si CUALQUIER grupo tiene ≥1 CRITICAL/IMPORTANT. CHK-3 "Teil
 * ausente" se filtra; el conteo incorrecto del Teil presente sí bloquea.
 *
 * Cuando opts.semantic=true la función es ASYNC y añade la capa semántica (SEM-1):
 * una llamada LLM acotada por parte que valida correctness/ambiguity/distractor/
 * explanation/template. Resultado cacheado por hash de contenido (sin recoste LLM).
 */
export async function isPartPoolReady(part, { allowFailures = false, semantic = false } = {}) {
  // ── 1. Structural gate (siempre, síncrono) ─────────────────────────────────
  let structOk;
  let blocking;
  try {
    const records = splitInputIntoPartRecords(part);
    if (!records.length) {
      const err = finding('AUDIT-ERROR', 'CRITICAL', 'isPartPoolReady', 'part', 'Entrada vacía o no reconocida');
      return { ok: false, blocking: [err] };
    }

    blocking = [];
    for (const rec of records) {
      const label = rec.id || `${rec.module}-t${rec.teil}`;
      blocking.push(...auditSinglePartRecord(rec, label));
    }

    if (allowFailures && blocking.length > 0) {
      const ids = [...new Set(blocking.map((f) => f.id))].join(',');
      process.stderr.write(
        `\n\x1b[31m⚠  --allow-audit-failures: ${blocking.length} finding(s) ignorado(s) [${ids}]\x1b[0m\n`,
      );
    }
    structOk = allowFailures || blocking.length === 0;
  } catch (err) {
    const auditError = finding(
      'AUDIT-ERROR', 'CRITICAL', 'isPartPoolReady', 'part',
      `auditExam lanzó excepción: ${err?.message || String(err)}`,
    );
    process.stderr.write(
      `[isPartPoolReady] AUDIT-ERROR — parte no auditable (fail-closed): ${err?.message || err}\n`,
    );
    return { ok: false, blocking: [auditError] };
  }

  // ── 2. Semantic layer (solo cuando semantic:true) ────────────────────────────
  if (!semantic) return { ok: structOk, blocking };

  // Structural failures already block — no need to burn an LLM call
  if (!structOk && !allowFailures) return { ok: false, blocking };

  let semResult;
  try {
    const { validatePartSemantics } = await import('./lib/semanticValidator.mjs');
    semResult = await validatePartSemantics(part);
  } catch (err) {
    // Fail-open for the semantic layer: log but don't block if the validator itself errors
    process.stderr.write(
      `[isPartPoolReady] WARN — semantic validator error (fail-open): ${err?.message || err}\n`,
    );
    return { ok: structOk, blocking };
  }

  // Convert semantic issues → findings (IMPORTANT severity, id = 'SEM-{kind}')
  const semFindings = (semResult.issues || []).map((iss) =>
    finding(
      `SEM-${iss.kind.toUpperCase()}`,
      // correctness/ambiguity are CRITICAL; distractor/explanation/template are IMPORTANT
      ['correctness', 'ambiguity'].includes(iss.kind) ? 'CRITICAL' : 'IMPORTANT',
      'semantic',
      iss.itemId || 'part',
      iss.detail,
    ),
  );

  blocking.push(...semFindings);
  return { ok: (allowFailures || blocking.length === 0), blocking };
}

// ─── GATE de publicación — fuente única de verdad ────────────────────────────
//
// POLÍTICA V-10 (decidida 2026-07-02):
// Meta final = "publicación ≡ ingestión" (0-CRITICAL, 0-IMPORTANT en ambas).
// La convergencia se hace en dos etapas:
//
//   GATE_BLOCK_CHECKS  — IMPORTANT tratados como CRITICAL AHORA.
//                        Solo invariantes estructurales cuyo fallo produce exámenes
//                        rotos independientemente del contenido.
//
//   GATE_BLOCK_PENDING — IMPORTANT que DEBEN bloquear cuando el pool esté limpio.
//                        Actualmente advisory para no congelar el pipeline.
//                        POOL-5 los moverá a GATE_BLOCK_CHECKS celda a celda,
//                        una vez la matriz pool-health no tenga registros afectados.
//
// Para activar un CHK pendiente: mover su entrada de PENDING → CHECKS (una edición).
//
// Todos los CRITICAL bloquean siempre, independientemente de estos Sets.

// Invariantes estructurales activos:
export const GATE_BLOCK_CHECKS = new Set([
  'CHK-17', // L3: misma lista A-J compartida en los 7 ítems (Frankenstein L3)
  'CHK-20', // H1: cada segmento debe tener exactamente 1RF+1MC (invariante estructural H1)
  'CHK-21', // T4: signText ≥15 palabras y autores únicos (Frankenstein T4)
  'CHK-22', // T4: múltiples passageIds = cross-batch Frankenstein (CRITICAL — siempre bloquea)
]);

// Pendientes de activación (advisory hoy, bloqueantes cuando pool-health los soporte):
// Para mover a activo: cut from here, paste into GATE_BLOCK_CHECKS above.
export const GATE_BLOCK_PENDING = new Set([
  // CHK-18: explanation quality (corta <10w, trivial, no alemán, circular).
  // Impacto actual: 53/160 registros (33%). Mover a GATE_BLOCK_CHECKS en POOL-5,
  // cuando pool-health-report muestre 0 registros con CHK-18 en celdas activas.
  'CHK-18',
]);

/**
 * Determina si un examen es publicable según el gate de auditoría.
 * Único lugar donde se decide qué bloquea publicación.
 *
 * @param {object} exam - Examen (wrapper {exam:...} o plano)
 * @param {object} [opts]
 * @param {boolean} [opts.allowFailures=false] - Si true, emite aviso rojo pero no bloquea
 * @returns {{ ok: boolean, blocking: object[], advisory: object[] }}
 */
export function isExamPublishable(exam, { allowFailures = false } = {}) {
  // ── CHK-23 pre-check on RAW parts, before auditExam calls flattenExam ────────
  // flattenExam silently resolves questions[]/segments[].questions[] conflicts by
  // preferring questions[] (wrong for Hören). Run CHK-23 before that resolution
  // so divergent exams are blocked here, not silently fixed.
  const preFindings = [];
  const examObj = exam?.exam || {};
  for (const slot of ['lesenParts', 'horenParts', 'schreibenParts', 'sprechenParts']) {
    for (const part of examObj[slot] || []) {
      preFindings.push(...chk23(part, part.id || slot));
    }
  }

  // ── Fail-closed: si auditExam lanza (examen nulo, forma inesperada, excepción interna)
  // → tratar como CRITICAL AUDIT-ERROR. NO publicar. El catch→warn de la CLI (modo reporte)
  // es distinto: está en loadBatchFile y solo aplica al escaneo de directorios.
  let audit;
  try {
    audit = auditExam(exam);
  } catch (err) {
    const auditError = finding(
      'AUDIT-ERROR', 'CRITICAL', 'isExamPublishable', 'exam',
      `auditExam lanzó excepción: ${err?.message || String(err)}`,
    );
    process.stderr.write(
      `[isExamPublishable] AUDIT-ERROR — examen no auditable (fail-closed): ${err?.message || err}\n`,
    );
    return { ok: false, blocking: [auditError], advisory: [] };
  }

  const allFindings = [...preFindings, ...audit.findings];
  const blocking = allFindings.filter(
    (f) => f.severity === 'CRITICAL' || GATE_BLOCK_CHECKS.has(f.id),
  );
  // pending: advisory findings that are in GATE_BLOCK_PENDING (will block in POOL-5)
  const pending = allFindings.filter(
    (f) => f.severity !== 'CRITICAL' && !GATE_BLOCK_CHECKS.has(f.id) && GATE_BLOCK_PENDING.has(f.id),
  );
  const advisory = allFindings.filter(
    (f) => f.severity !== 'CRITICAL' && !GATE_BLOCK_CHECKS.has(f.id) && !GATE_BLOCK_PENDING.has(f.id),
  );
  if (allowFailures && blocking.length > 0) {
    const ids = [...new Set(blocking.map((f) => f.id))].join(',');
    process.stderr.write(
      `\n\x1b[31m⚠  --allow-audit-failures: ${blocking.length} finding(s) ignorado(s) [${ids}]\x1b[0m\n`,
    );
  }
  if (pending.length > 0) {
    const ids = [...new Set(pending.map((f) => f.id))].join(',');
    process.stderr.write(
      `\n\x1b[33m⚠  GATE_BLOCK_PENDING: ${pending.length} finding(s) no bloquean hoy pero lo harán en POOL-5 [${ids}]\x1b[0m\n`,
    );
  }
  return { ok: allowFailures || blocking.length === 0, blocking, pending, advisory };
}

// Exportar símbolos necesarios para publicador y verify
export { flattenExam, BLUEPRINT, partRecordToExamPart, partToExamWrapper };

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
      if (examObj) {
        const flat = flattenExam(examObj);
        flat._isFullExam = true; // marcar para chk3Absent en el loop CLI
        return flat;
      }
      return { passages: [], questions: [] };
    });
  }

  // Examen ensamblado individual: {id, exam:{lesenParts,...}} o {lesenParts,...}
  const exam = raw.exam || (raw.lesenParts || raw.horenParts || raw.schreibenParts || raw.sprechenParts ? raw : null);
  if (exam) {
    const flat = flattenExam(exam);
    flat._isFullExam = true; // marcar para chk3Absent en el loop CLI
    return [flat];
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
    if (batch._isFullExam) allFindings.push(...chk3Absent(batch, file));
    allFindings.push(...chk4(batch, file));
    allFindings.push(...chk6(batch, file));
    allFindings.push(...chk7(batch, file));
    allFindings.push(...chk8(batch, file, globalIds));
    allFindings.push(...chk9(batch, file));
    allFindings.push(...chk10(batch, file));
    allFindings.push(...chk11(batch, file));
    allFindings.push(...chk12(batch, file));
    allFindings.push(...chk13(batch, file));
    allFindings.push(...chk14(batch, file));
    allFindings.push(...chk14b(batch, file));
    allFindings.push(...chk15(batch, file));
    allFindings.push(...chk16(batch, file));
    allFindings.push(...chk17(batch, file));
    allFindings.push(...chk18(batch, file));
    allFindings.push(...chk19(batch, file));
    allFindings.push(...chk20(batch, file));
    allFindings.push(...chk21(batch, file));
    allFindings.push(...chk22(batch, file));
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

// Solo ejecutar main() cuando se invoca directamente como CLI (no al importar como módulo)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main().catch(e => { console.error(e); process.exit(2); });
