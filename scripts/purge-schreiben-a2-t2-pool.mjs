#!/usr/bin/env node
/**
 * Purge Schreiben A2 T2 forum/B1-contaminated tasks from library/de/A2/questions.json.
 * Keeps only E-Mail al Chef format (teil 2 with Chef, no Forum).
 *
 *   node scripts/purge-schreiben-a2-t2-pool.mjs           # dry-run
 *   node scripts/purge-schreiben-a2-t2-pool.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const apply = process.argv.includes('--apply');

function isContaminatedT2(q) {
  if (q.module !== 'schreiben' || Number(q.teil) !== 2) return false;
  const text = String(q.question || '');
  const isForum = /\bForum|Forumsbeitrag|Internetforum|Forumthema|Meinung zu\b/i.test(text);
  const hasChef = /\bChef\b/i.test(text);
  return isForum || !hasChef;
}

function purge(bank) {
  const before = (bank.questions || []).filter(isContaminatedT2);
  const questions = (bank.questions || []).filter((q) => !isContaminatedT2(q));
  return { bank: { ...bank, questions }, removed: before.length, samples: before.slice(0, 5) };
}

const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
const { bank: next, removed, samples } = purge(bank);

console.log(`Schreiben A2 T2 purge: ${removed} questions to remove`);
for (const q of samples) {
  console.log(`  - ${q.id}: ${String(q.question || '').slice(0, 100)}…`);
}

if (!apply) {
  console.log('\n[dry-run] Pass --apply to write library/de/A2/questions.json');
  process.exit(0);
}

fs.writeFileSync(BANK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`\nApplied: removed ${removed} Schreiben T2 contaminated questions.`);
