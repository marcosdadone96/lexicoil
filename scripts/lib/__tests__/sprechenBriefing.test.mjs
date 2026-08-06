/**
 * Sprechen briefing parse — no duplicate intro in bullets.
 * Run: node scripts/lib/__tests__/sprechenBriefing.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const { parseSprechenBriefing, briefingForPart } = require(
  path.join(ROOT, 'js/engine/sprechenBriefing.js'),
);

const batch = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/pool-verified/sprechen-gemini-010.json'), 'utf8'),
);

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('\n── parseSprechenBriefing (gemini-010) ──');

for (const teil of [1, 2, 3]) {
  const q = batch.questions.find((x) => x.teil === teil);
  const b = parseSprechenBriefing(q.question, teil);
  test(`T${teil}: intro does not repeat as first bullet`, () => {
    assert.ok(b.intro.length > 20);
    assert.ok(b.bullets.length >= 3, `expected bullets, got ${b.bullets.length}`);
    assert.ok(!b.bullets[0].startsWith('Sie möchten'), `intro leaked: ${b.bullets[0].slice(0, 40)}`);
    assert.ok(!b.bullets[0].startsWith('Halten Sie'), `intro leaked: ${b.bullets[0].slice(0, 40)}`);
    assert.ok(!b.bullets[0].startsWith('Geben Sie'), `intro leaked: ${b.bullets[0].slice(0, 40)}`);
  });
  console.log(`     T${teil}: intro ${b.intro.length} chars, bullets=${b.bullets.length}`);
}

test('T1 has 5 planning bullets', () => {
  const q = batch.questions.find((x) => x.teil === 1);
  const b = parseSprechenBriefing(q.question, 1);
  assert.equal(b.bullets.length, 5);
  assert.match(b.bullets[0], /Termin/i);
});

test('T2 has 5 presentation slide bullets', () => {
  const q = batch.questions.find((x) => x.teil === 2);
  const b = parseSprechenBriefing(q.question, 2);
  assert.equal(b.bullets.length, 5);
  assert.match(b.bullets[0], /Einleitung/i);
});

test('T3 has example questions only (no Beispielfragen label)', () => {
  const q = batch.questions.find((x) => x.teil === 3);
  const b = parseSprechenBriefing(q.question, 3);
  assert.equal(b.bullets.length, 3);
  assert.ok(!b.bullets.some((x) => /^beispielfragen/i.test(x)));
});

console.log('\n── briefingForPart display shape ──');

test('briefingForPart uses slides when present (T2)', () => {
  const q = batch.questions.find((x) => x.teil === 2);
  const view = briefingForPart({
    teil: 2,
    situation: q.question,
    slides: [{ n: 1, title: 'Einleitung' }],
  });
  assert.equal(view.slides.length, 1);
  assert.equal(view.bullets.length, 0);
  assert.ok(view.intro.length > 10);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
