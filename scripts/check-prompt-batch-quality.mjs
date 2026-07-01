#!/usr/bin/env node
/**
 * Calidad de consignas Schreiben / Sprechen (rúbrica B1).
 *
 *   node scripts/check-prompt-batch-quality.mjs --module schreiben --teil N --file path.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPromptBatchQuality,
  formatPromptQualityReport,
} from './lib/promptBatchQuality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { module: null, teil: null, file: null, lang: 'de', level: 'B1' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--module') o.module = String(argv[++i]).toLowerCase();
    else if (argv[i] === '--teil') o.teil = Number(argv[++i]);
    else if (argv[i] === '--file') o.file = argv[++i];
    else if (argv[i] === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (argv[i] === '--level') o.level = String(argv[++i]).toUpperCase();
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.file || !opts.module || !Number.isFinite(opts.teil)) {
  console.error(
    'Uso: node scripts/check-prompt-batch-quality.mjs --module schreiben|sprechen --teil N --file path.json',
  );
  process.exit(1);
}

const full = path.resolve(opts.file);
const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
const result = checkPromptBatchQuality(batch, opts.module, opts.teil, {
  lang: opts.lang,
  level: opts.level,
});

console.log(`\n== Calidad ${opts.module} T${opts.teil} · ${path.relative(ROOT, full)} ==\n`);
console.log(formatPromptQualityReport(result, opts.module, opts.teil));
process.exit(result.ok ? 0 : 1);
