#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  checkRetiredRestoreToPoolVerified,
  assertSafeCopyIntoPoolVerified,
} from '../poolRetiredRestoreGuard.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-retired-guard-'));
const needs = path.join(tmp, 'needs-regeneration', 'A2');
const pool = path.join(tmp, 'pool-verified', 'A2');
fs.mkdirSync(needs, { recursive: true });
fs.mkdirSync(pool, { recursive: true });

const retired = path.join(needs, 'horen-t3-gemini-039.json');
fs.writeFileSync(
  retired,
  `${JSON.stringify({ _poolRetiredReason: 'A2-horen-hot-pair-sweep-2026-07-27', topicTag: 'Kultur' }, null, 2)}\n`,
);
const dest = path.join(pool, 'horen-t3-gemini-039.json');

const blocked = checkRetiredRestoreToPoolVerified({ sourceAbs: retired, destAbs: dest });
assert.equal(blocked.blocked, true);
assert.match(blocked.message, /BLOQUEADO/);
assert.match(blocked.message, /hot-pair-sweep/);

let threw = false;
try {
  assertSafeCopyIntoPoolVerified({ sourceAbs: retired, destAbs: dest, acknowledgeRetiredRestore: false });
} catch (e) {
  threw = true;
  assert.equal(e.code, 'POOL_RETIRED_RESTORE_BLOCKED');
}
assert.equal(threw, true);

const ok = checkRetiredRestoreToPoolVerified({
  sourceAbs: retired,
  destAbs: dest,
  acknowledgeRetiredRestore: true,
});
assert.equal(ok.blocked, false);
assert.equal(ok.acknowledged, true);

const clean = path.join(needs, 'clean.json');
fs.writeFileSync(clean, `${JSON.stringify({ topicTag: 'Freizeit' }, null, 2)}\n`);
assert.equal(checkRetiredRestoreToPoolVerified({ sourceAbs: clean, destAbs: path.join(pool, 'clean.json') }).blocked, false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('PASS: poolRetiredRestoreGuard');
