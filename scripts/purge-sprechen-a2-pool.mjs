#!/usr/bin/env node
/**
 * Purge Sprechen A2 pool contaminated with B1-format tasks.
 * Removes all sprechen questions from library/de/A2/questions.json.
 *
 * Usage:
 *   node scripts/purge-sprechen-a2-pool.mjs           # dry-run
 *   node scripts/purge-sprechen-a2-pool.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const apply = process.argv.includes('--apply');

function loadBank() {
  return JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
}

function purgeSprechen(bank) {
  const before = (bank.questions || []).filter((q) => q.module === 'sprechen');
  const questions = (bank.questions || []).filter((q) => q.module !== 'sprechen');
  return { bank: { ...bank, questions }, removed: before.length, samples: before.slice(0, 3) };
}

const bank = loadBank();
const { bank: next, removed, samples } = purgeSprechen(bank);

console.log(`Sprechen A2 purge: ${removed} questions to remove`);
if (samples.length) {
  console.log('Samples (B1-contaminated):');
  for (const q of samples) {
    console.log(`  - ${q.id} teil=${q.teil} level=${q.level} type=${q.type}`);
    console.log(`    ${String(q.question || '').slice(0, 120)}…`);
  }
}

if (!apply) {
  console.log('\n[dry-run] Pass --apply to write library/de/A2/questions.json');
  process.exit(0);
}

fs.writeFileSync(BANK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`\nApplied: removed ${removed} sprechen questions from A2 bank.`);
