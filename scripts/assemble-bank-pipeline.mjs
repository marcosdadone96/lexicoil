#!/usr/bin/env node
/**
 * Merge validated batches → sync passages → promote curated exams → coverage report.
 *
 * Usage:
 *   node scripts/assemble-bank-pipeline.mjs --lang de --level B1
 *   npm run pipeline:assemble -- --lang de --level B1
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', target: 5, maxExams: 5, skipCurated: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--max') out.maxExams = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--no-curated') out.skipCurated = true;
  }
  return out;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const args = parseArgs(process.argv.slice(2));

console.log(`\n══ Montar exámenes ${args.lang}/${args.level} ══\n`);

run('scripts/process-all-batches.mjs', ['--lang', args.lang, '--level', args.level]);
run('scripts/normalize-bank.mjs', ['--lang', args.lang, '--level', args.level]);
run('scripts/sync-passages-mirror.mjs', ['--lang', args.lang, '--level', args.level]);

if (!args.skipCurated) {
  run('scripts/promote-bank-to-curated.mjs', [
    '--lang',
    args.lang,
    '--level',
    args.level,
    '--min-coverage',
    '1.0',
    '--max',
    String(args.maxExams),
  ]);
}

run('scripts/bank-coverage-report.mjs', [
  '--lang',
  args.lang,
  '--levels',
  args.level,
  '--target',
  String(args.target),
  '--detail',
]);

console.log('\nPipeline de montaje completado.\n');
