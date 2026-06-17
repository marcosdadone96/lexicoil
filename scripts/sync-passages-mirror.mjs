#!/usr/bin/env node
/**
 * Regenerate library/{lang}/{level}/passages.json from questions.json.
 *
 * Usage:
 *   node scripts/sync-passages-mirror.mjs                    # all 18 cells
 *   node scripts/sync-passages-mirror.mjs --lang de --level B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_LANGS, ALL_LEVELS } from './seed-coverage-levels.mjs';
import { writePassagesMirror } from './lib/syncPassagesMirror.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: null, level: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') out.lang = argv[++i];
    else if (argv[i] === '--level') out.level = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const langs = args.lang ? [args.lang] : ALL_LANGS;
const levels = args.level ? [args.level] : ALL_LEVELS;

let synced = 0;
for (const lang of langs) {
  for (const level of levels) {
    const qFile = path.join(ROOT, 'library', lang, level, 'questions.json');
    if (!fs.existsSync(qFile)) {
      console.warn('SKIP (no questions.json)', `${lang}/${level}`);
      continue;
    }
    const bank = JSON.parse(fs.readFileSync(qFile, 'utf8'));
    const pFile = path.join(ROOT, 'library', lang, level, 'passages.json');
    writePassagesMirror(bank, lang, level, pFile, fs);
    console.log('SYNC', `${lang}/${level}`, `${(bank.passages || []).length} passages`);
    synced++;
  }
}

console.log(`\nSynced ${synced} passage mirror(s).`);
