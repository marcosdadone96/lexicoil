#!/usr/bin/env node
/**
 * Calidad pedagógica Hören B1 (anti word-matching + realismo).
 *
 *   node scripts/check-horen-batch-quality.mjs --teil N --file path.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHorenBatchQuality, formatHorenQualityReport } from './lib/horenBatchQuality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { teil: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--teil') o.teil = Number(argv[++i]);
    else if (argv[i] === '--file') o.file = argv[++i];
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.file || !Number.isFinite(opts.teil)) {
  console.error('Uso: node scripts/check-horen-batch-quality.mjs --teil N --file path.json');
  process.exit(1);
}

const full = path.resolve(opts.file);
const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
const result = checkHorenBatchQuality(batch, opts.teil);

console.log(`\n== Calidad Hören T${opts.teil} · ${path.relative(ROOT, full)} ==\n`);
console.log(formatHorenQualityReport(result, opts.teil));
process.exit(result.ok ? 0 : 1);
