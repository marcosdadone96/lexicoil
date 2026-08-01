#!/usr/bin/env node
/**
 * Retira horen-t3-gemini-065..068 (pre name-gate live test).
 *   node scripts/retire-a2-horen-pre-gate-t3-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const destDir = path.join(ROOT, 'batches/needs-regeneration/A2');
const RETIRE = [
  'horen-t3-gemini-065.json',
  'horen-t3-gemini-066.json',
  'horen-t3-gemini-067.json',
  'horen-t3-gemini-068.json',
];

fs.mkdirSync(destDir, { recursive: true });
const log = { at: new Date().toISOString(), retired: [], missing: [] };

for (const file of RETIRE) {
  const src = path.join(poolDir, file);
  if (!fs.existsSync(src)) {
    log.missing.push(file);
    console.log(`skip (missing): ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  batch._poolRetiredAt = log.at;
  batch._poolRetiredReason = 'pre-dialogue-names-gate-live-test-2026-07-27';
  batch._poolRetiredFrom = `pool-verified/A2/${file}`;
  const dest = path.join(destDir, file);
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.unlinkSync(src);
  log.retired.push(file);
  console.log(`retired: ${file} → needs-regeneration/A2/`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-pre-gate-t3-retire-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(log, null, 2));
