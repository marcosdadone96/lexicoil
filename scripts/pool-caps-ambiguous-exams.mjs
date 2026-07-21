#!/usr/bin/env node
/**
 * pool-caps-ambiguous-exams.mjs — Ambiguous caps (Nivel 2) split by exam usage.
 *
 * Group 1: parts in assembled exams E1–E5 (priority)
 * Group 2: rest of pool (secondary)
 *
 * Usage: node scripts/pool-caps-ambiguous-exams.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');

const AMBIGUOUS = new Set(['glaube', 'essen', 'stimme', 'junge', 'kochen']);
const SENTENCE_END_RE =
  /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab)]\s*$|(?<!\w)['"]\s*$/;
const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;

function loadExamPartIds() {
  const partToExams = new Map();
  for (let n = 1; n <= 5; n++) {
    const fp = path.join(ROOT, `assembled-exam-b1-e${n}.json`);
    const exam = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const ids = exam._meta?.partIds || {};
    for (const [cell, partId] of Object.entries(ids)) {
      if (!partToExams.has(partId)) partToExams.set(partId, []);
      partToExams.get(partId).push({ exam: n, cell });
    }
  }
  return partToExams;
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

function scanAmbiguous(text) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });
  }

  const hits = [];
  let prevContent = '';
  let lastWord = '';

  for (const tok of tokens) {
    if (!tok.isWord) {
      prevContent += tok.val;
      continue;
    }

    const fc = tok.val[0];
    const isCap =
      (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';

    if (isCap) {
      const lc = tok.val.toLowerCase();
      const mid = prevContent.length > 0 && !SENTENCE_END_RE.test(prevContent);

      if (mid && AMBIGUOUS.has(lc)) {
        hits.push({
          word: tok.val,
          lc,
          lastWord,
          sentence: extractSentence(text, tok.pos, tok.val.length),
        });
      }
    }

    prevContent += tok.val;
    lastWord = tok.val;
  }
  return hits;
}

function collectTexts(obj, fp, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectTexts(v, `${fp}[${i}]`, acc));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = fp ? `${fp}.${k}` : k;
    if (typeof v === 'string' && v.length > 4) acc.push({ field: p, text: v });
    else if (v && typeof v === 'object') collectTexts(v, p, acc);
  }
}

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : pool.records || [];
const partToExams = loadExamPartIds();
const examPartIds = new Set(partToExams.keys());

const allCases = [];

for (const rec of records) {
  const partId = rec.id || '(no-id)';
  const cell = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const texts = [];
  collectTexts(rec, '', texts);

  const seen = new Set();
  for (const { field, text } of texts) {
    for (const h of scanAmbiguous(text)) {
      const key = `${h.word}|${h.sentence.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allCases.push({
        partId,
        cell,
        field,
        exams: partToExams.get(partId) || null,
        ...h,
      });
    }
  }
}

const group1 = allCases.filter((c) => examPartIds.has(c.partId));
const group2 = allCases.filter((c) => !examPartIds.has(c.partId));

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('AMBIGUOS Nivel 2 — split por uso en exámenes E1–E5');
console.log('══════════════════════════════════════════════════════════════════\n');
console.log(`Total casos: ${allCases.length}`);
console.log(`Grupo 1 (E1–E5): ${group1.length} casos · ${new Set(group1.map((c) => c.partId)).size} partes`);
console.log(`Grupo 2 (resto):  ${group2.length} casos · ${new Set(group2.map((c) => c.partId)).size} partes`);

console.log('\n── GRUPO 1: prioridad (exámenes E1–E5) ──────────────────────────\n');

if (group1.length === 0) {
  console.log('  (ninguno)');
} else {
  const byExam = {};
  for (const c of group1) {
    for (const { exam } of c.exams) {
      if (!byExam[exam]) byExam[exam] = [];
      byExam[exam].push(c);
    }
  }

  for (const examNum of [1, 2, 3, 4, 5]) {
    const items = group1.filter((c) => c.exams.some((e) => e.exam === examNum));
    if (!items.length) continue;

    const uniq = [];
    const seen = new Set();
    for (const c of items) {
      const k = `${c.partId}|${c.word}|${c.sentence.slice(0, 60)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(c);
    }

    console.log(`\n### Examen ${examNum} (${uniq.length} casos)\n`);
    console.log('| Palabra | Frase | Parte | Celda |');
    console.log('|---------|-------|-------|-------|');
    for (const c of uniq.sort((a, b) => a.lc.localeCompare(b.lc) || a.partId.localeCompare(b.partId))) {
      const examCells = c.exams.filter((e) => e.exam === examNum).map((e) => e.cell).join(', ');
      const frase = c.sentence.replace(/\|/g, '/').slice(0, 120);
      const parte = c.partId.length > 36 ? `…${c.partId.slice(-32)}` : c.partId;
      console.log(`| **${c.word}** | ${frase}${c.sentence.length > 120 ? '…' : ''} | \`${parte}\` | ${examCells} |`);
    }
  }

  console.log('\n── Detalle completo (Grupo 1) ──\n');
  const seenGlobal = new Set();
  for (const c of group1.sort((a, b) => a.lc.localeCompare(b.lc) || a.partId.localeCompare(b.partId))) {
    const k = `${c.partId}|${c.word}|${c.sentence}`;
    if (seenGlobal.has(k)) continue;
    seenGlobal.add(k);
    const exams = c.exams.map((e) => `E${e.exam}/${e.cell}`).join(', ');
    console.log(`• **${c.word}** — ${c.sentence}`);
    console.log(`  Parte: \`${c.partId}\` (${c.cell}) · Exámenes: ${exams}`);
    console.log('');
  }
}

console.log('── GRUPO 2: secundario (resumen) ──');
console.log(`  ${group2.length} casos en ${new Set(group2.map((c) => c.partId)).size} partes — revisar cuando haya tiempo\n`);
