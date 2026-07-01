#!/usr/bin/env node
/**
 * Snapshot served exam file before destructive pipeline runs.
 *
 *   node scripts/snapshot-served.mjs --lang de --level B1
 *
 * Restore:
 *   copy data/exams/_snapshots/de_B1.<timestamp>.json data/exams/de_B1.json
 *   node scripts/curated-to-served.mjs --lang de --level B1   # only if curated is source of truth
 * Or re-copy snapshot then run validate:fidelity:de-b1 --strict
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servedExamPath, comboKey, ROOT } from './lib/examPipeline.mjs';

function parseArgs(argv) {
  const out = { lang: null, level: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i] || '').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

export function restoreServedSnapshot(snapshotPath, lang, level) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return false;
  const dest = servedExamPath(lang, level);
  fs.copyFileSync(snapshotPath, dest);
  return true;
}

export function snapshotServedExam(lang, level, { quiet = false } = {}) {
  const src = servedExamPath(lang, level);
  if (!fs.existsSync(src)) {
    if (!quiet) console.warn(`snapshot skip — missing ${path.relative(ROOT, src)}`);
    return null;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'data/exams/_snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${comboKey(lang, level)}.${ts}.json`);
  fs.copyFileSync(src, dest);
  if (!quiet) console.log(`Snapshot: ${path.relative(ROOT, dest)}`);
  return dest;
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.lang || !opts.level) {
    console.log(`Usage: node scripts/snapshot-served.mjs --lang de --level B1

Restore served file:
  copy data\\exams\\_snapshots\\de_B1.<timestamp>.json data\\exams\\de_B1.json
  npm run validate:fidelity:de-b1 -- --strict`);
    process.exit(opts.help ? 0 : 2);
  }
  const dest = snapshotServedExam(opts.lang, opts.level);
  if (!dest) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
