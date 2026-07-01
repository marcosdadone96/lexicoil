#!/usr/bin/node
/**
 * Revisa calidad pedagógica Goethe de un batch Lesen generado.
 *
 *   node scripts/check-lesen-batch-quality.mjs --teil 3 --file batches/generated/lesen-t3-gemini-001.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLesenBatchQuality, formatQualityReport } from './lib/lesenBatchQuality.mjs';

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
  console.error('Uso: node scripts/check-lesen-batch-quality.mjs --teil N --file path.json');
  process.exit(1);
}

const full = path.resolve(opts.file);
const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
const result = checkLesenBatchQuality(batch, opts.teil);

console.log(`\n== Calidad Lesen T${opts.teil} · ${path.relative(ROOT, full)} ==\n`);
console.log(formatQualityReport(result));
process.exit(result.ok ? 0 : 1);
