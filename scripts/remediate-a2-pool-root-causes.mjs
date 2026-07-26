#!/usr/bin/env node
/**
 * Retira de pool-verified/A2 los archivos afectados por causas A–C (root-cause audit).
 *   node scripts/remediate-a2-pool-root-causes.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const dryRun = process.argv.includes('--dry-run');
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const destDir = path.join(ROOT, 'batches/needs-regeneration/A2');

/** Explicit remediation list from audit 2026-07-23 */
const RETIRE = [
  // A — vocab forzado / coherencia rota
  'lesen-t1-gemini-199.json',
  'lesen-t1-gemini-196.json',
  'lesen-t1-gemini-197.json',
  // B — T2 duplicados Lena+Max (mismo criterio que T3 041/042)
  'horen-t2-gemini-040.json',
  'horen-t2-gemini-068.json',
  'horen-t2-gemini-069.json',
  'horen-t2-gemini-070.json',
  'horen-t2-gemini-071.json',
  'horen-t2-gemini-073.json',
  'horen-t2-gemini-074.json',
  // C — T3 mismo elenco (conservar 039/040)
  'horen-t3-gemini-041.json',
  'horen-t3-gemini-042.json',
];

fs.mkdirSync(destDir, { recursive: true });

for (const file of RETIRE) {
  const src = path.join(poolDir, file);
  if (!fs.existsSync(src)) {
    console.log(`skip (missing): ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  batch._poolRetiredAt = new Date().toISOString();
  batch._poolRetiredReason = 'A2-root-cause-audit-2026-07-23';
  batch._poolRetiredFrom = `pool-verified/A2/${file}`;
  const dest = path.join(destDir, file);
  if (dryRun) {
    console.log(`[dry-run] ${file} → needs-regeneration/A2/`);
    continue;
  }
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.unlinkSync(src);
  console.log(`retired: ${file}`);
}
console.log(`Done (${dryRun ? 'dry-run' : 'applied'}).`);
