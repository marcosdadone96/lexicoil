#!/usr/bin/env node
import { loadPoolRecords } from './lib/hybridLesenAssembly.mjs';
import { partToBatch } from './lib/partGate.mjs';
import { validatePart } from './lib/partGate.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const { buscar } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));

const records = loadPoolRecords('de', 'B1');
const t3 = records.filter((r) => Number(r.teil) === 3);
console.log('T3 seed records:', t3.length);

let gated = 0;
for (const part of t3) {
  const batch = partToBatch(part, { module: 'lesen', teil: 3 });
  const gate = await validatePart(batch, { module: 'lesen', teil: 3, semantic: false, skipNormalize: false });
  if (gate.ok) gated++;
}
console.log('T3 passing validatePart (semantic=false):', gated, '/', t3.length);

const hitsVocab = buscar(records, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 3,
  topicTag: 'Umwelt',
  words: ['Klimawandel', 'Recycling'],
  literal: true,
});
console.log('buscar T3 Umwelt+vocab hits:', hitsVocab.length);

const hitsEmpty = buscar(records, {
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 3,
  words: [],
  literal: true,
});
console.log('buscar T3 empty words hits:', hitsEmpty.length);
