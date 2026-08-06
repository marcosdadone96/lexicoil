#!/usr/bin/env node
/**
 * Remove non-German exam questions from library/de/B1/questions.json bank.
 *
 *   node scripts/purge-non-german-bank-2026-07-15.mjs
 *   node scripts/purge-non-german-bank-2026-07-15.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';

const BANK = path.join(ROOT, 'library/de/B1/questions.json');
const BACKUP = path.join(ROOT, 'library/de/B1/backups');
const dryRun = process.argv.includes('--dry-run');

const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
const questions = bank.questions || bank;
if (!Array.isArray(questions)) throw new Error('questions.json: formato inesperado');

const removeIds = new Set();
for (const q of questions) {
  const v = runGermanContentLanguageGate(
    { lang: 'de', questions: [q], passages: [] },
    { file: `questions.json#${q.id}` },
  );
  if (v.verdict === 'block') removeIds.add(q.id);
}

const kept = questions.filter((q) => !removeIds.has(q.id));
console.log(`Bank questions: ${questions.length} → ${kept.length} (remove ${removeIds.size})`);
for (const id of removeIds) console.log(`  - ${id}`);

if (dryRun || removeIds.size === 0) process.exit(0);

fs.mkdirSync(BACKUP, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(BANK, path.join(BACKUP, `questions.pre-purge-non-german-${stamp}.json`));

const next = Array.isArray(bank.questions) ? { ...bank, questions: kept } : kept;
fs.writeFileSync(BANK, `${JSON.stringify(next, null, 2)}\n`);
console.log('Bank updated.');
