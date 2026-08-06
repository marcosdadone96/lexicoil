/**
 * Sprechen partner scope (T1 + T3) + whoStarts randomization.
 * Run: node scripts/lib/__tests__/speakingPartnerScope.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
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

console.log('\n── speakingFlow T1/T3 partner gate ──');

const flowSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/speakingFlow.js'), 'utf8');
const SpeakingModes = {
  INPUT_MODES: { TRANSCRIPT: 'transcript', PARTNER: 'partner', REALTIME: 'partner' },
};
const shells = [];
const SpeakingConversation = {
  renderPartShell(part) {
    shells.push(part.teil);
    return `<div class="partner-shell" data-teil="${part.teil}"></div>`;
  },
  initPart() {},
};
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ctx = {
  SpeakingModes,
  SpeakingConversation,
  esc,
  isPaidPlan: () => true,
  hasAiCreditsFor: () => true,
  Auth: { isGuest: () => false },
  console,
  window: {},
};
vm.createContext(ctx);
vm.runInContext(flowSrc, ctx);
const SpeakingFlow = ctx.SpeakingFlow || ctx.window.SpeakingFlow;

test('isPartnerTeil true for teil 1 and 3 only', () => {
  assert.equal(SpeakingFlow.isPartnerTeil({ teil: 1 }), true);
  assert.equal(SpeakingFlow.isPartnerTeil({ teil: 2 }), false);
  assert.equal(SpeakingFlow.isPartnerTeil({ teil: 3 }), true);
  assert.equal(SpeakingFlow.isPartnerTeil({ teil: '1' }), true);
  assert.equal(SpeakingFlow.isPartnerTeil({ teil: '3' }), true);
});

test('Pro: T1/T3 render partner shell; T2 does not', () => {
  shells.length = 0;
  const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'fmt', lang: 'de', card: 'Karte' };
  const t1 = SpeakingFlow.renderGoetheSprechenPart(
    { teil: 1, title: 'Plan', fieldId: 'speak_bp_1', situation: 'Plane etwas.' },
    ui,
  );
  const t2 = SpeakingFlow.renderGoetheSprechenPart(
    { teil: 2, title: 'Präsentation', fieldId: 'speak_bp_2', situation: 'Präsentiere.' },
    ui,
  );
  const t3 = SpeakingFlow.renderGoetheSprechenPart(
    { teil: 3, title: 'Feedback', fieldId: 'speak_bp_3', situation: 'Feedback.' },
    ui,
  );
  assert.equal(shells.includes(1), true);
  assert.equal(shells.includes(2), false);
  assert.equal(shells.includes(3), true);
  assert.match(t1, /partner-shell/);
  assert.doesNotMatch(t2, /partner-shell/);
  assert.match(t3, /partner-shell/);
  assert.match(t1, /data-speak-mode="partner"/);
  assert.match(t2, /data-speak-mode="transcript"/);
  assert.match(t3, /data-speak-mode="partner"/);
  assert.match(t2, /Einzelpräsentation|Individual presentation/);
  assert.doesNotMatch(t2, /speak-persona-pill|speak-conv-panel/);
});

test('Free plan: all Teile stay transcript (no partner shell)', () => {
  shells.length = 0;
  ctx.isPaidPlan = () => false;
  const ui = { speaking: 'Sprechen', teil: 'Teil', speakFmt: 'fmt', lang: 'de' };
  for (const teil of [1, 2, 3]) {
    SpeakingFlow.renderGoetheSprechenPart(
      { teil, title: 'X', fieldId: `speak_bp_${teil}`, situation: 'Test.' },
      ui,
    );
  }
  assert.equal(shells.length, 0);
  ctx.isPaidPlan = () => true;
});

console.log('\n── speaking-chat whoStarts + teil ──');

const chat = require(path.join(ROOT, 'netlify/functions/speaking-chat.js'));
const { decideWhoStarts } = chat;
const { resolveTeil } = require(path.join(ROOT, 'netlify/functions/lib/speakingPersonas.js'));

test('decideWhoStarts varies across many draws', () => {
  const counts = { partner: 0, user: 0 };
  for (let i = 0; i < 200; i++) counts[decideWhoStarts()]++;
  assert.ok(counts.partner > 40);
  assert.ok(counts.user > 40);
});

test('resolveTeil maps only 1 and 3; other → 1 default', () => {
  assert.equal(resolveTeil(1), 1);
  assert.equal(resolveTeil(3), 3);
  assert.equal(resolveTeil(2), 1);
  assert.equal(resolveTeil(null), 1);
});

console.log('\n── A2 level-aware prompts ──');

const personasMod = require(path.join(ROOT, 'netlify/functions/lib/speakingPersonas.js'));

test('A2 T1 task block = Karten Q&A, not B1 Planung', () => {
  const sys = personasMod.buildChatSystem({
    personaId: 'balanced',
    teil: 1,
    level: 'A2',
    situation: 'Vier Karten: Geburtstag, Wohnort, Beruf, Hobby.',
  });
  assert.match(sys, /Fragen zur Person mit Karten, A2/);
  assert.match(sys, /A2-Niveau/);
  assert.doesNotMatch(sys, /Gemeinsame Planung, B1/);
});

test('A2 T3 task block = Termin + Agenden, not B1 Feedback', () => {
  const sys = personasMod.buildChatSystem({
    personaId: 'balanced',
    teil: 3,
    level: 'A2',
    situation: 'Geschenk kaufen und Termin finden.',
  });
  assert.match(sys, /Termin finden, A2/);
  assert.doesNotMatch(sys, /Feedback und Fragen, B1/);
});

test('A2 Kim maxWordsPerTurn (8) < B1 Kim (12)', () => {
  assert.equal(personasMod.getPersona('quiet', 'A2').maxWordsPerTurn, 8);
  assert.equal(personasMod.getPersona('quiet', 'B1').maxWordsPerTurn, 12);
});

test('buildOpenerUser A2 mentions A2-Niveau, not B1-Gespräch', () => {
  const op = personasMod.buildOpenerUser({ level: 'A2', teil: 1, situation: 'Test.' });
  assert.match(op, /A2-Niveau/);
  assert.doesNotMatch(op, /B1-Gespräch/);
});

console.log('\n── backend teil wiring (no hardcoded 2) ──');

test('speaking-realtime-session uses session.teil not literal 2', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'netlify/functions/speaking-realtime-session.js'),
    'utf8',
  );
  assert.doesNotMatch(src, /teil:\s*2,/);
  assert.match(src, /blueprint\.teil/);
});

test('speakingLiveExam passes teil to eval payload', () => {
  const { toProductionEvalSprechenTask } = require(
    path.join(ROOT, 'netlify/functions/lib/speakingLiveExam.js'),
  );
  const t1 = toProductionEvalSprechenTask({ fieldId: 'speak_bp_1', teil: 1, turns: [] });
  const t3 = toProductionEvalSprechenTask({ fieldId: 'speak_bp_3', teil: 3, turns: [] });
  assert.equal(t1.teil, 1);
  assert.equal(t3.teil, 3);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
