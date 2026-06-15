#!/usr/bin/env node
/**
 * End-to-end content pipeline orchestrator.
 *
 *   1. (optional) ingest batch/exam file → staging
 *   2. promote approved staging candidates → question bank
 *   3. build complete exams from bank → curated + pool-seed
 *
 * Usage:
 *   node scripts/run-content-pipeline.mjs --lang de --level B1
 *   node scripts/run-content-pipeline.mjs --lang de --level B1 --file batches/merged/foo.json --auto-approve
 *   node scripts/run-content-pipeline.mjs --lang de --level B1 --skip-curated --dry-run
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countByStatus } from './pipeline/lib/stagingStore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    file: null,
    autoApprove: false,
    skipIngest: false,
    skipPromote: false,
    skipCurated: false,
    maxCurated: 5,
    minCoverage: 1.0,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--auto-approve') out.autoApprove = true;
    else if (a === '--skip-ingest') out.skipIngest = true;
    else if (a === '--skip-promote') out.skipPromote = true;
    else if (a === '--skip-curated') out.skipCurated = true;
    else if (a === '--max-curated') out.maxCurated = parseInt(argv[++i], 10);
    else if (a === '--min-coverage') out.minCoverage = parseFloat(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function run(cmd) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

const args = parseArgs(process.argv.slice(2));
const dry = args.dryRun ? ' --dry-run' : '';
const counts = countByStatus(args.lang, args.level);

console.log('═══════════════════════════════════════════════════');
console.log(` Content pipeline — ${args.lang}/${args.level}`);
console.log('═══════════════════════════════════════════════════');
console.log(
  `Staging: pending=${counts.pending} approved=${counts.approved} promoted=${counts.promoted} rejected=${counts.rejected}`,
);

if (args.file && !args.skipIngest) {
  const approveFlag = args.autoApprove ? ' --auto-approve' : '';
  run(
    `node scripts/ingest-to-staging.mjs --lang ${args.lang} --level ${args.level} --file "${args.file}"${approveFlag}${dry}`,
  );
}

if (!args.skipPromote) {
  run(`node scripts/promote-approved.mjs --lang ${args.lang} --level ${args.level}${dry}`);
}

if (!args.skipCurated) {
  run(
    `node scripts/promote-bank-to-curated.mjs --lang ${args.lang} --level ${args.level} --max ${args.maxCurated} --min-coverage ${args.minCoverage}${dry}`,
  );
}

console.log('\n✓ Pipeline finished.');
console.log('  staging/     → piezas sueltas (pending/approved/promoted)');
console.log('  library/     → banco de preguntas (questions.json)');
console.log('  library/curated/ + pool-seed/ → exámenes completos listos para servir');
