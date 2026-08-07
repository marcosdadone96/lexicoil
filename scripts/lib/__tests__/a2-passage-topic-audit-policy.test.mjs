#!/usr/bin/env node
/**
 * A2 official batch topicTag → passage content_topic_mismatch is audit-only (not pool reject).
 * Run: node scripts/lib/__tests__/a2-passage-topic-audit-policy.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { poolReadyCheck } from '../poolReadyCheck.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const categoryD = [
  'horen-t4-cur-society.json',
  'lesen-t2-cur-education.json',
  'lesen-t2-cur-society.json',
  'lesen-t3-cur-work.json',
  'lesen-t4-cur-education.json',
  'lesen-t4-cur-health.json',
  'lesen-t4-cur-society.json',
  'lesen-t4-cur-work.json',
];

for (const file of categoryD) {
  const fp = path.join(poolDir, file);
  assert.ok(fs.existsSync(fp), `${file} exists in pool`);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const ready = await poolReadyCheck(batch, {
    file,
    level: 'A2',
    skipQ1: true,
    skipQ2: true,
  });
  const topicRejects = (ready.reasons || []).filter(
    (r) => r === 'content_topic_mismatch' || r === 'topic_mismatch',
  );
  assert.equal(
    topicRejects.length,
    0,
    `${file} must not reject on passage-level topic detector (${topicRejects.join(', ')})`,
  );
  const audits = (ready.details || []).filter(
    (d) =>
      (d.rule === 'content_topic_mismatch' || d.rule === 'topic_mismatch') &&
      d.severity === 'audit',
  );
  assert.ok(audits.length >= 1, `${file} logs at least one topic audit when detector fires`);
}

console.log('PASS: a2-passage-topic-audit-policy');
