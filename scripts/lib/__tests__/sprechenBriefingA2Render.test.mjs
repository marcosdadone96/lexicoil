/**
 * A2 Sprechen — consigna must render once (no Punkte zum Besprechen line-split dup).
 * Run: node scripts/lib/__tests__/sprechenBriefingA2Render.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified/A2/sprechen-cur-education.json');

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
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), g);
  }
  return g;
}

const g = loadRuntime();
const { briefingForPart, parseSprechenBriefing, isA2GoetheSprechen } = g.SprechenBriefing;
const { snapshotToExamPart } = g.PublishedExamAdapter;
const SpeakingFlow = g.SpeakingFlow;
const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'fmt', lang: 'de', card: 'Karte', me: 'Ich:' };

const batch = JSON.parse(fs.readFileSync(POOL, 'utf8'));

console.log('\n── A2 Sprechen briefing parse (education) ──');

for (const teil of [1, 2, 3]) {
  const q = batch.questions.find((x) => Number(x.teil) === teil);
  test(`T${teil}: isA2GoetheSprechen true`, () => {
    assert.ok(isA2GoetheSprechen(q.question, teil, { level: 'A2', type: q.type }));
  });
  test(`T${teil}: parseSprechenBriefing → no bullets`, () => {
    const b = parseSprechenBriefing(q.question, teil, { level: 'A2', type: q.type });
    assert.equal(b.bullets.length, 0);
    assert.equal(b.intro, q.question.trim());
  });
}

  test(`T1: A2 Karten grid (4 cards)`, () => {
    const q = batch.questions.find((x) => Number(x.teil) === 1);
    const view = briefingForPart({ teil: 1, level: 'A2', situation: q.question });
    assert.equal(view.layout, 'cards');
    assert.equal(view.items.length, 4);
    const html = SpeakingFlow.renderGoetheSprechenPart(
      { teil: 1, level: 'A2', fieldId: 'speak_bp_1', situation: q.question },
      ui,
    );
    assert.match(html, /speak-brief-cards/);
    assert.equal((html.match(/speak-brief-item/g) || []).length, 4);
  });

for (const teil of [1, 2, 3]) {
  const q = batch.questions.find((x) => Number(x.teil) === teil);
  const record = {
    id: `sprechen-cur-education-t${teil}`,
    module: 'sprechen',
    teil,
    level: 'A2',
    lang: 'de',
    instruction: q.question,
    task: q.question,
    questions: [q],
    complete: true,
    verified: true,
  };
  const part = snapshotToExamPart(record);
  test(`T${teil}: snapshot points/prompts empty`, () => {
    assert.equal((part.points || []).length, 0);
    assert.equal((part.prompts || []).length, 0);
  });
  test(`T${teil}: render — sprechen-briefing, no Punkte list`, () => {
    const html = SpeakingFlow.renderGoetheSprechenPart(part, ui);
    assert.equal((html.match(/class="sprechen-briefing"/g) || []).length, 1);
    assert.doesNotMatch(html, /Punkte zum Besprechen/);
    assert.doesNotMatch(html, /speak-points-list/);
    assert.ok(html.includes('speak-brief-cards') || html.includes('speak-brief-agenda') || html.includes('sprechen-briefing-intro'));
  });
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
