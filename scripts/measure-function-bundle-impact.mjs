#!/usr/bin/env node
/**
 * Measure included_files bundle impact — reusable-seed removal from serving functions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirSizeBytes(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function globDirSize(globPath) {
  const rel = globPath.replace(/\/\*\*$/, '').replace(/\\/g, '/');
  return dirSizeBytes(path.join(ROOT, rel));
}

const servingFunctions = ['exam-part', 'exam-plan', 'exam-hybrid-execute', 'claude-chat'];
const removedGlob = 'library/reusable-seed/**';

const seedBytes = globDirSize(removedGlob);
const seedFile = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const seedFileBytes = fs.existsSync(seedFile) ? fs.statSync(seedFile).size : 0;

console.log('LexiCoil — function bundle impact (pool blobs-only)\n');
console.log(`library/reusable-seed total: ${(seedBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`de_B1.json alone:              ${(seedFileBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Removed from serving fns:      ${servingFunctions.join(', ')}`);
console.log(`Per-function savings (approx): ${(seedBytes / 1024 / 1024).toFixed(2)} MB each`);
console.log(`Aggregate deploy savings:      ~${((seedBytes * servingFunctions.length) / 1024 / 1024).toFixed(2)} MB across ${servingFunctions.length} bundles`);
console.log('\nCold start: smaller Lambda zip → faster unpack + less memory pressure on first invoke.');
console.log('Runtime: POOL_SOURCE=blobs / NETLIFY=true → zero fs.read of de_B1.json per request.');
