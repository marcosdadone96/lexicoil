#!/usr/bin/env node
/**
 * Phase C verification — stock deficit report, vocab index gate, planner tests (no API gen).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPartVocabIndexForPool, MIN_POOL_VOCAB_KEYS } from './lib/personalPoolPublishVocabGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, args) {
  console.log(`\n══ ${label} ══\n`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const deficitPath = path.join(ROOT, 'batches/ready/gate-logs/personal-pool-realistic-deficit.json');
if (!fs.existsSync(deficitPath)) {
  run('calc-personal-pool-realistic-deficit', ['scripts/calc-personal-pool-realistic-deficit.mjs']);
}
const deficit = JSON.parse(fs.readFileSync(deficitPath, 'utf8'));
assert('deficit report has launchMinPerCell', deficit.launchMinPerCell === 3);
console.log(
  `Stock: ${deficit.zeroCellCount} zero cells, ${deficit.cellsBelowLaunchMin} below launch min (${deficit.partsToReachLaunchMin} parts to fix)`,
);

const sparsePart = { text: 'kurz', questions: [{ question: 'Q?', options: ['a', 'b'], correct: 0 }] };
assert(
  'vocab index gate rejects sparse part',
  !verifyPartVocabIndexForPool(sparsePart, { module: 'lesen' }).ok,
);
const seedPath = path.join(ROOT, 'library/reusable-seed/de_B1.json');
if (fs.existsSync(seedPath)) {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { vocabKeysFromPart } = req(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const goodRec = (seed.records || []).find((r) => {
    if (String(r.module).toLowerCase() !== 'lesen') return false;
    const part = r.part || r;
    return vocabKeysFromPart(part).length >= MIN_POOL_VOCAB_KEYS;
  });
  assert('seed has lesen part with vocab index', !!goodRec);
  assert(
    'vocab index gate accepts seeded lesen part',
    verifyPartVocabIndexForPool(goodRec.part || goodRec, { module: 'lesen' }).ok,
  );
}
assert('MIN_POOL_VOCAB_KEYS is 3', MIN_POOL_VOCAB_KEYS === 3);

run('test-personal-module-vocab-plan', ['scripts/test-personal-module-vocab-plan.mjs']);
run('test-vocab-bg-anchor-gate', ['scripts/test-vocab-bg-anchor-gate.mjs']);

const summaryPath = path.join(ROOT, 'library/pool-stock/de_B1-summary.json');
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert('pool-stock summary present', summary.byTopic && summary.modules);
}

console.log('\nPhase C infra verification passed (content fill remains operational).\n');
