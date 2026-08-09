#!/usr/bin/env node
/** Scan SEPARABLE_GLOSS French entries for conjugated (non-infinitive) forms. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFrenchInfinitiveGloss } from './lib/separableGlossFr.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SEPARABLE_GLOSS } = require(path.join(ROOT, 'js/engine/separableResolve.js'));

const bad = [];
for (const [lemma, g] of Object.entries(SEPARABLE_GLOSS)) {
  const fr = g.fr;
  if (!fr) bad.push({ lemma, issue: 'missing fr' });
  else if (!isFrenchInfinitiveGloss(fr)) bad.push({ lemma, fr, issue: 'not infinitive' });
}

if (bad.length) {
  console.error('French gloss scan FAILED:', bad.length);
  for (const b of bad) console.error(' ', b);
  process.exit(1);
}
console.log(`French gloss scan OK: ${Object.keys(SEPARABLE_GLOSS).length} infinitives`);
