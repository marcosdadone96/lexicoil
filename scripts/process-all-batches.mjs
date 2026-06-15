#!/usr/bin/env node
/**
 * Validate batches in batches/merged/, merge only passing ones.
 * Does NOT promote curated exams — use assemble-bank-pipeline.mjs for that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rejectBatchFile } from './lib/batchPaths.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MERGED = path.join(ROOT, 'batches', 'merged');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', dryRun: false, dir: MERGED };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--dir') out.dir = argv[++i];
  }
  return out;
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function dryRunHasNew(full, lang, level) {
  try {
    const out = execSync(
      `node scripts/merge-bank-batch.mjs --lang ${lang} --level ${level} --file "${full}" --dry-run`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    const addP = parseInt(out.match(/Pasajes: \+(\d+) nuevos/)?.[1] || '0', 10);
    const addQ = parseInt(out.match(/Preguntas: \+(\d+) nuevas/)?.[1] || '0', 10);
    return addP + addQ > 0;
  } catch (_) {
    return false;
  }
}

function validateBatch(rel, lang, level) {
  run(`node scripts/validate-batch.mjs --lang ${lang} --level ${level} --file "${rel}"`, { quiet: true });
}

const args = parseArgs(process.argv.slice(2));
const files = fs
  .readdirSync(args.dir)
  .filter((f) => f.endsWith('.json'))
  .sort();

console.log(`\n══ Process ${files.length} batches → ${args.lang}/${args.level} ══\n`);

const results = { passed: [], failed: [], merged: [], skippedDup: [], rejected: [] };

for (const file of files) {
  const rel = path.join('batches', 'merged', file).replace(/\\/g, '/');
  const full = path.join(args.dir, file);
  process.stdout.write(`\n── ${file} ──\n`);

  if (args.dryRun) {
    const would = dryRunHasNew(full, args.lang, args.level);
    console.log(would ? 'OK    would merge new content' : 'SKIP  already in bank');
    if (would) results.passed.push(file);
    else results.skippedDup.push(file);
    continue;
  }

  if (!dryRunHasNew(full, args.lang, args.level)) {
    console.log('SKIP  already in bank (no new passages/questions)');
    results.skippedDup.push(file);
    continue;
  }

  try {
    validateBatch(rel, args.lang, args.level);
    console.log('OK    validation passed');
  } catch (_) {
    console.log('FAIL  validation — moviendo a batches/rejected/');
    const moved = rejectBatchFile(full);
    if (moved) results.rejected.push(moved);
    results.failed.push(file);
    continue;
  }

  run(`node scripts/merge-bank-batch.mjs --lang ${args.lang} --level ${args.level} --file "${full}"`);
  console.log('OK    merged to bank');
  results.merged.push(file);
  results.passed.push(file);
}

console.log('\n══ Summary ══');
console.log(`Merged:            ${results.merged.length}`);
console.log(`Failed validation: ${results.failed.length}`);
if (results.failed.length) console.log('  ' + results.failed.join(', '));
if (results.rejected.length) console.log(`Rejected:          ${results.rejected.length}`);
if (results.skippedDup.length) console.log(`Already in bank:   ${results.skippedDup.length}`);

process.exit(results.failed.length ? 1 : 0);
