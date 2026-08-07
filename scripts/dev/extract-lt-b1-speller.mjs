#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealLanguageToolMatch } from '../lib/qualityGates/languageToolGate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const j = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/gate-logs/preventive-lt-B1-2026-08-04.json'), 'utf8'),
);

const speller = [];
const real = [];
for (const f of j.files || []) {
  for (const p of f.passages || []) {
    for (const m of p.matches || []) {
      const row = { file: f.file, passage: p.passageIndex, ...m };
      if (m.ruleId === 'GERMAN_SPELLER_RULE') speller.push(row);
      else if (isRealLanguageToolMatch(m)) real.push(row);
    }
  }
}

console.log('SPELLER', speller.length);
for (const x of speller) {
  const word = (x.context || '').slice(x.contextOffset || 0, (x.contextOffset || 0) + (x.length || 0));
  console.log(JSON.stringify({ file: x.file, passage: x.passage, word, ctx: x.context, rep: (x.replacements || [])[0] }));
}

console.log('\nREAL non-speller', real.length);
const byRule = {};
for (const x of real) byRule[x.ruleId] = (byRule[x.ruleId] || 0) + 1;
console.log(byRule);
