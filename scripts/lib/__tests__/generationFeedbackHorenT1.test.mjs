/**
 * Hören T1 multi-passage vocab shell + caps spot-check for fixes-raiz 2026-07-27.
 * Run: node scripts/lib/__tests__/generationFeedbackHorenT1.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVocabFeedback } from '../generationFeedback.mjs';
import { applyGermanCapsNormalize } from '../germanCapsNormalize.mjs';
import { getHorenT2OpeningsForTopic } from '../horenOpeningsBank.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified/B1');

let failed = 0;

function ok(msg) {
  console.log(`  ✅  ${msg}`);
}

function bad(msg, detail = '') {
  console.error(`  ❌  ${msg}`);
  if (detail) console.error(`       ${detail}`);
  failed += 1;
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(POOL, name), 'utf8'));
}

console.log('\n── Causa 2: Hören T1 vocab ratio (all passages) ──');

for (const file of ['horen-t1-gemini-055.json', 'horen-t1-gemini-056.json', 'horen-t1-gemini-057.json']) {
  const batch = load(file);
  const requested = batch.userVocabFeedback?.requested || [];
  const fb = computeVocabFeedback(batch, requested, { topic: batch.topicTag });
  const oldRatio = batch.userVocabFeedback?.ratio ?? 0;
  if (fb.ratio <= oldRatio + 0.01 && fb.ratio < 0.35) {
    bad(`${file}: ratio ${fb.ratio.toFixed(2)} not improved vs stored ${oldRatio.toFixed(2)}`, `used: ${fb.used.join(', ')}`);
  } else {
    ok(`${file}: ratio ${oldRatio.toFixed(2)} → ${fb.ratio.toFixed(2)} (used: ${fb.used.join(', ') || '—'})`);
  }
}

console.log('\n── Causa 1: caps normalize on evidence batches ──');

const CAP_CASES = [
  {
    file: 'horen-t1-gemini-057.json',
    needle: /mit gesunden angeboten/i,
    expect: /mit gesunden Angeboten/,
  },
  {
    file: 'horen-t1-gemini-055.json',
    needle: /von angeboten|Welche Art von angeboten/i,
    expect: /Angeboten/,
  },
  {
    file: 'horen-t2-gemini-091.json',
    needle: /von angeboten/i,
    expect: /von Angeboten/,
  },
  {
    file: 'lesen-t2-gemini-165.json',
    needle: /zu diskussionen/i,
    expect: /zu Diskussionen/,
  },
];

for (const c of CAP_CASES) {
  const batch = load(c.file);
  const { batch: normed } = applyGermanCapsNormalize(batch, { verbose: false });
  const blob = JSON.stringify(normed);
  if (!c.needle.test(blob)) {
    ok(`${c.file}: no lowercase bug left in pool (needle absent)`);
    continue;
  }
  if (c.expect.test(blob)) {
    ok(`${c.file}: ${c.expect}`);
  } else {
    bad(`${c.file}: expected ${c.expect} after normalize`);
  }
}

console.log('\n── Causa 3: Bildung topic openings pool ──');
const bildung = getHorenT2OpeningsForTopic('Bildung');
if (bildung.length >= 4) {
  ok(`Bildung has ${bildung.length} topic-specific openings`);
} else {
  bad(`Bildung openings count ${bildung.length} < 4`);
}

console.log(`\n── Result: ${failed} failed ──`);
if (failed) process.exit(1);
