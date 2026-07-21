/**
 * T3 pool dedup gate tests
 * Run: node scripts/lib/__tests__/t3-pool-dedup-gate.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import {
  checkT3PoolDedup,
  resetPoolVerifiedT3IndexCache,
  T3_SHARED_MOLD_FAMILY,
} from '../t3PoolDedupGate.mjs';
import { buildValidatedT3Part } from '../../make-t3.mjs';
import { poolReadyCheck } from '../poolReadyCheck.mjs';
import { replaceLesenT3SeekerName } from '../lesenT3NamesBank.mjs';

const POOL006 = path.join(ROOT, 'batches/ready/pool-verified/B1/lesen-t3-gemini-006.json');

function load006() {
  return JSON.parse(fs.readFileSync(POOL006, 'utf8'));
}

async function test006SelfExcludedPassesGate() {
  resetPoolVerifiedT3IndexCache();
  const batch = load006();
  const gate = checkT3PoolDedup(batch, { file: 'lesen-t3-gemini-006.json' });
  assert.equal(gate.ok, true, `self should pass: ${gate.reasons}`);
  const ready = await poolReadyCheck(batch, { file: 'lesen-t3-gemini-006.json', skipQ2: true });
  const t3reasons = (ready.reasons || []).filter((r) => r.startsWith('t3_'));
  assert.equal(t3reasons.length, 0, `poolReady t3 reasons: ${t3reasons}`);
}

function testDuplicateCoreFpBlocked() {
  resetPoolVerifiedT3IndexCache();
  const batch = load006();
  const gate = checkT3PoolDedup(batch, { reload: true });
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('t3_situation_core_duplicate'));
}

function testFamilySlugBlocked() {
  resetPoolVerifiedT3IndexCache();
  const batch = load006();
  batch._blueprintSlug = 'bp-ernaehrung';
  const gate = checkT3PoolDedup(batch, { reload: true });
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('t3_shared_mold_family_limit'));
}

function testSecondErnaehrungGenerationBlocked() {
  resetPoolVerifiedT3IndexCache();
  let threw = false;
  try {
    buildValidatedT3Part({ requestedTopic: 'Ernährung', exclude: new Set(), maxAttempts: 3 });
  } catch (e) {
    threw = true;
    assert.match(String(e.message), /exhausted|ningún blueprint|pool dedup|sin stock/i);
  }
  assert.equal(threw, true, 'second family generation must not succeed while 006 in pool');
}

function testGenderFixHelper() {
  const fixed = replaceLesenT3SeekerName(
    'Herr Walter braucht Hilfe beim Ausfüllen ihrer Steuererklärung.',
    'Herr Keller',
    { replaceAnySeeker: true },
  );
  assert.match(fixed, /Herr Keller/);
  assert.match(fixed, /\bseiner\b/);
  assert.doesNotMatch(fixed, /\bihrer\b/);
}

let passed = 0;
const tests = [
  ['006 self-excluded passes gate', () => test006SelfExcludedPassesGate()],
  ['duplicate core fp blocked', testDuplicateCoreFpBlocked],
  ['family slug blocked (ernaehrung)', testFamilySlugBlocked],
  ['second Ernährung gen blocked', testSecondErnaehrungGenerationBlocked],
  ['gender fix helper', testGenderFixHelper],
];

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
console.log('family slugs:', T3_SHARED_MOLD_FAMILY.join(', '));
