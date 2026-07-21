#!/usr/bin/env node
/**
 * detectRepairable must use fieldsChanged (net drift), not decap/cap internal counters.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  poolReadyCheck,
  poolReadyCheckWithRepair,
  applyPoolRepairs,
} from '../poolReadyCheck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(ROOT, 'batches/needs-regeneration/horen-t4-gemini-014.json');

const batch = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const first = await poolReadyCheck(batch, {
  file: 'horen-t4-gemini-014.json',
  skipQ1: true,
  skipQ2: true,
});
assert.equal(
  first.verdict,
  'READY',
  `expected READY after fieldsChanged fix, got ${first.verdict} (${first.repairReasons?.join(',')})`,
);

const { batch: repaired, applied } = applyPoolRepairs(batch);
const second = await poolReadyCheck(repaired, {
  file: 'horen-t4-gemini-014.json',
  skipQ1: true,
  skipQ2: true,
});
assert.equal(second.verdict, 'READY');

const withRepair = await poolReadyCheckWithRepair(batch, {
  file: 'horen-t4-gemini-014.json',
  skipQ1: true,
  skipQ2: true,
});
assert.equal(withRepair.verdict, 'READY');

console.log('PASS: repairable idempotent caps detect (horen-t4-gemini-014)');
console.log(`  applyPoolRepairs: ${applied.length ? applied.join('; ') : '(stamp only)'}`);
