/**
 * Lesen T2 CEFR passage-length repair — 1 LLM call, questions unchanged.
 * Run: node scripts/lib/__tests__/lesen-t2-passage-length.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  combinedPassageWordCount,
  isOnlyCefrLengthAboveMax,
  repairT2PassageLengthBatch,
  verifyT2IngestOk,
  CEFR_T2_COMBINED_MAX,
} from '../passageLengthRepair.mjs';
import { buildT2PassageLengthRepairPrompt } from '../lesenTemplatePrompt.mjs';
import { classifyAndRepair } from '../repairTriage.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(ROOT, 'batches/rejected/lesen-t2-gemini-111.json');

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

const batch = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const questionsBefore = JSON.stringify(batch.questions);

test('fixture 111 exceeds CEFR combined max', () => {
  const wc = combinedPassageWordCount(batch);
  assert.equal(wc, 457);
  assert.ok(wc > CEFR_T2_COMBINED_MAX);
});

test('ingest fails only on length_above_max', () => {
  const ingest = verifyT2IngestOk(batch, { batchId: 'lesen-t2-gemini-111' });
  assert.equal(ingest.ok, false);
  const errors = ingest.results.flatMap((r) => r.errors);
  assert.ok(isOnlyCefrLengthAboveMax(errors));
});

test('repair prompt mentions sum ≤400 and fixed questions', () => {
  const prompt = buildT2PassageLengthRepairPrompt({
    passages: batch.passages,
    questions: batch.questions,
    combinedBefore: 457,
    targetMax: 395,
    vocabWords: ['koffer', 'aufgabe'],
    topicTag: 'Reisen',
  });
  assert.match(prompt, /SUMA.*400|≤395/i);
  assert.match(prompt, /PREGUNTAS.*aprobadas|NO las modifiques/i);
  assert.match(prompt, /koffer/i);
});

test('triage routes pre-ingest CEFR length to passage_length repair', () => {
  const triage = classifyAndRepair(batch, {
    gate: 'cefr',
    reason: 'pre-ingest',
    issue: 'cefr_gate:length_above_max:wordCount=457,max=400',
    issues: ['cefr_gate:length_above_max:wordCount=457,max=400'],
  });
  assert.equal(triage.repairKind, 'passage_length');
  assert.equal(triage.repaired, 'targeted');
});

await (async () => {
  let llmCalls = 0;
  const mockLlm = async ({ prompt }) => {
    llmCalls++;
    assert.match(prompt, /457/);
    const trimmed = batch.passages.map((p) => {
      const words = String(p.text).trim().split(/\s+/);
      const cut = Math.ceil((457 - 390) / 2);
      return {
        id: p.id,
        title: p.title,
        text: words.slice(0, Math.max(140, words.length - cut)).join(' '),
      };
    });
    return { text: JSON.stringify({ passages: trimmed }) };
  };

  const repaired = await repairT2PassageLengthBatch(batch, mockLlm, {});
  try {
    assert.equal(llmCalls, 1, 'exactly 1 LLM call');
    assert.ok(repaired, 'repair returned batch');
    assert.ok(combinedPassageWordCount(repaired) <= CEFR_T2_COMBINED_MAX);
    assert.equal(JSON.stringify(repaired.questions), questionsBefore, 'questions unchanged');
    const ingest = verifyT2IngestOk(repaired, { batchId: 'lesen-t2-gemini-111-repaired' });
    assert.equal(ingest.ok, true, `ingest OK after trim: ${ingest.results[0]?.errors?.join('; ')}`);
    console.log(`  ✅  mock repair: 457 → ${combinedPassageWordCount(repaired)} words, ingest OK`);
    passed++;
  } catch (err) {
    console.error('  ❌  mock repair end-to-end');
    console.error(`     ${err.message}`);
    failed++;
  }
})();

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
