#!/usr/bin/env node
/**
 * FASE 1 — ContentKey + BurnedRegistry + VocabBatching smoke tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const ContentKey = require(path.join(ROOT, 'js/library/ContentKey.js'));
const BurnedRegistry = require(path.join(ROOT, 'js/library/BurnedRegistry.js'));
const VocabBatching = require(path.join(ROOT, 'js/library/VocabBatching.js'));

function ok(label, cond) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`OK   ${label}`);
}

const t =
  'Stadtgärten boomen in deutschen Städten wie Berlin und Hamburg, weil viele Menschen frische Lebensmittel selbst anbauen möchten.';
ok('cross-module key stable', ContentKey.keyForText(t) === ContentKey.keyForText(`  ${t.toUpperCase()}!! `));
ok('trivial text null', ContentKey.keyForText('Achtung') === null);

const merged = BurnedRegistry.mergeBurned(
  { v: 1, keys: ['a'], ids: ['q1'] },
  { v: 1, keys: ['b'], ids: ['q2'] },
);
ok('mergeBurned unions keys', merged.keys.includes('a') && merged.keys.includes('b'));
ok('mergeBurned unions ids', merged.ids.includes('q1') && merged.ids.includes('q2'));

const plan = VocabBatching.planBatches(
  Array.from({ length: 20 }, (_, i) => `wort${i + 1}`),
  ['lesen', 'horen'],
  null,
);
ok('plan batches for 20 words', plan.batches.length >= 2);
const b0 = VocabBatching.nextBatch(plan);
ok('first batch sized', b0.length <= VocabBatching.capacityFor(['lesen', 'horen']));
VocabBatching.advance(plan, b0);
ok('advance increments cursor', plan.cursor === 1);

ok('shouldUseGame lesen not hijacked', !VocabBatching.shouldUseGame(['a', 'b'], ['lesen'], undefined));
ok('shouldUseGame horen below threshold', VocabBatching.shouldUseGame(['a', 'b'], ['horen'], undefined));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('index loads ContentKey before ExamBlueprint', html.indexOf('ContentKey.js') < html.indexOf('ExamBlueprint.js'));
ok('index loads BurnedRegistry', html.includes('BurnedRegistry.js'));

console.log('\nBurned registry / batching tests passed.');
