#!/usr/bin/env node
/**
 * Emergency quarantine: Konsum×T5 curated parts with MCQ position bias (CHK-13).
 * Moves pool-verified → needs-regeneration and jubilates reusable-seed records.
 *
 *   node scripts/quarantine-konsum-t5-position-bias.mjs
 *   node scripts/quarantine-konsum-t5-position-bias.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir, needsRegenerationDir, POOL_FILE } from './lib/batchPaths.mjs';
import { measureMcqPositionDistribution, formatMcqPositionLine } from './lib/manualPublishNormalize.mjs';

const dryRun = process.argv.includes('--dry-run');

const TARGETS = [
  {
    file: 'lesen-t5-konsum-markthalle.json',
    seedId: 'pub-de-B1-lesen-t5-5dbba3e327ff',
  },
  {
    file: 'lesen-t5-konsum-einkaufszentrum.json',
    seedId: 'pub-de-B1-lesen-t5-8efbb290d671',
  },
];

const REASON =
  'CHK-13 position bias: manual curate path skipped balanceMcq (_balanceMcqVersion absent)';

function quarantineBatchFile(file, level = 'B1') {
  const src = path.join(poolVerifiedDir(level), file);
  if (!fs.existsSync(src)) {
    console.warn(`  skip file (not in pool-verified): ${file}`);
    return null;
  }
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  const dist = measureMcqPositionDistribution(batch);
  console.log(`  ${file}: ${formatMcqPositionLine(dist)} stamp=${batch._balanceMcqVersion || 'ABSENT'}`);

  const tagged = {
    ...batch,
    _poolRejectReason: REASON,
    _poolRejectAt: new Date().toISOString(),
    _poolRejectDetails: [
      formatMcqPositionLine(dist),
      `_balanceMcqVersion=${batch._balanceMcqVersion || 'absent'}`,
    ],
    _quarantinedAt: new Date().toISOString(),
    _quarantinedReason: 'mcq-position-bias-manual-curate',
  };

  const dest = path.join(needsRegenerationDir(level), file);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, `${JSON.stringify(tagged, null, 2)}\n`);
    fs.unlinkSync(src);
  }
  return { file, dist, dest: path.relative(ROOT, dest).replace(/\\/g, '/') };
}

function jubilateSeedRecords(seedIds) {
  if (!fs.existsSync(POOL_FILE)) {
    console.warn('  seed file missing — skip jubilation');
    return [];
  }
  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const ids = new Set(seedIds);
  const touched = [];
  for (const rec of pool.records || []) {
    if (!ids.has(rec.id)) continue;
    touched.push(rec.id);
    if (!dryRun) {
      rec.verified = false;
      rec.complete = false;
      rec.disabled = true;
      rec.jubilatedAt = new Date().toISOString();
      rec.jubilatedReason = REASON;
      delete rec.sem1VerifiedAt;
      delete rec.sem1Ok;
      delete rec.publishedAt;
    }
    console.log(`  seed jubilated: ${rec.id} (was verified=${rec.verified !== false})`);
  }
  if (!dryRun && touched.length) {
    const backup = `${POOL_FILE}.bak-quarantine-${Date.now()}`;
    fs.copyFileSync(POOL_FILE, backup);
    fs.writeFileSync(POOL_FILE, `${JSON.stringify(pool, null, 2)}\n`);
    console.log(`  backup: ${path.relative(ROOT, backup)}`);
  }
  return touched;
}

console.log(`\n══ Quarantine Konsum×T5 position bias ${dryRun ? '(dry-run)' : ''} ══\n`);

const moved = [];
for (const t of TARGETS) {
  console.log(`── ${t.file} ──`);
  const r = quarantineBatchFile(t.file);
  if (r) moved.push(r);
}

console.log('\n── reusable-seed ──');
const jub = jubilateSeedRecords(TARGETS.map((t) => t.seedId));

console.log(`\n══ Done: ${moved.length} files → needs-regeneration, ${jub.length} seed records jubilated ══`);
