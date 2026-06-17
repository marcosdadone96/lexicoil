#!/usr/bin/env node
/** Sprint 0 — open-frequency German vocab smoke tests */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CUMULATIVE_CUTS } from './lib/de-frequency-tiers.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/engine/validation/CefrVocabLoader.js'));
const CefrVocabLoader = require(path.join(ROOT, 'js/engine/validation/CefrVocabLoader.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const vocabDir = path.join(ROOT, 'library', 'vocab', 'de');
for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
  const file = path.join(vocabDir, `${level}.json`);
  assert(fs.existsSync(file), `${level}.json exists`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(data.source === 'open-frequency+manual', `${level} source tag`);
  assert(data.lemmaCount === data.lemmas.length, `${level} lemmaCount matches`);
  const prev = level === 'A1' ? 0 : CUMULATIVE_CUTS[['A1', 'A2', 'B1', 'B2', 'C1'][['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(level) - 1]];
  assert(data.lemmaCount === CUMULATIVE_CUTS[level] - prev, `${level} band size`);
  assert(!data.lemmas.includes('boonen'), `${level} excludes boonen`);
}

const freqFile = path.join(ROOT, 'data', 'freq', 'de.frequency.txt');
assert(fs.existsSync(freqFile), 'de.frequency.txt exists');
const freqLines = fs
  .readFileSync(freqFile, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'));
assert(freqLines.length >= CUMULATIVE_CUTS.C2, 'frequency file length >= C2 cutoff');

const cumulative = CefrVocabLoader.loadCumulativeVocabSync('de', 'B1');
for (const w of ['erlauben', 'mitarbeiter', 'boomen', 'stadtgarten', 'nachhaltigkeit']) {
  assert(cumulative.has(w), `cumulative B1 includes ${w}`);
}
assert(!cumulative.has('boonen'), 'boonen excluded from cumulative B1');

console.log('\nOpen-frequency vocab tests passed.');
