#!/usr/bin/env node
/**
 * Archive vocab-bg --selftest artifacts that landed in pool-verified (2026-07-14).
 * Keeps horen-t2-gemini-038.json; retires duplicates and other selftest Hören T1 runs.
 *
 *   node scripts/archive-vocab-bg-selftest-pool-2026-07-14.mjs
 *   node scripts/archive-vocab-bg-selftest-pool-2026-07-14.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const ARCHIVE = path.join(ROOT, 'batches/needs-regeneration/_selftest-archive-2026-07-14');
const SEED = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/vocab-bg-selftest-archive-2026-07-14.json');

const KEEP = new Set(['horen-t2-gemini-038.json']);

/** Retire: T2 duplicates + Hören T1 selftest runs (skipQuality, failed anchor gate). */
const RETIRE = [
  'horen-t2-gemini-036.json',
  'horen-t2-gemini-037.json',
  'horen-t1-gemini-026.json',
  'horen-t1-gemini-027.json',
  'horen-t1-gemini-028.json',
  'horen-t1-gemini-029.json',
  'horen-t1-gemini-030.json',
];

const SEED_REMOVE_SOURCE = [
  'batches/ready/pool-verified/horen-t1-gemini-026.json',
];

const dryRun = process.argv.includes('--dry-run');
const report = { kept: [...KEEP], retired: [], seedRemoved: [], errors: [] };

function archiveFile(file) {
  const src = path.join(POOL, file);
  if (!fs.existsSync(src)) {
    report.errors.push({ file, error: 'not_in_pool_verified' });
    return;
  }
  const dest = path.join(ARCHIVE, file);
  if (dryRun) {
    report.retired.push({ file, from: path.relative(ROOT, src), to: path.relative(ROOT, dest), dryRun: true });
    return;
  }
  fs.mkdirSync(ARCHIVE, { recursive: true });
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  batch._selftestArchive = {
    at: new Date().toISOString(),
    reason: 'vocab_bg_selftest_skipQuality_pollution',
    keeper: [...KEEP][0],
  };
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`);
  fs.unlinkSync(src);
  report.retired.push({ file, from: path.relative(ROOT, src), to: path.relative(ROOT, dest) });
}

for (const file of RETIRE) archiveFile(file);

if (fs.existsSync(SEED)) {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const records = seed.records || seed.parts || [];
  const before = records.length;
  const filtered = records.filter((p) => !SEED_REMOVE_SOURCE.includes(p.sourceFile));
  const removed = before - filtered.length;
  if (removed > 0) {
    if (dryRun) {
      report.seedRemoved = SEED_REMOVE_SOURCE.map((s) => ({ sourceFile: s, dryRun: true }));
    } else {
      if (seed.records) seed.records = filtered;
      else seed.parts = filtered;
      seed._count = filtered.length;
      fs.writeFileSync(SEED, `${JSON.stringify(seed, null, 2)}\n`);
      report.seedRemoved = SEED_REMOVE_SOURCE.map((s) => ({ sourceFile: s, removed: true }));
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (!dryRun) fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length ? 1 : 0);
