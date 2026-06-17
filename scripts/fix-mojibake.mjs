#!/usr/bin/env node
/**
 * Scan data/, js/content/, library/ for mojibake; dry-run by default, --apply to repair.
 * Usage:
 *   node scripts/fix-mojibake.mjs           # dry-run + inventory JSON
 *   node scripts/fix-mojibake.mjs --apply   # repair in place (UTF-8, no BOM)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOJIBAKE_SIGNATURE,
  countMojibake,
  repairMojibake,
  scanLineHits,
  walkScanFiles,
  validateJsonFile,
  selfTestDetector,
} from './lib/mojibakeLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const OUT_DIR = path.join(ROOT, 'docs', 'audit', '05_MOJIBAKE_FIX');

selfTestDetector();

const files = walkScanFiles(ROOT);
const inventory = [];
let filesWithHits = 0;
let totalHits = 0;
const fixedFiles = [];
const errors = [];

for (const { abs, rel } of files) {
  const raw = fs.readFileSync(abs, 'utf8');
  if (!MOJIBAKE_SIGNATURE.test(raw)) continue;

  filesWithHits++;
  const hits = scanLineHits(raw, rel);
  totalHits += hits.length;
  inventory.push({ file: rel, hitCount: hits.length, hits });

  if (!APPLY) continue;

  const { text: repaired, changed, strategy } = repairMojibake(raw);
  if (!changed) {
    errors.push({ file: rel, error: 'mojibake detected but repair unchanged content' });
    continue;
  }
  if (MOJIBAKE_SIGNATURE.test(repaired) && countMojibake(repaired) >= countMojibake(raw)) {
    errors.push({ file: rel, error: 'repair did not reduce mojibake count' });
    continue;
  }

  fs.writeFileSync(abs, repaired, { encoding: 'utf8' });
  const jsonCheck = validateJsonFile(abs);
  if (!jsonCheck.ok) {
    fs.writeFileSync(abs, raw, { encoding: 'utf8' });
    errors.push({ file: rel, error: `JSON parse failed after repair: ${jsonCheck.error}` });
    continue;
  }

  fixedFiles.push({ file: rel, strategy, before: countMojibake(raw), after: countMojibake(repaired) });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'dry-run',
  filesScanned: files.length,
  filesWithMojibake: filesWithHits,
  lineHits: totalHits,
  inventory,
  fixedFiles,
  errors,
};
const reportPath = path.join(OUT_DIR, APPLY ? 'apply-report.json' : 'inventory.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Mojibake scan (${APPLY ? 'APPLY' : 'dry-run'})`);
console.log(`  Files scanned:     ${files.length}`);
console.log(`  Files with mojibake: ${filesWithHits}`);
console.log(`  Line hits:         ${totalHits}`);
console.log(`  Report:            ${path.relative(ROOT, reportPath)}`);

if (inventory.length) {
  console.log('\nInventory (first 10 files):');
  inventory.slice(0, 10).forEach((entry) => {
    console.log(`  ${entry.file} (${entry.hitCount} line(s))`);
    entry.hits.slice(0, 2).forEach((h) => {
      console.log(`    L${h.line}: ${h.tokens.join(', ')} — ${h.preview}`);
    });
  });
} else {
  console.log('\nNo mojibake signatures found — content is clean.');
}

if (APPLY) {
  console.log(`\nFixed files: ${fixedFiles.length}`);
  fixedFiles.forEach((f) => console.log(`  ${f.file} (${f.strategy}, ${f.before}→${f.after})`));
  if (errors.length) {
    console.error(`\nErrors: ${errors.length}`);
    errors.forEach((e) => console.error(`  ${e.file}: ${e.error}`));
    process.exit(1);
  }
} else if (filesWithHits > 0) {
  console.log('\nRun with --apply to repair in place.');
}
