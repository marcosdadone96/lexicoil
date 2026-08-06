#!/usr/bin/env node
/** Scan SEPARABLE_GLOSS Italian entries for conjugated (non-infinitive) forms. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isItalianInfinitiveGloss } from './lib/separableGlossIt.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SEPARABLE_GLOSS } = require(path.join(ROOT, 'js/engine/separableResolve.js'));

const bad = [];
for (const [lemma, g] of Object.entries(SEPARABLE_GLOSS)) {
  const it = g.it;
  if (!it) bad.push({ lemma, issue: 'missing it' });
  else if (!isItalianInfinitiveGloss(it)) bad.push({ lemma, it, issue: 'not infinitive' });
}

if (bad.length) {
  console.error('Italian gloss scan FAILED:', bad.length);
  for (const b of bad) console.error(' ', b);
  process.exit(1);
}
console.log(`Italian gloss scan OK: ${Object.keys(SEPARABLE_GLOSS).length} infinitives`);
