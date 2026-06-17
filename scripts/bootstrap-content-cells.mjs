#!/usr/bin/env node
/**
 * Bootstrap en/es library cells for content generation (empty bank + blueprint prompts).
 *
 * Usage:
 *   node scripts/bootstrap-content-cells.mjs              # en + es, all levels
 *   node scripts/bootstrap-content-cells.mjs --lang en --level B1
 *   node scripts/bootstrap-content-cells.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ALL_LEVELS } from './seed-coverage-levels.mjs';
import { writingSpeakingFromBlueprint } from './lib/bootstrapWritingSpeaking.mjs';
import { writePassagesMirror } from './lib/syncPassagesMirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));

const TARGET_LANGS = ['en', 'es'];

function parseArgs(argv) {
  const out = { lang: null, level: null, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
  }
  return out;
}

function loadBlueprint(lang, level) {
  const id = LibraryCatalog.blueprintId(lang, level);
  if (!id) return null;
  const file = path.join(ROOT, 'library/blueprints', `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function examType(lang) {
  return lang === 'en' ? 'cambridge' : 'dele';
}

function scaffoldQuestions(lang, level, blueprint) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    meta: {
      language: lang,
      level,
      version: 1,
      generatedAt: today,
      contentStatus: 'scaffold',
      examType: examType(lang),
      blueprintId: blueprint?.id || `${examType(lang)}-${level.toLowerCase()}`,
    },
    passages: [],
    questions: [],
  };
}

function cellDir(lang, level) {
  return path.join(ROOT, 'library', lang, level);
}

function emptyPoolSeed(lang, level) {
  const file = path.join(ROOT, 'library/pool-seed', `${lang}_${level}.json`);
  return file;
}

const args = parseArgs(process.argv.slice(2));
const langs = args.lang ? [args.lang] : TARGET_LANGS;
const levels = args.level ? [args.level] : ALL_LEVELS;

if (langs.some((l) => !TARGET_LANGS.includes(l))) {
  console.error('This script only bootstraps en and es cells.');
  process.exit(1);
}

let bootstrapped = 0;
for (const lang of langs) {
  for (const level of levels) {
    const blueprint = loadBlueprint(lang, level);
    if (!blueprint) {
      console.warn('SKIP (no blueprint)', `${lang}/${level}`);
      continue;
    }

    const dir = cellDir(lang, level);
    const qFile = path.join(dir, 'questions.json');
    const wsFile = path.join(dir, 'writing-speaking.json');
    const pFile = path.join(dir, 'passages.json');
    const poolFile = emptyPoolSeed(lang, level);

    if (!args.force && fs.existsSync(qFile)) {
      const existing = JSON.parse(fs.readFileSync(qFile, 'utf8'));
      if (existing.meta?.contentStatus !== 'scaffold' && (existing.questions?.length || 0) > 0) {
        console.warn('SKIP (has content, use --force)', `${lang}/${level}`, `${existing.questions.length} questions`);
        continue;
      }
    }

    const bank = scaffoldQuestions(lang, level, blueprint);
    const ws = writingSpeakingFromBlueprint(blueprint, lang, level);

    console.log(
      'BOOTSTRAP',
      `${lang}/${level}`,
      `writing=${ws.writing.length}`,
      `speaking=${ws.speaking.length}`,
      `modules=${(blueprint.modules || []).map((m) => m.id).join(',')}`,
    );

    if (args.dryRun) continue;

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(qFile, JSON.stringify(bank, null, 2) + '\n', 'utf8');
    fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2) + '\n', 'utf8');
    writePassagesMirror(bank, lang, level, pFile, fs);
    fs.mkdirSync(path.dirname(poolFile), { recursive: true });
    fs.writeFileSync(poolFile, '[]\n', 'utf8');
    bootstrapped++;
  }
}

if (args.dryRun) {
  console.log('\nDry-run — no files written.');
} else {
  console.log(`\nBootstrapped ${bootstrapped} cell(s). Run: npm run validate:library && npm run validate:content`);
}
