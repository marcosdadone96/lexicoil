#!/usr/bin/env node
/**
 * Generate activation preview artifacts for A2 e2–e4 (no writes to prod paths).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partRecordToExamPart } from '../audit-pass-2.mjs';
import { readPublishedExam } from '../lib/publishedExamLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/.tmp-a2-activation-preview');

function publishedDocToServedExam(doc) {
  const buckets = { lesen: [], horen: [], schreiben: [], sprechen: [] };
  for (const p of doc.parts || []) {
    const part = partRecordToExamPart(p.snapshot);
    if (!part || !buckets[p.module]) continue;
    buckets[p.module].push(part);
  }
  const sort = (arr) => arr.sort((a, b) => a.teil - b.teil);
  return {
    id: doc.examId,
    examId: doc.examId,
    topic: doc.title || `Official ${doc.level} Exam ${doc.slot}`,
    level: doc.level,
    lang: doc.lang,
    slot: doc.slot,
    goetheFormat: true,
    libraryBuilt: true,
    publishedExam: true,
    lesenParts: sort(buckets.lesen),
    horenParts: sort(buckets.horen),
    schreibenParts: sort(buckets.schreiben),
    sprechenParts: sort(buckets.sprechen),
    curated: true,
  };
}

const catalogBefore = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/published-exams/de/A2/_catalog.json'), 'utf8'),
);

const catalogAfter = {
  ...catalogBefore,
  version: new Date().toISOString(),
  exams: [1, 2, 3, 4].map((slot) => {
    const existing = (catalogBefore.exams || []).find((e) => e.slot === slot);
    const publishedAt =
      existing?.publishedAt ||
      (slot === 1 ? '2026-07-22T13:30:16.503Z' : '2026-08-09T09:24:54.616Z');
    return {
      examId: `official-de-A2-e${slot}`,
      slot,
      title: `Official A2 Exam ${slot}`,
      status: 'live',
      manifestVersion: 1,
      publishedAt,
    };
  }),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_catalog.after.json'), `${JSON.stringify(catalogAfter, null, 2)}\n`);

const exams = [];
for (const row of catalogAfter.exams) {
  const doc = await readPublishedExam({
    store: null,
    lang: 'de',
    level: 'A2',
    examId: row.examId,
    preferLocal: true,
  });
  if (!doc) throw new Error(`missing ${row.examId}`);
  exams.push(publishedDocToServedExam(doc));
}
fs.writeFileSync(path.join(OUT, 'de_A2.after.json'), `${JSON.stringify(exams, null, 2)}\n`);

const availBefore = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/availability.json'), 'utf8'));
const availAfter = structuredClone(availBefore);
availAfter.de.A2.exams = 4;
fs.writeFileSync(path.join(OUT, 'availability.after.json'), `${JSON.stringify(availAfter, null, 2)}\n`);

const verifyBefore = fs.readFileSync(path.join(ROOT, 'scripts/verify-a2-app-catalog.mjs'), 'utf8');
const verifyAfter = verifyBefore.replaceAll('=== 1', '=== 4');
fs.writeFileSync(path.join(OUT, 'verify-a2-app-catalog.after.mjs'), verifyAfter);

console.log(
  JSON.stringify(
    {
      outDir: path.relative(ROOT, OUT),
      catalogExamsBefore: catalogBefore.exams?.length,
      catalogExamsAfter: catalogAfter.exams?.length,
      servedCountAfter: exams.length,
      servedIds: exams.map((e) => e.examId),
      deA2BeforeBytes: fs.statSync(path.join(ROOT, 'data/exams/de_A2.json')).size,
      deA2AfterBytes: fs.statSync(path.join(OUT, 'de_A2.after.json')).size,
      availabilityExamsBefore: availBefore.de?.A2?.exams,
      availabilityExamsAfter: availAfter.de?.A2?.exams,
    },
    null,
    2,
  ),
);
