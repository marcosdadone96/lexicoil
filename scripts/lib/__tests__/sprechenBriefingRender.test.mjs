/**
 * Sprechen briefing render — no duplicate consigna in HTML (T1/T2/T3).
 * Run: node scripts/lib/__tests__/sprechenBriefingRender.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

const batch = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'batches/ready/pool-verified/sprechen-gemini-010.json'), 'utf8'),
);

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
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/engine/sprechenBriefing.js'), 'utf8'), g);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/speakingFlow.js'), 'utf8'), g);
const SpeakingFlow = g.SpeakingFlow || g.window.SpeakingFlow;
const { parseSprechenBriefing } = g.SprechenBriefing;

const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'fmt', lang: 'de', card: 'Karte', me: 'Ich:' };

console.log('\n── renderGoetheSprechenPart: no duplicate consigna (gemini-010) ──');

for (const teil of [1, 2, 3]) {
  const q = batch.questions.find((x) => x.teil === teil);
  const briefing = parseSprechenBriefing(q.question, teil);
  const part = {
    teil,
    title: q.taskFormat || `Teil ${teil}`,
    fieldId: `speak_bp_${teil}`,
    situation: q.question,
    points: briefing.bullets,
    prompts: briefing.bullets,
    slides: teil === 2 ? q.slides || [] : [],
  };
  const html = SpeakingFlow.renderGoetheSprechenPart(part, ui);

  test(`T${teil}: exactly one off-instr block`, () => {
    assert.equal((html.match(/class="off-instr"/g) || []).length, 1);
  });

  test(`T${teil}: intro in off-instr, not repeated as speak-point`, () => {
    const introSnippet = briefing.intro.slice(0, 40);
    assert.ok(html.includes(esc(introSnippet)), 'intro missing from off-instr');
    const speakPoints = [...html.matchAll(/class="speak-point"[^>]*>([^<]+)/g)].map((m) => m[1]);
    for (const sp of speakPoints) {
      assert.ok(
        !sp.includes(esc(introSnippet.slice(0, 20))),
        `intro leaked into speak-point: ${sp.slice(0, 60)}`,
      );
    }
  });

  test(`T${teil}: full question text not duplicated wholesale`, () => {
    const full = q.question.trim();
    const introEsc = esc(briefing.intro);
    const occurrences = html.split(introEsc).length - 1;
    assert.equal(occurrences, 1, `intro appears ${occurrences} times`);
    assert.ok(!html.includes(esc(full)), 'full question still rendered as block');
  });

  if (teil === 2 && part.slides.length) {
    test('T2: slides shown as numbered boxes (not line-split bullets)', () => {
      assert.match(html, /speak-slides/);
      assert.doesNotMatch(html, /speak-points-list/);
    });
  } else {
    test(`T${teil}: bullets as labeled list (${briefing.bullets.length} items)`, () => {
      assert.match(html, /Punkte zum Besprechen/);
      assert.match(html, /speak-points-list/);
      const liCount = (html.match(/<li class="speak-point"/g) || []).length;
      assert.equal(liCount, briefing.bullets.length);
    });
  }

  console.log(
    `     T${teil} visual: [off-instr] ${briefing.intro.length} chars → ` +
      (teil === 2 && part.slides.length
        ? `${part.slides.length} slide boxes`
        : `${briefing.bullets.length} bullet list items`),
  );
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
