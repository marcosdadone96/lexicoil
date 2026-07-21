#!/usr/bin/env node
/**
 * Backfill SEM-1 skip stamps on Sprechen seed records that were ingested after
 * pool-sanitize-execute (2026-07-05) without sem1Skipped / sem1VerifiedAt.
 *
 * Same stamp pattern as pool-sanitize-execute.mjs (Schreiben/Sprechen no-mcq):
 *   sem1Ok = true
 *   sem1VerifiedAt = existing || now
 *   sem1Skipped = 'no-mcq'
 *
 * Scope: module==='sprechen' && verified===true && complete===true
 *         && !sem1VerifiedAt && !sem1Skipped
 *
 *   node scripts/backfill-sprechen-sem1-skip.mjs --dry-run
 *   node scripts/backfill-sprechen-sem1-skip.mjs --confirm
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library', 'reusable-seed', 'de_B1.json');
const { partPassesPublishGate } = require(path.join(
  ROOT,
  'netlify/functions/lib/partPublishGate.js',
));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirm = args.includes('--confirm');

if (dryRun === confirm) {
  console.error('ERROR: specify exactly one of --dry-run or --confirm');
  process.exit(1);
}

function needsStamp(rec) {
  if (String(rec.module || '').toLowerCase() !== 'sprechen') return false;
  if (rec.verified !== true || rec.complete !== true) return false;
  if (rec.sem1VerifiedAt || rec.sem1Skipped) return false;
  return true;
}

function gateCounts(records) {
  const by = {};
  for (const r of records) {
    const m = String(r.module || '?').toLowerCase();
    if (!by[m]) by[m] = { total: 0, passGate: 0 };
    by[m].total++;
    if (partPassesPublishGate(r)) by[m].passGate++;
  }
  return by;
}

function main() {
  if (!fs.existsSync(SEED_FILE)) {
    console.error('Seed not found:', SEED_FILE);
    process.exit(1);
  }

  const pool = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const records = pool.records || [];
  const before = gateCounts(records);
  const targets = records.filter(needsStamp);

  const wrongModule = targets.filter((r) => String(r.module).toLowerCase() !== 'sprechen');
  const alreadyStamped = (pool.records || []).filter(
    (r) =>
      String(r.module || '').toLowerCase() === 'sprechen' &&
      r.verified === true &&
      r.complete === true &&
      (r.sem1VerifiedAt || r.sem1Skipped),
  );

  console.log('Seed:', path.relative(ROOT, SEED_FILE));
  console.log('Mode:', dryRun ? 'DRY-RUN' : 'CONFIRM (write)');
  console.log('Candidates (sprechen, verified+complete, no SEM-1 stamp):', targets.length);
  console.log('Wrong module in candidates:', wrongModule.length);
  console.log('Sprechen already stamped (skipped):', alreadyStamped.length);
  console.log('Gate counts BEFORE:', JSON.stringify(before, null, 2));

  if (wrongModule.length) {
    console.error('FATAL: candidate list includes non-sprechen');
    process.exit(1);
  }
  if (targets.length !== 60) {
    console.warn(`WARN: expected 60 candidates, got ${targets.length}`);
  }

  const now = new Date().toISOString();
  const stampedIds = [];

  for (const rec of targets) {
    // Mirror pool-sanitize-execute.mjs lines 161–166 (sprechen branch of no-mcq stamp)
    rec.sem1Ok = true;
    rec.sem1VerifiedAt = rec.sem1VerifiedAt || now;
    rec.sem1Skipped = 'no-mcq';
    stampedIds.push(rec.id);
  }

  const after = gateCounts(records);
  const sprechenPass = after.sprechen?.passGate ?? 0;

  console.log('Would stamp / stamped IDs:', stampedIds.length);
  if (stampedIds.length <= 5) console.log(stampedIds);
  else console.log([...stampedIds.slice(0, 3), `… +${stampedIds.length - 3} more`]);
  console.log('Gate counts AFTER (in-memory):', JSON.stringify(after, null, 2));
  console.log(`Sprechen partPassesPublishGate: ${sprechenPass}/${after.sprechen?.total ?? 0}`);

  for (const m of ['lesen', 'horen', 'schreiben']) {
    if (before[m]?.passGate !== after[m]?.passGate || before[m]?.total !== after[m]?.total) {
      console.error(`FATAL: ${m} gate/total changed`, before[m], after[m]);
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('\nDRY-RUN: no file written.');
    return;
  }

  pool._sprechenSem1SkipBackfillAt = now;
  pool._sprechenSem1SkipBackfillCount = stampedIds.length;
  pool._updatedAt = now;
  fs.writeFileSync(SEED_FILE, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${SEED_FILE} (${stampedIds.length} records stamped).`);

  // Re-read verify
  const verify = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const vCounts = gateCounts(verify.records || []);
  const stillNeed = (verify.records || []).filter(needsStamp);
  console.log('Verify gate counts:', JSON.stringify(vCounts, null, 2));
  console.log('Still needing stamp:', stillNeed.length);
  if (vCounts.sprechen?.passGate !== 60 || stillNeed.length !== 0) {
    console.error('FATAL: post-write verification failed');
    process.exit(1);
  }
  console.log('OK: 60/60 Sprechen pass partPassesPublishGate; other modules unchanged.');
}

main();
