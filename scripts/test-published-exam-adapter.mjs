#!/usr/bin/env node
/**
 * Verify published_exam snapshots → Goethe served shape (via partRecordToExamPart).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partRecordToExamPart } from './audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'library/published-exams/de/B1');

function publishedDocToServedExam(doc) {
  const buckets = { lesen: [], horen: [], schreiben: [], sprechen: [] };
  for (const p of doc.parts || []) {
    const part = partRecordToExamPart(p.snapshot);
    if (!part || !buckets[p.module]) continue;
    buckets[p.module].push(part);
  }
  const sort = (arr) => arr.sort((a, b) => a.teil - b.teil);
  return {
    examId: doc.examId,
    lesenParts: sort(buckets.lesen),
    horenParts: sort(buckets.horen),
    schreibenParts: sort(buckets.schreiben),
    sprechenParts: sort(buckets.sprechen),
  };
}

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else console.log('OK:', msg);
}

for (let n = 1; n <= 5; n++) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `official-de-B1-e${n}.json`), 'utf8'));
  const served = publishedDocToServedExam(doc);
  ok(served.lesenParts.length === 5, `E${n} lesenParts=5`);
  ok(served.horenParts.length === 4, `E${n} horenParts=4`);
  ok(served.schreibenParts.length === 3, `E${n} schreibenParts=3`);
  const l3 = served.lesenParts.find((p) => p.teil === 3);
  ok(l3?.ads?.length === 10, `E${n} L3 ads=10`);
  ok(l3?.questions?.length >= 7, `E${n} L3 questions`);
}

const e4 = publishedDocToServedExam(
  JSON.parse(fs.readFileSync(path.join(DIR, 'official-de-B1-e4.json'), 'utf8')),
);
const titles = e4.lesenParts.find((p) => p.teil === 3).ads.map((a) => a.title);
ok(titles.includes('TechDeal24'), 'E4 TechDeal24');
ok(titles.some((t) => String(t).includes('PC-Hilfe')), 'E4 PC-Hilfe');

const e3 = publishedDocToServedExam(
  JSON.parse(fs.readFileSync(path.join(DIR, 'official-de-B1-e3.json'), 'utf8')),
);
ok(e3.lesenParts.find((p) => p.teil === 3).ads.every((a) => (a.text || '').trim()), 'E3 L3 ads non-empty');

console.log(failed ? `\n${failed} failure(s)` : '\nAll conversion checks passed.');
process.exit(failed ? 1 : 0);
