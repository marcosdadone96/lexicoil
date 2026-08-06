/**
 * Lesen T2/T3/T4 ingest — wordsPerPassage must apply per passage/ad/intro, not summed Teil text.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const { batchToCandidates, miniExamFromCandidate } = await import('../../pipeline/lib/candidateBuilder.mjs');
const { resolveBlueprint, validateCandidate } = await import('../../pipeline/lib/validateCandidate.mjs');

const bp = resolveBlueprint('de', 'B1');

function validateBatchObj(batch, id) {
  const candidate = batchToCandidates(batch, {
    lang: 'de',
    level: 'B1',
    blueprint: bp,
    batchId: id,
  })[0];
  return validateCandidate(candidate, bp);
}

function validateBatchFile(rel) {
  const batch = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
  return validateBatchObj(batch, path.basename(rel));
}

const t2 = validateBatchFile('batches/rejected/lesen-t2-gemini-146.json');
assert.equal(t2.valid, true, `T2 ingest should pass per-passage bounds: ${t2.errors.join('; ')}`);

const t3 = validateBatchFile('batches/rejected/lesen-t3-gemini-012.json');
assert.equal(t3.valid, true, `T3 ingest should pass per-ad bounds: ${t3.errors.join('; ')}`);

const t4 = validateBatchFile('batches/rejected/lesen-t4-gemini-069.json');
assert.equal(t4.valid, true, `T4 ingest should pass intro+sign bounds: ${t4.errors.join('; ')}`);

const t3pool = validateBatchFile('batches/ready/pool-verified/B1/lesen-t3-gemini-003.json');
assert.equal(t3pool.valid, true, `pool T3 should pass: ${t3pool.errors.join('; ')}`);

const exam4 = JSON.parse(readFileSync(path.join(ROOT, 'library/published-exams/de/B1/official-de-B1-e1.json'), 'utf8'));
const snap = exam4.parts.find((p) => p.cell === 'lesen_4').snapshot;
const batch4 = { passages: [snap.passage], questions: snap.questions };
const off4 = validateBatchObj(batch4, 'official-t4');
assert.equal(off4.valid, true, `official T4 should pass: ${off4.errors.join('; ')}`);

const exam2 = miniExamFromCandidate(
  batchToCandidates(JSON.parse(readFileSync(path.join(ROOT, 'batches/rejected/lesen-t2-gemini-146.json'), 'utf8')), {
    lang: 'de',
    level: 'B1',
    blueprint: bp,
    batchId: 't2',
  })[0],
);
const combined2 = CefrGate.wordCount(exam2.lesenParts[0].passages.map((p) => p.text).join(' '));
assert.ok(combined2 > 220, 'sanity: combined T2 passages exceed old erroneous max');
assert.ok(
  exam2.lesenParts[0].passages.every((p) => {
    const w = CefrGate.wordCount(p.text);
    return w >= 150 && w <= 220;
  }),
  'each T2 passage within per-item bounds',
);

// Concatenated blob would exceed max — ensure we itemize instead.
const exam3 = miniExamFromCandidate(
  batchToCandidates(JSON.parse(readFileSync(path.join(ROOT, 'batches/rejected/lesen-t3-gemini-012.json'), 'utf8')), {
    lang: 'de',
    level: 'B1',
    blueprint: bp,
    batchId: 't3',
  })[0],
);
const combined = CefrGate.wordCount(exam3.lesenParts[0].ads.map((a) => a.text).join(' '));
assert.ok(combined > 60, 'sanity: combined T3 ads exceed old erroneous max');
assert.ok(
  exam3.lesenParts[0].ads.every((a) => CefrGate.wordCount(a.text) <= 60),
  'each ad within per-item max',
);

console.log('OK lesen-t3-t4-ingest-length');
