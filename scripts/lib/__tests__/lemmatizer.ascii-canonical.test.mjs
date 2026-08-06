#!/usr/bin/env node
/** Regression: normalizeLemma must not emit ASCII when umlaut form exists. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const Lem = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));

function fold(w) {
  return String(w).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

let failed = 0;
const cases = [
  ['beschäftigt', 'beschäftigen'],
  ['beschaeftigt', 'beschäftigen'],
  ['überzeugt', 'überzeugen'],
  ['ueberzeugt', 'überzeugen'],
  ['gaertnern', 'gärtnern'],
  ['gross', 'groß'],
];
for (const [input, expected] of cases) {
  const got = Lem.normalizeLemma(input, 'de');
  if (got !== expected) {
    console.error('FAIL', input, '→', got, 'expected', expected);
    failed++;
  } else console.log('OK', input, '→', got);
}

for (const level of ['B1', 'A2']) {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, `library/vocab/de/${level}.json`), 'utf8'));
  const byFold = new Map();
  for (const w of bank.lemmas) {
    const f = fold(w);
    if (!byFold.has(f)) byFold.set(f, []);
    byFold.get(f).push(w);
  }
  const dups = [...byFold.entries()].filter(([, a]) => a.length > 1);
  if (dups.length) {
    console.error(`FAIL ${level}.json still has fold-duplicates:`, dups);
    failed++;
  } else console.log(`OK ${level}.json: no ascii/umlaut duplicate pairs`);
}

if (failed) process.exit(1);
