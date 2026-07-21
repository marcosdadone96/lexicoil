/**
 * part-file-brake.test.mjs — simulates per-file brake (no LLM)
 * Run: node scripts/lib/__tests__/part-file-brake.test.mjs
 */
import {
  initPartFileTracker,
  recordPartFileApiCall,
  checkPartFileBrake,
  assertPartFileBrake,
  PartFileBrakeError,
  DEFAULT_MAX_ATTEMPTS_PER_FILE,
  DEFAULT_MAX_COST_PER_FILE_USD,
} from '../partFileBrake.mjs';

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

console.log('\n── defaults ──');
assert('default max attempts', DEFAULT_MAX_ATTEMPTS_PER_FILE === 10);
assert('default max cost', DEFAULT_MAX_COST_PER_FILE_USD === 0.3);

console.log('\n── cost brake simulation ──');
{
  const session = {};
  const args = { maxAttemptsPerFile: 10, maxCostPerFileUsd: 0.3 };
  initPartFileTracker(session, args, { relFile: 'batches/generated/horen-t2-gemini-sim.json' });

  for (let i = 0; i < 9; i++) {
    recordPartFileApiCall(session, 0.032);
    assertPartFileBrake(session, args);
  }
  assert('9 calls under limit', !checkPartFileBrake(session, args).tripped);

  recordPartFileApiCall(session, 0.032);
  const brake = checkPartFileBrake(session, args);
  assert('10th call trips attempts', brake.tripped && brake.reason === 'max-attempts-per-file');

  let threw = false;
  try {
    assertPartFileBrake(session, args);
  } catch (e) {
    threw = e instanceof PartFileBrakeError;
    assert('PartFileBrakeError message mentions FRENO', /FRENO por archivo/.test(e.message));
  }
  assert('assertPartFileBrake throws', threw);
}

console.log('\n── cost-only brake ──');
{
  const session = {};
  const args = { maxAttemptsPerFile: 50, maxCostPerFileUsd: 0.3 };
  initPartFileTracker(session, args, { relFile: 'lesen-t2-gemini-cost.json' });
  recordPartFileApiCall(session, 0.28);
  assert('under cost', !checkPartFileBrake(session, args).tripped);
  recordPartFileApiCall(session, 0.05);
  const brake = checkPartFileBrake(session, args);
  assert('cost brake trips', brake.tripped && brake.reason === 'max-cost-per-file');
  assert('cost at trip ≥ 0.30', brake.costUsd >= 0.3);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
