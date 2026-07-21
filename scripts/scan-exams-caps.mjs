#!/usr/bin/env node
/**
 * scan-exams-caps.mjs — Mid-sentence cap scan on assembled E1–E5.
 *
 * REAL ERRORS:
 *   L1 — decapitalizeMidSentence would still fix (NEVER_NOUN mid-sentence)
 *   L2-fixed — the 9 corrected ambiguous phrases (must be absent)
 *
 * LEGIT (reported separately, not counted as errors):
 *   Essen/Kochen as nouns, zum Essen, das Essen, Gärtnern oder Kochen, etc.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decapitalizeMidSentence, NEVER_NOUN_WORDS } from './lib/capitalizeNouns.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const L2_FIXED_PHRASES = [
  { label: 'Glaube-ich', bad: 'Ich Glaube, diese', good: 'Ich glaube, diese' },
  { label: 'Glaube-trotzdem', bad: 'Trotzdem Glaube ich nicht', good: 'Trotzdem glaube ich nicht' },
  { label: 'Stimme-ich', bad: 'Ich Stimme nicht zu', good: 'Ich stimme nicht zu' },
  { label: 'Stimme-dem', bad: 'Dem Stimme ich zu', good: 'Dem stimme ich zu' },
  { label: 'Junge-erwachsene', bad: 'besonders Junge Erwachsene', good: 'besonders junge Erwachsene' },
  { label: 'Junge-menschen', bad: 'um Junge Menschen', good: 'um junge Menschen' },
  { label: 'Kochen-frisch', bad: 'wenn sie frisch Kochen', good: 'wenn sie frisch kochen' },
  { label: 'Kochen-zusammen', bad: 'wir zusammen Kochen oder Spiele', good: 'wir zusammen kochen oder Spiele' },
  { label: 'Essen-verbo', bad: 'was sie Essen', good: 'was sie essen' },
];

const L1_SPOT = ['Persönlich', 'Deutlich', 'Drei', 'Vier', 'Nachhaltig'];

const SENTENCE_END_RE =
  /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab)]\s*$|(?<!\w)['"]\s*$/;
const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;

function collectStrings(obj, acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) {
    obj.forEach((v) => collectStrings(v, acc));
    return acc;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.length > 4) acc.push(v);
    else if (v && typeof v === 'object') collectStrings(v, acc);
  }
  return acc;
}

function extractSentence(text, pos, wordLen) {
  const sentStart = Math.max(
    0,
    text.lastIndexOf('.', pos - 1) + 1,
    text.lastIndexOf('!', pos - 1) + 1,
    text.lastIndexOf('?', pos - 1) + 1,
    text.lastIndexOf('\n', pos - 1) + 1,
  );
  let sentEnd = pos + wordLen;
  while (sentEnd < text.length && !['.', '!', '?', '\n'].includes(text[sentEnd])) sentEnd++;
  return text.slice(sentStart, Math.min(text.length, sentEnd + 1)).replace(/\s+/g, ' ').trim();
}

function scanL1DecapWouldFix(text) {
  const hits = [];
  const { result, count } = decapitalizeMidSentence(text);
  if (count === 0) return hits;

  const tok = (s) => {
    const a = [];
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(s)) !== null) a.push(m[0]);
    return a;
  };
  const o = tok(text);
  const r = tok(result);
  for (let i = 0; i < Math.min(o.length, r.length); i++) {
    if (o[i] !== r[i]) {
      hits.push({ kind: 'L1', word: o[i], fix: r[i], sentence: extractSentence(text, text.indexOf(o[i]), o[i].length) });
    }
  }
  return hits;
}

function scanL2FixedPhrases(text) {
  const hits = [];
  for (const p of L2_FIXED_PHRASES) {
    let idx = 0;
    while ((idx = text.indexOf(p.bad, idx)) !== -1) {
      hits.push({
        kind: 'L2-fixed',
        label: p.label,
        word: p.bad,
        sentence: extractSentence(text, idx, p.bad.length),
      });
      idx += p.bad.length;
    }
  }
  return hits;
}

function scanLegitAmbiguous(text) {
  const hits = [];
  const patterns = [
    { re: /(?<=[a-zäöüß]\s)Essen\b/g, label: 'Essen-cap' },
    { re: /(?<=[a-zäöüß]\s)Kochen\b/g, label: 'Kochen-cap' },
  ];
  for (const { re, label } of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const badPhrases = L2_FIXED_PHRASES.map((p) => p.bad);
      const ctx = text.slice(Math.max(0, m.index - 20), m.index + 30);
      if (badPhrases.some((b) => ctx.includes(b))) continue;
      hits.push({
        kind: 'legit-ambiguous',
        label,
        word: m[0],
        sentence: extractSentence(text, m.index, m[0].length),
      });
    }
  }
  return hits;
}

function scanExam(examNum) {
  const fp = path.join(ROOT, `assembled-exam-b1-e${examNum}.json`);
  const exam = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const partIds = exam._meta?.partIds || {};
  const texts = collectStrings(exam.exam || exam);

  const l1 = [];
  const l2 = [];
  const legit = [];
  const seen = new Set();

  for (const text of texts) {
    for (const h of [...scanL1DecapWouldFix(text), ...scanL2FixedPhrases(text)]) {
      const key = `${h.kind}|${h.word}|${h.sentence.slice(0, 70)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (h.kind === 'L1') l1.push(h);
      else l2.push(h);
    }
    for (const h of scanLegitAmbiguous(text)) {
      const key = `${h.word}|${h.sentence.slice(0, 70)}`;
      if (seen.has(`legit|${key}`)) continue;
      seen.add(`legit|${key}`);
      legit.push(h);
    }
  }

  return { examNum, partIds, l1, l2, legit, totalReal: l1.length + l2.length };
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('SCAN MAYÚSCULAS MID-SENTENCE · E1–E5 (post re-export)');
console.log('══════════════════════════════════════════════════════════════════\n');

const results = [];
for (let n = 1; n <= 5; n++) results.push(scanExam(n));

console.log('| Examen | L1 (decap) | L2-fixed (9 frases) | **Errores reales** | Legit Essen/Kochen |');
console.log('|--------|------------|---------------------|--------------------|--------------------|');
let totalReal = 0;
let totalLegit = 0;
for (const r of results) {
  totalReal += r.totalReal;
  totalLegit += r.legit.length;
  console.log(
    `| E${r.examNum} | ${r.l1.length} | ${r.l2.length} | **${r.totalReal}** | ${r.legit.length} |`,
  );
}
console.log(`| **Total** | | | **${totalReal}** | ${totalLegit} |`);

for (const r of results) {
  if (r.totalReal === 0 && r.legit.length === 0) continue;
  console.log(`\n── Examen ${r.examNum} ──`);
  if (r.l1.length) {
    console.log('  L1 errores:');
    for (const h of r.l1) console.log(`    • ${h.word} → ${h.fix}: ${h.sentence.slice(0, 100)}…`);
  }
  if (r.l2.length) {
    console.log('  L2-fixed (deberían estar corregidos):');
    for (const h of r.l2) console.log(`    • [${h.label}] ${h.sentence.slice(0, 100)}…`);
  }
  if (r.legit.length) {
    console.log('  Legítimos (OK):');
    for (const h of r.legit) console.log(`    • ${h.word}: ${h.sentence.slice(0, 90)}…`);
  }
}

console.log('\nBaseline referencia (inicio sesión): E4 ~5 tokens L1, E5 ~20 mezclados.');
console.log(`Resultado actual: ${totalReal} errores reales en E1–E5.\n`);

process.exit(totalReal > 0 ? 1 : 0);
