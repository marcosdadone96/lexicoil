#!/usr/bin/env node
/**
 * Retira lesen-t3-gemini-053 del pool servible (pool-verified + reusable-seed).
 *   node scripts/retire-a2-lesen-t3-gemini-053.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const FILE = 'lesen-t3-gemini-053.json';
const SEED_ID = 'pub-de-A2-lesen-t3-8e5a48edd91f';
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const needsDir = path.join(ROOT, 'batches/needs-regeneration/A2');
const seedPath = path.join(ROOT, 'library/reusable-seed/de_A2.json');
const at = new Date().toISOString();

const log = {
  at,
  file: FILE,
  seedId: SEED_ID,
  reasons: [
    'missing _balanceMcqVersion (pipeline bug — fixed in coerceGeneratedLesenPart)',
    'CHK-33 Q2/Q4 mcq length bias pending content fix before re-publish',
    'CHK-34 Q5 explanation missing option C quote pending content fix',
  ],
  poolVerifiedRemoved: false,
  seedRemoved: false,
  seedRecordsBefore: null,
  seedRecordsAfter: null,
};

fs.mkdirSync(needsDir, { recursive: true });

const poolSrc = path.join(poolDir, FILE);
if (fs.existsSync(poolSrc)) {
  const batch = JSON.parse(fs.readFileSync(poolSrc, 'utf8'));
  batch._poolRetiredAt = at;
  batch._poolRetiredReason = 'operator-retire-2026-08-01-missing-stamps-pending-chk33-chk34';
  batch._poolRetiredFrom = `pool-verified/A2/${FILE}`;
  batch._notServableUntil = 're-normalize + fix CHK-33 Q2/Q4 + CHK-34 Q5';
  fs.writeFileSync(path.join(needsDir, FILE), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.unlinkSync(poolSrc);
  log.poolVerifiedRemoved = true;
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
log.seedRecordsBefore = seed.records?.length ?? 0;
const before = seed.records?.length ?? 0;
seed.records = (seed.records || []).filter(
  (r) => r.id !== SEED_ID && !String(r.sourceFile || '').includes(FILE),
);
log.seedRecordsAfter = seed.records.length;
log.seedRemoved = seed.records.length < before;
fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

const out = path.join(ROOT, 'batches/ready/gate-logs/retire-a2-lesen-t3-gemini-053-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(log, null, 2));
