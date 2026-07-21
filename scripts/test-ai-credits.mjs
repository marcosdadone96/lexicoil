#!/usr/bin/env node
/**
 * Acceptance: AI credits model — monthly pools, action access matrix, feedback levels.
 *
 * Includes LEGACY_SNAPSHOT documenting pre-2026-06 behavior (trial-based free access).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { AI_COSTS, resolveAiCost, checkActionAccess } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
const { ACTION_ACCESS, checkActionAccess: matrixCheck, feedbackLevelForPlan } = require(
  path.join(ROOT, 'netlify/functions/lib/actionAccessLib.js'),
);
const { getMonthKey } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const {
  aiMaxForPlan,
  isFreeAiTrialActive,
  aiCreditsFreeMax,
} = require(path.join(ROOT, 'netlify/functions/lib/freeTrialLib.js'));
const {
  normalizeSchreibenItem,
  normalizeProductionEvalResponse,
} = require(path.join(ROOT, 'netlify/functions/lib/productionEval.js'));

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

// ── Legacy snapshot (documented — do not regress silently) ─────────────────
const LEGACY_SNAPSHOT = Object.freeze({
  proMax: 100,
  freeTrialMax: 30,
  freePostTrialMax: 0,
  speakingCost: 1,
  freeAccess: 'first_month_trial_only',
});
pass('legacy snapshot: pro was 100 credits', LEGACY_SNAPSHOT.proMax === 100);
pass('legacy snapshot: free trial was 30', LEGACY_SNAPSHOT.freeTrialMax === 30);

// ── Cost table ─────────────────────────────────────────────────────────────
pass('resolveAiCost personal_lesen is 0', resolveAiCost('personal_lesen') === 0);
pass('resolveAiCost personal_horen is 0', resolveAiCost('personal_horen') === 0);
pass('resolveAiCost unknown is null', resolveAiCost('not_an_action') === null);
pass('personal_lesen costs 0', AI_COSTS.personal_lesen === 0);
pass('personal_horen costs 0', AI_COSTS.personal_horen === 0);
pass('personal_schreiben costs 2', AI_COSTS.personal_schreiben === 2);
pass('personal_sprechen_gen costs 2', AI_COSTS.personal_sprechen_gen === 2);
pass('speaking_realtime costs 4', AI_COSTS.speaking_realtime === 4);
pass('writing_correction costs 1', AI_COSTS.writing_correction === 1);
pass('vocab_quiz costs 2', AI_COSTS.vocab_quiz === 2);
pass('grammar_coaching costs 1', AI_COSTS.grammar_coaching === 1);
pass('speaking costs 2', AI_COSTS.speaking === 2);
pass('listening_game costs 2', AI_COSTS.listening_game === 2);
pass('vocab_phrases costs 1', AI_COSTS.vocab_phrases === 1);
pass('tts costs 1', AI_COSTS.tts === 1);

// ── Monthly pools ──────────────────────────────────────────────────────────
pass('guest max is 0', aiMaxForPlan('guest') === 0);
pass('free max defaults to 6', aiMaxForPlan('free') === 6);
pass('pro max defaults to 40', aiMaxForPlan('pro') === 40);
pass('pro_max defaults to 150', aiMaxForPlan('pro_max') === 150);

const expiredUser = { createdAt: '2020-01-01T00:00:00.000Z' };
const trialUser = { createdAt: new Date().toISOString() };
pass('free user always gets 6 (not 0 post-trial)', aiMaxForPlan('free', expiredUser) === 6);
pass('isFreeAiTrialActive still works for welcome bonus flag', isFreeAiTrialActive(trialUser) === true);
pass('aiCreditsFreeMax is 6', aiCreditsFreeMax() === 6);

// ── ACTION_ACCESS matrix ───────────────────────────────────────────────────
function expectAccess(plan, action, expectOk, expectError = null) {
  const r = matrixCheck(plan, action);
  pass(`${plan} + ${action} -> ${expectOk ? 'ok' : expectError}`, r.ok === expectOk && (!expectError || r.error === expectError));
}

expectAccess('free', 'speaking', true);
expectAccess('free', 'writing_correction', true);
expectAccess('free', 'vocab_quiz', true);
expectAccess('free', 'listening_game', true);
expectAccess('free', 'vocab_phrases', true);
expectAccess('free', 'personal_exam', false, 'pro_only');
expectAccess('free', 'personal_lesen', true);
expectAccess('free', 'personal_horen', true);
expectAccess('free', 'grammar_coaching', false, 'pro_only');
expectAccess('free', 'tts', false, 'pro_only');
expectAccess('guest', 'speaking', false, 'login_required');
expectAccess('pro', 'personal_exam', true);
expectAccess('pro_max', 'grammar_coaching', true);
expectAccess('pro_max', 'tts', true);

// ── Simulated consumption with action matrix ───────────────────────────────
function simulateConsume(current, action, plan = 'pro', user = null) {
  const cost = AI_COSTS[action];
  const month = getMonthKey();
  const max = aiMaxForPlan(plan, user);
  let aiUsed = 0;
  if (current && current.month === month) {
    aiUsed = Number(current.aiUsed) || 0;
  }
  const access = matrixCheck(plan, action);
  if (!access.ok) {
    return { ok: false, error: access.error, aiUsed, remaining: Math.max(0, max - aiUsed) };
  }
  if (aiUsed + cost > max) {
    return { ok: false, error: 'ai_credits_exhausted', aiUsed, remaining: Math.max(0, max - aiUsed) };
  }
  return {
    ok: true,
    payload: { aiUsed: aiUsed + cost, aiMax: max, month },
    remaining: max - aiUsed - cost,
  };
}

{
  let blob = null;
  const actions = ['speaking', 'writing_correction', 'vocab_quiz'];
  for (const a of actions) {
    const r = simulateConsume(blob, a, 'free', expiredUser);
    pass(`free can ${a}`, r.ok);
    blob = r.payload;
  }
  pass('free used 5 credits on core actions', blob.aiUsed === 5);
  const listenBlocked = simulateConsume(blob, 'listening_game', 'free', expiredUser);
  pass('free listening_game blocked when only 1 credit left (costs 2)', !listenBlocked.ok && listenBlocked.error === 'ai_credits_exhausted');
  const phrasesOk = simulateConsume(blob, 'vocab_phrases', 'free', expiredUser);
  pass('free can vocab_phrases with 1 credit left', phrasesOk.ok && phrasesOk.payload.aiUsed === 6);
  const blocked = simulateConsume(phrasesOk.payload, 'speaking', 'free', expiredUser);
  pass('free blocked after 6 credits', !blocked.ok && blocked.error === 'ai_credits_exhausted');
  const proOnly = simulateConsume(blob, 'personal_exam', 'free', expiredUser);
  pass('free personal_exam pro_only', !proOnly.ok && proOnly.error === 'pro_only');
}

{
  let blob = null;
  const r1 = simulateConsume(blob, 'personal_exam', 'pro');
  pass('pro personal_exam consumes 4', r1.ok && r1.payload.aiUsed === 4);
  blob = { month: getMonthKey(), aiUsed: 38, aiMax: 40 };
  const r2 = simulateConsume(blob, 'speaking', 'pro');
  pass('pro speaking costs 2 (38+2=40)', r2.ok && r2.payload.aiUsed === 40);
}

{
  const blob = { month: getMonthKey(), aiUsed: 0, aiMax: 150 };
  const r = simulateConsume(blob, 'personal_exam', 'pro_max');
  pass('pro_max personal_exam ok', r.ok && r.remaining === 146);
}

// ── Feedback levels ────────────────────────────────────────────────────────
pass('free feedback basic', feedbackLevelForPlan('free') === 'basic');
pass('pro feedback full', feedbackLevelForPlan('pro') === 'full');
pass('pro_max feedback full', feedbackLevelForPlan('pro_max') === 'full');

const basicParsed = {
  schreiben: [
    {
      id: 'w1',
      totalScore: 62,
      passed: true,
      rubric: { erfuellung: 15, kohaerenz: 16, wortschatz: 15, strukturen: 16 },
      summary: 'Orientative note',
      errorCounts: { grammar: 2, vocab: 1, spelling: 0, register: 0, cohesion: 1 },
    },
  ],
};
const basicNorm = normalizeProductionEvalResponse(basicParsed, {
  schreiben: [{ id: 'w1' }],
  passPercent: 60,
  feedbackLevel: 'basic',
});
pass('basic eval strips correctedText', basicNorm.ok && !basicNorm.schreiben[0].correctedText);
pass('basic eval keeps errorCounts', basicNorm.schreiben[0].errorCounts?.grammar === 2);

const fullItem = normalizeSchreibenItem(
  {
    id: 'w1',
    totalScore: 80,
    rubric: { erfuellung: 20, kohaerenz: 20, wortschatz: 20, strukturen: 20 },
    correctedText: 'Hallo Welt',
    errors: [{ original: 'a', correction: 'b' }],
    grammarPoints: [{ tag: 'case' }],
  },
  60,
  'full',
);
pass('full eval keeps correctedText', fullItem.correctedText === 'Hallo Welt');
pass('full eval keeps grammarPoints', fullItem.grammarPoints.length === 1);

const basicItem = normalizeSchreibenItem(
  {
    id: 'w1',
    totalScore: 55,
    rubric: { erfuellung: 14, kohaerenz: 14, wortschatz: 14, strukturen: 13 },
    summary: 'OK',
    errorCounts: { grammar: 3 },
    correctedText: 'should strip',
  },
  60,
  'basic',
);
pass('basic schreiben item strips correctedText', !basicItem.correctedText);
pass('basic schreiben item has feedbackLevel', basicItem.feedbackLevel === 'basic');

// ── ACTION_ACCESS exported from aiCredits re-export ─────────────────────────
pass('checkActionAccess re-export works', checkActionAccess('free', 'tts').error === 'pro_only');
pass('ACTION_ACCESS has 13 actions', Object.keys(ACTION_ACCESS).length === 13);

console.log('\nAI credits acceptance tests done.\n');
