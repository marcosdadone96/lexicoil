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

const catalog = JSON.parse(fs.readFileSync(path.join(DIR, '_catalog.json'), 'utf8'));
const live = (catalog.exams || []).filter((e) => e.status === 'live');
ok(live.length === 1, `catalog has 1 live exam (got ${live.length})`);

for (const row of live) {
  const n = row.slot || 1;
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${row.examId}.json`), 'utf8'));
  const served = publishedDocToServedExam(doc);
  ok(served.lesenParts.length === 5, `E${n} lesenParts=5`);
  ok(served.horenParts.length === 4, `E${n} horenParts=4`);
  ok(served.schreibenParts.length === 3, `E${n} schreibenParts=3`);
  const l3 = served.lesenParts.find((p) => p.teil === 3);
  ok(l3?.ads?.length === 10, `E${n} L3 ads=10`);
  ok(l3?.questions?.length >= 7, `E${n} L3 questions`);
}

console.log(failed ? `\n${failed} failure(s)` : '\nAll conversion checks passed.');
process.exit(failed ? 1 : 0);
