#!/usr/bin/env node
/** Fix options/skills/difficulty/correctAnswer/passageId in library bank in place. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));

const STALE_PASSAGE_IDS = new Set(['de-b1-p-health', 'de-b1-p-work']);

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = argv[++i]?.toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function loadValidPassageIds(bank, lang, level) {
  const ids = new Set((bank.passages || []).map((p) => p.id));
  const pf = path.join(ROOT, 'library', lang, level, 'passages.json');
  if (fs.existsSync(pf)) {
    const ext = JSON.parse(fs.readFileSync(pf, 'utf8'));
    for (const p of ext.passages || []) ids.add(p.id);
  }
  return ids;
}

function shouldDropPassageId(q) {
  if (q.module === 'lesen' && Number(q.teil) === 3) return true;
  return false;
}

function repairPassageIds(questions, validPids) {
  let cleared = 0;
  let stripped = 0;

  let qs = questions.map((q) => {
    const out = { ...q };
    if (shouldDropPassageId(out)) {
      if (out.passageId) {
        delete out.passageId;
        stripped++;
      }
      return out;
    }
    if (out.passageId && (STALE_PASSAGE_IDS.has(out.passageId) || !validPids.has(out.passageId))) {
      delete out.passageId;
      cleared++;
    }
    return out;
  });

  qs = PassageResolver.enrichQuestionPassageIds(qs);

  qs = qs.map((q) => {
    if (shouldDropPassageId(q) && q.passageId) {
      const out = { ...q };
      delete out.passageId;
      stripped++;
      return out;
    }
    if (q.passageId && !validPids.has(q.passageId)) {
      const out = { ...q };
      delete out.passageId;
      cleared++;
      return out;
    }
    return q;
  });

  return { questions: qs, cleared, stripped };
}

const args = parseArgs(process.argv.slice(2));
const bankPath = path.join(ROOT, 'library', args.lang, args.level, 'questions.json');
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const validPids = loadValidPassageIds(bank, args.lang, args.level);

const beforeOpts = (bank.questions || []).filter(
  (q) => Array.isArray(q.options) && q.options.some((o) => typeof o !== 'string'),
).length;
const beforeCa = (bank.questions || []).filter(
  (q) => q.correct !== undefined && q.correctAnswer !== undefined && q.correct !== q.correctAnswer,
).length;
const beforePassage = (bank.questions || []).filter(
  (q) => ['lesen', 'horen'].includes(q.module) && q.passageId && !validPids.has(q.passageId),
).length;

const normalized = normalizeBatch({ passages: bank.passages || [], questions: bank.questions || [] });
const repaired = repairPassageIds(normalized.questions, validPids);
bank.passages = normalized.passages;
bank.questions = repaired.questions;

const afterOpts = bank.questions.filter(
  (q) => Array.isArray(q.options) && q.options.some((o) => typeof o !== 'string'),
).length;
const afterCa = bank.questions.filter(
  (q) => q.correct !== undefined && q.correctAnswer !== undefined && q.correct !== q.correctAnswer,
).length;
const afterPassage = bank.questions.filter(
  (q) => ['lesen', 'horen'].includes(q.module) && q.passageId && !validPids.has(q.passageId),
).length;

console.log(`\nNormalize bank ${args.lang}/${args.level}`);
console.log(`Preguntas con options inválidas: ${beforeOpts} → ${afterOpts}`);
console.log(`correct===correctAnswer mismatches: ${beforeCa} → ${afterCa}`);
console.log(`passageId rotos: ${beforePassage} → ${afterPassage} (stripped T3: ${repaired.stripped}, cleared stale: ${repaired.cleared})`);

if (!args.dryRun) {
  const backup = bankPath.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(bankPath, backup);
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  console.log(`Backup: ${path.relative(ROOT, backup)}`);
  console.log(`Escrito: ${path.relative(ROOT, bankPath)}`);
} else {
  console.log('(dry-run: no se escribe)');
}
