/**
 * Retroactive scope audit: sprechenBriefing on OLD pool files (not gemini-010).
 * Run: node scripts/lib/__tests__/sprechenBriefingRetro.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const POOL_FILES = [
  { label: 'gemini-001 (oldest verified)', path: 'batches/ready/pool-verified/sprechen-gemini-001.json' },
  { label: 'gemini-005', path: 'batches/ready/pool-verified/sprechen-gemini-005.json' },
  { label: 'stadtfest-planung-01 (merged legacy)', path: 'batches/merged/sprechen-stadtfest-planung-01.json' },
];

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

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadRuntime() {
  const g = {
    console,
    esc,
    SpeakingModes: { INPUT_MODES: { TRANSCRIPT: 'transcript', PARTNER: 'partner' } },
    SpeakingConversation: { renderPartShell: () => '', initPart: () => {} },
    isPaidPlan: () => false,
    hasAiCreditsFor: () => false,
    Auth: { isGuest: () => true },
    window: {},
  };
  g.window = g;
  vm.createContext(g);
  for (const f of [
    'js/engine/sprechenBriefing.js',
    'js/data/publishedExamAdapter.js',
    'js/ui/exam/speakingFlow.js',
    'js/engine/personalLesenPoolFallback.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), g);
  }
  return g;
}

function poolPartFromBatch(batch, teil) {
  const q = batch.questions.find((x) => Number(x.teil) === teil);
  return {
    id: q.id,
    teil,
    questions: [q],
    title: q.type || `Teil ${teil}`,
  };
}

function assertNoDuplicateRender(html, briefing, teil, label) {
  assert.equal((html.match(/class="off-instr"/g) || []).length, 1, 'multiple off-instr');
  const introEsc = esc(briefing.intro);
  assert.equal(html.split(introEsc).length - 1, 1, 'intro repeated');
  assert.ok(!html.includes(esc(briefing.full)), 'full text block duplicated');
  const speakPoints = [...html.matchAll(/class="speak-point"[^>]*>([^<]+)/g)].map((m) => m[1]);
  for (const sp of speakPoints) {
    assert.ok(
      !sp.includes(esc(briefing.intro.slice(0, 24))),
      `intro leaked into speak-point (${label} T${teil})`,
    );
  }
}

const g = loadRuntime();
const { parseSprechenBriefing, briefingForPart } = g.SprechenBriefing;
const SpeakingFlow = g.SpeakingFlow;
const { reusablePartToSprechenPart } = g;
const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'fmt', lang: 'de', card: 'Karte', me: 'Ich:' };

console.log('\n── Live parse: reads question text only (no pre-stored briefing field) ──');

test('briefingForPart uses situation/question string, not a separate briefing field', () => {
  const q = 'Intro line.\n\nDiskutieren Sie folgende Punkte:\n• Punkt A\n• Punkt B';
  const part = {
    teil: 1,
    situation: q,
    points: ['WRONG stale intro line', 'WRONG stale bullet'],
    prompts: ['WRONG stale intro line', 'WRONG stale bullet'],
  };
  const view = briefingForPart(part);
  assert.equal(view.intro, 'Intro line.');
  assert.equal(view.bullets.length, 2);
  assert.equal(view.bullets[0], 'Punkt A');
});

test('render re-parses from situation even when part.points is empty (pool path)', () => {
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, POOL_FILES[0].path), 'utf8'));
  const poolPart = poolPartFromBatch(batch, 1);
  const part = reusablePartToSprechenPart(poolPart, {});
  part.points = [];
  part.prompts = [];
  const html = SpeakingFlow.renderGoetheSprechenPart(part, ui);
  const briefing = briefingForPart(part);
  assert.ok(briefing.bullets.length >= 3);
  assertNoDuplicateRender(html, { ...briefing, full: part.situation }, 1, 'empty-points');
});

console.log('\n── Old pool files: parse + render (3 sources × 3 Teile) ──');

for (const { label, path: relPath } of POOL_FILES) {
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  console.log(`\n  📁 ${label}`);

  for (const teil of [1, 2, 3]) {
    const q = batch.questions.find((x) => Number(x.teil) === teil);
    const poolPart = poolPartFromBatch(batch, teil);
    const part = reusablePartToSprechenPart(poolPart, {});
    const briefing = briefingForPart(part);
    const html = SpeakingFlow.renderGoetheSprechenPart(part, ui);

    test(`${label} T${teil}: intro parsed (${briefing.intro.length} chars)`, () => {
      assert.ok(briefing.intro.length > 15, 'intro too short');
      assert.ok(!briefing.intro.startsWith('•'), 'intro starts with bullet');
    });

    test(`${label} T${teil}: bullets without intro leak (${briefing.bullets.length} items)`, () => {
      if (teil === 2 && part.slides?.length) return;
      assert.ok(briefing.bullets.length >= 3, `only ${briefing.bullets.length} bullets`);
      const introStart = (q.question || '').trim().slice(0, 30);
      for (const b of briefing.bullets) {
        assert.ok(!b.startsWith(introStart.slice(0, 20)), `intro in bullet: ${b.slice(0, 50)}`);
      }
    });

    test(`${label} T${teil}: HTML no duplicate consigna`, () => {
      assertNoDuplicateRender(html, { ...briefing, full: part.situation }, teil, label);
    });

    console.log(
      `     T${teil}: intro ${briefing.intro.length}c | bullets ${briefing.bullets.length} | ` +
        `off-instr×${(html.match(/off-instr/g) || []).length} speak-point×${(html.match(/speak-point/g) || []).length}`,
    );
  }
}

console.log('\n── PublishedExamAdapter path (gemini-001) ──');

test('publishedDocToServedExam populates situation from raw question', () => {
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, POOL_FILES[0].path), 'utf8'));
  for (const teil of [1, 2, 3]) {
    const q = batch.questions.find((x) => Number(x.teil) === teil);
    const record = { module: 'sprechen', teil, questions: [q] };
    const adapted = g.PublishedExamAdapter.publishedDocToServedExam({
      examId: 'retro-test',
      title: 'T',
      level: 'B1',
      lang: 'de',
      slot: 1,
      manifestVersion: 1,
      parts: [{ module: 'sprechen', cell: `sprechen_${teil}`, partId: `p${teil}`, contentHash: 'x', snapshot: record }],
    });
    const sp = adapted.sprechenParts.find((p) => Number(p.teil) === teil);
    assert.ok(sp.situation.includes(q.question.slice(0, 40).trim().slice(0, 20)), `T${teil} situation missing question`);
    const view = briefingForPart(sp);
    const html = SpeakingFlow.renderGoetheSprechenPart(sp, ui);
    assert.ok(view.bullets.length >= 3 || (teil === 2 && sp.slides?.length), `T${teil} no bullets`);
    assertNoDuplicateRender(html, { ...view, full: sp.situation }, teil, 'published-001');
  }
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
