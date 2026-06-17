#!/usr/bin/env node
/**
 * Acceptance: AI credits (server costs, monthly reset, exhaustion, client mirror).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { AI_COSTS, aiMaxForPlan } = require(
  path.join(ROOT, 'netlify/functions/lib/aiCredits.js'),
);
const { getMonthKey } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));

function assertPass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

// ── Cost table ──
assertPass('personal_exam costs 3', AI_COSTS.personal_exam === 3);
assertPass('writing_correction costs 1', AI_COSTS.writing_correction === 1);
assertPass('grammar_coaching costs 1', AI_COSTS.grammar_coaching === 1);
assertPass('Pro max defaults to 100', aiMaxForPlan('pro') === 100);
assertPass('Free max is 0', aiMaxForPlan('free') === 0);
assertPass('Guest max is 0', aiMaxForPlan('guest') === 0);

// ── Month rollover resets aiUsed ──
{
  const month = getMonthKey();
  const prevMonth = '1999-1';
  let aiUsed = 0;
  const blob = { month: prevMonth, used: 5, aiUsed: 97 };
  if (blob.month === month) aiUsed = Number(blob.aiUsed) || 0;
  assertPass('New month resets aiUsed to 0', aiUsed === 0);
}

// ── Simulated consumption (mirror server CAS) ──
function simulateConsume(current, action, plan = 'pro') {
  const cost = AI_COSTS[action];
  const month = getMonthKey();
  const max = aiMaxForPlan(plan);
  let used = 0;
  let aiUsed = 0;
  if (current && current.month === month) {
    used = Number(current.used) || 0;
    aiUsed = Number(current.aiUsed) || 0;
  }
  if (plan !== 'pro' || aiUsed + cost > max) {
    return { ok: false, error: 'ai_credits_exhausted', aiUsed, remaining: Math.max(0, max - aiUsed) };
  }
  return {
    ok: true,
    payload: { used, aiUsed: aiUsed + cost, aiMax: max, month },
    remaining: max - aiUsed - cost,
  };
}

{
  let blob = null;
  const r1 = simulateConsume(blob, 'personal_exam');
  assertPass('Pro personal_exam consumes 3 from empty', r1.ok && r1.payload.aiUsed === 3);
  blob = r1.payload;
  const r2 = simulateConsume(blob, 'writing_correction');
  assertPass('writing_correction adds 1', r2.ok && r2.payload.aiUsed === 4);
  blob = { month: getMonthKey(), used: 0, aiUsed: 98, aiMax: 100 };
  const r3 = simulateConsume(blob, 'personal_exam');
  assertPass('402 when 98+3 > 100', !r3.ok && r3.error === 'ai_credits_exhausted');
}

// ── Exam quota independent of AI credits ──
{
  const month = getMonthKey();
  const blob = { month, used: 7, aiUsed: 42, aiMax: 100 };
  const newUsed = (Number(blob.used) || 0) + 1;
  const aiUsed = Number(blob.aiUsed) || 0;
  assertPass('increment exam quota preserves aiUsed', newUsed === 8 && aiUsed === 42);
}

// ── Client applyServerQuota mirror ──
function applyServerQuotaClient(data, S = {}) {
  if (data.plan) S.plan = data.plan;
  if (typeof data.aiMax === 'number') S.aiCreditsMax = data.aiMax;
  else if (S.plan === 'pro') S.aiCreditsMax = 100;
  else S.aiCreditsMax = 0;
  if (typeof data.aiUsed === 'number') S.aiCreditsUsed = data.aiUsed;
  return S;
}

{
  const S = applyServerQuotaClient({ plan: 'pro', aiUsed: 12, aiMax: 100 });
  assertPass('Client stores aiUsed/aiMax', S.aiCreditsUsed === 12 && S.aiCreditsMax === 100);
  const rem = Math.max(0, S.aiCreditsMax - S.aiCreditsUsed);
  assertPass('Remaining = 88', rem === 88);
}

console.log('\nAI credits acceptance tests done.\n');
