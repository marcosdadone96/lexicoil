#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { auditAssembledFreshness } from '../assembledExamFreshness.mjs';

const asm = path.join(ROOT, 'batches/ready/assembled-from-verified/assembled-exam-a2-verified-e1.json');
const before = JSON.parse(fs.readFileSync(asm, 'utf8'));
const tampered = JSON.parse(fs.readFileSync(asm, 'utf8'));
const q = tampered.exam?.lesenParts?.[0]?.questions?.[0];
if (q) q.explanation = (q.explanation || '') + ' STALE-TAMPER';
const tmp = path.join(ROOT, 'batches/ready/gate-logs/_freshness-test-tamper.json');
fs.writeFileSync(tmp, `${JSON.stringify(tampered, null, 2)}\n`);
const stale = auditAssembledFreshness(tmp, 'A2');
assert.equal(stale.stale, true, 'tampered exam should be STALE');
const fresh = auditAssembledFreshness(asm, 'A2');
assert.equal(fresh.fresh, true, 'current e1 should be FRESH after reassemble');
fs.unlinkSync(tmp);
console.log('PASS: assembledExamFreshness');
