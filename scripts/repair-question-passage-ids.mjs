#!/usr/bin/env node
/**
 * Propagate missing passageId on bank questions (same module+teil) — no invented text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));

const LEVELS = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['en', 'C1'],
  ['es', 'B2'],
  ['es', 'C1'],
];

let totalFixed = 0;

for (const [lang, level] of LEVELS) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) continue;
  const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = (bank.questions || []).filter((q) => PassageResolver.passageIdFromQuestion(q)).length;
  bank.questions = PassageResolver.enrichQuestionPassageIds(bank.questions || []);
  const after = bank.questions.filter((q) => PassageResolver.passageIdFromQuestion(q)).length;
  const fixed = after - before;
  if (fixed > 0) {
    fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n', 'utf8');
    console.log(`OK   ${lang}/${level}: +${fixed} passageId(s) inferred`);
    totalFixed += fixed;
  } else {
    console.log(`OK   ${lang}/${level}: no missing passageId`);
  }
}

console.log(`\nRepaired ${totalFixed} question passageId reference(s).`);
