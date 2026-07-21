#!/usr/bin/env node
/**
 * Reprocess German caps v3.11 (zu + noun pattern) over pool + 15-file canary set.
 *   node scripts/reprocess-zu-prep-noun-v311-2026-07-12.mjs
 *   node scripts/reprocess-zu-prep-noun-v311-2026-07-12.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const DIRS = [
  'batches/ready/pool-verified',
  'batches/ready/lesen-t4-staging-2026-07-11-canary',
  'batches/ready/lesen-t5-staging-2026-07-11-canary',
  'batches/ready/horen-t3-staging-2026-07-11-canary',
  'batches/ready/canary-all-staging-2026-07-11',
  'batches/ready/horen-t1-staging-2026-07-11',
];

const report = {
  generatedAt: new Date().toISOString(),
  version: GERMAN_CAPS_NORMALIZE_VERSION,
  dryRun,
  filesTouched: 0,
  changes: [],
};

for (const relDir of DIRS) {
  const dir = path.join(ROOT, relDir);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const fp = path.join(dir, f);
    const before = fs.readFileSync(fp, 'utf8');
    const batch = JSON.parse(before);
    const { batch: out, changes } = applyGermanCapsNormalize(batch);
    if (!changes.length && out._germanCapsNormalizeVersion === GERMAN_CAPS_NORMALIZE_VERSION) {
      continue;
    }
    stampGermanCapsVersion(out);
    out._germanCapsNormalizeVersion = GERMAN_CAPS_NORMALIZE_VERSION;
    out._germanCapsNormalizedAt = new Date().toISOString();
    const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
    report.filesTouched++;
    report.changes.push({
      file: rel,
      n: changes.length,
      sample: changes.slice(0, 8),
    });
    if (!dryRun) {
      fs.writeFileSync(fp, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    }
  }
}

const outPath = path.join(ROOT, 'batches/ready/gate-logs/zu-prep-noun-v311-reprocess-2026-07-12.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(dryRun ? 'DRY-RUN' : 'WROTE', {
  filesTouched: report.filesTouched,
  log: path.relative(ROOT, outPath),
});
const kunden = report.changes.filter((c) =>
  JSON.stringify(c.sample).toLowerCase().includes('kunden'),
);
console.log('kunden-related files', kunden.map((c) => c.file));
