#!/usr/bin/env node
/**
 * Append Sprechen T1–T3 to published official-de-B1-e1 only (pilot).
 * Source: batches/merged/sprechen-stadtfest-planung-01.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPartHash, normalizePartSnapshot } from './lib/partContentHash.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E1_PATH = path.join(ROOT, 'library/published-exams/de/B1/official-de-B1-e1.json');
const CATALOG_PATH = path.join(ROOT, 'library/published-exams/de/B1/_catalog.json');
const BATCH = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/merged/sprechen-stadtfest-planung-01.json'), 'utf8'),
);

const INSTRUCTIONS = {
  1: 'Sprechen Teil 1 — Gemeinsam planen und sich einigen.',
  2: 'Sprechen Teil 2 — Kurze Präsentation halten.',
  3: 'Sprechen Teil 3 — Feedback geben und Fragen stellen.',
};

const TASK_FORMAT = { 1: 'plan_together', 2: 'presentation', 3: 'feedback_questions' };

function buildPart(teil) {
  const q = BATCH.questions.find((x) => Number(x.teil) === teil);
  if (!q) throw new Error(`missing teil ${teil} in batch`);
  const partId = `snap-de-B1-e1-sprechen-t${teil}-stadtfest`;
  const snapshot = normalizePartSnapshot({
    id: partId,
    lang: 'de',
    level: 'B1',
    module: 'sprechen',
    teil,
    instruction: INSTRUCTIONS[teil],
    taskFormat: TASK_FORMAT[teil],
    questions: [
      {
        id: q.id,
        module: 'sprechen',
        teil,
        type: 'short_answer',
        question: q.question,
        correct: 'rubric',
        correctAnswer: 'rubric',
      },
    ],
    complete: true,
    verified: true,
  });
  return {
    cell: `sprechen_${teil}`,
    module: 'sprechen',
    teil,
    partId,
    contentHash: canonicalPartHash(snapshot),
    snapshot,
  };
}

const doc = JSON.parse(fs.readFileSync(E1_PATH, 'utf8'));
const existing = doc.parts.filter((p) => p.module === 'sprechen');
if (existing.length >= 3) {
  console.log('E1 already has sprechen parts — skipping write');
  process.exit(0);
}

doc.parts = doc.parts.filter((p) => p.module !== 'sprechen');
for (const teil of [1, 2, 3]) doc.parts.push(buildPart(teil));

doc.manifestVersion = (doc.manifestVersion || 1) + 1;
doc.previousManifestVersion = doc.manifestVersion - 1;
doc.publishedAt = new Date().toISOString();
doc.sourceAssembled = `${doc.sourceAssembled || 'assembled-exam-b1-e1.json'} + sprechen-stadtfest-planung-01`;

fs.writeFileSync(E1_PATH, `${JSON.stringify(doc, null, 2)}\n`);

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const entry = catalog.exams.find((e) => e.examId === 'official-de-B1-e1');
if (entry) {
  entry.manifestVersion = doc.manifestVersion;
  entry.publishedAt = doc.publishedAt;
  catalog.version = doc.publishedAt;
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

console.log(`Updated ${path.relative(ROOT, E1_PATH)}`);
console.log(`  parts: ${doc.parts.length} (manifest v${doc.manifestVersion})`);
for (const p of doc.parts.filter((x) => x.module === 'sprechen')) {
  console.log(`  ${p.cell}  ${p.partId}  hash=${p.contentHash.slice(0, 16)}…`);
}
