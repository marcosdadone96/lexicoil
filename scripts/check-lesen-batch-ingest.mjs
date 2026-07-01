#!/usr/bin/node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnv.mjs';
import { checkLesenBatchIngest, formatIngestReport, logCefrCoverageThreshold } from './lib/lesenBatchIngestCheck.mjs';

loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (argv[i] === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (argv[i] === '--file') o.file = argv[++i];
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.file) {
  console.error('Uso: node scripts/check-lesen-batch-ingest.mjs --file batches/generated/foo.json');
  process.exit(1);
}

const full = path.resolve(opts.file);
const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
const teil = batch.questions?.[0]?.teil;
const report = checkLesenBatchIngest(batch, {
  lang: opts.lang,
  level: opts.level,
  batchId: path.basename(full, '.json'),
});

logCefrCoverageThreshold();
console.log(`\n== Ingest pre-check · ${path.relative(ROOT, full)} ==\n`);
console.log(formatIngestReport(report));
process.exit(report.ok ? 0 : 1);
