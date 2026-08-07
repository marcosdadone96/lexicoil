#!/usr/bin/env node
/**
 * Vocab bg anchor gate — planner + post-gen verification.
 * Run: node scripts/test-vocab-bg-anchor-gate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planVocabBgGeneration } from './lib/planVocabBgGeneration.mjs';
import { verifyBgAnchorIntegration } from './lib/vocabBgAnchorGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(ROOT, 'batches/ready/pool-verified/B1/horen-t1-gemini-026.json');

const pending = ['fitness', 'therapie', 'urlaub', 'umwelt'].map((word, i) => ({
  word,
  lang: 'de',
  level: 'B1',
  key: `${word}|de`,
  savedAt: Date.now() - i * 1000,
}));

const planHoren = planVocabBgGeneration({
  pendingWords: pending,
  preferredModule: 'horen',
});

const batch = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
// Sample was generated with OLD planner (Umwelt + FIFO anchor fitness/therapie in prompt but topic Umwelt).
const oldAnchors = ['fitness', 'therapie'];
const anchorCheck = verifyBgAnchorIntegration(batch, oldAnchors);

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log('OK  ', msg);
  } else {
    failed++;
    console.error('FAIL', msg);
  }
}

console.log('Plan (horen, 4 pending):', {
  topic: planHoren.topic,
  userAnchor: planHoren.userAnchor,
  words: planHoren.words,
});

ok(planHoren.userAnchor.length >= 2, 'anchor includes at least 2 user lemmas from pending');
ok(planHoren.userAnchor.length >= 2 && planHoren.userAnchor[0] === 'fitness', 'anchor prefers fitness first');
ok(planHoren.topic === 'Gesundheit', 'topic Gesundheit when 2 health lemmas pending');

const requested = batch.userVocabFeedback?.requested || planHoren.words;
const allWordsCheck = verifyBgAnchorIntegration(batch, requested);
ok(anchorCheck.count < 2, `sample fails anchor gate (${anchorCheck.count}/2)`);
ok(anchorCheck.count === 0, 'fitness+therapie not in Umwelt Hören sample');
ok(allWordsCheck.count === 1, `sample integrates 1/${requested.length} total prompted words`);

ok(!anchorCheck.ok, 'anchor gate rejects sample batch');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
