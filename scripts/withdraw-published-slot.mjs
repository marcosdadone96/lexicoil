#!/usr/bin/env node
/**
 * Withdraw a published exam slot from live catalog + served data.
 *   node scripts/withdraw-published-slot.mjs --lang de --level B1 --slot 5 --apply --reason "..."
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  localCatalogPath,
  localPublishedDir,
  defaultExamId,
} from './lib/publishedExamLib.mjs';

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', slot: null, apply: false, reason: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--slot') out.slot = Number(argv[++i]);
    else if (a === '--reason') out.reason = String(argv[++i] || '');
    else if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !Number.isFinite(args.slot)) {
    console.log(`Usage: node scripts/withdraw-published-slot.mjs --slot 5 [--lang de] [--level B1] [--reason text] [--apply]`);
    process.exit(args.help ? 0 : 2);
  }

  const examId = defaultExamId(args.lang, args.level, args.slot);
  const catalogPath = localCatalogPath(args.lang, args.level);
  const examPath = path.join(localPublishedDir(args.lang, args.level), `${examId}.json`);

  if (!fs.existsSync(catalogPath) || !fs.existsSync(examPath)) {
    console.error(`Missing catalog or exam file for ${examId}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const entry = (catalog.exams || []).find((e) => Number(e.slot) === args.slot);
  if (!entry) {
    console.error(`Slot ${args.slot} not in catalog`);
    process.exit(1);
  }
  if (entry.status !== 'live') {
    console.log(`${examId} already ${entry.status}`);
    process.exit(0);
  }

  console.log(`Withdraw ${examId} (${args.level} slot ${args.slot})`);
  if (args.reason) console.log(`  reason: ${args.reason}`);

  if (!args.apply) {
    console.log('[dry-run] Re-run with --apply to withdraw and sync served.');
    process.exit(0);
  }

  const withdrawnAt = new Date().toISOString();
  catalog.exams = (catalog.exams || []).map((e) =>
    Number(e.slot) === args.slot
      ? { ...e, status: 'withdrawn', withdrawnAt, withdrawnReason: args.reason || null }
      : e,
  );
  catalog.version = withdrawnAt;
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const doc = JSON.parse(fs.readFileSync(examPath, 'utf8'));
  doc.status = 'withdrawn';
  doc.withdrawnAt = withdrawnAt;
  doc.withdrawnReason = args.reason || null;
  fs.writeFileSync(examPath, `${JSON.stringify(doc, null, 2)}\n`);

  const sync = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/sync-published-to-served.mjs'),
    '--lang',
    args.lang,
    '--level',
    args.level,
    '--apply',
  ], { cwd: ROOT, encoding: 'utf8' });
  if (sync.stdout) process.stdout.write(sync.stdout);
  if (sync.stderr) process.stderr.write(sync.stderr);
  if (sync.status !== 0) process.exit(sync.status || 1);

  const avail = spawnSync('npm', ['run', 'build:availability'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (avail.stdout) process.stdout.write(avail.stdout);
  if (avail.stderr) process.stderr.write(avail.stderr);

  console.log(`\n✓ ${examId} withdrawn — no longer in live catalog or served exams.`);
}

main();
