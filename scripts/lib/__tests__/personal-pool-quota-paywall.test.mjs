#!/usr/bin/env node
/**
 * Personal pool quota + unified AI credit paywall acceptance tests.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));
const { AI_COSTS } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
const { checkActionAccess } = require(path.join(ROOT, 'netlify/functions/lib/actionAccessLib.js'));
const { applyMonthlyAiReset } = require(path.join(ROOT, 'netlify/functions/lib/aiQuotaState.js'));
const { aiMaxForPlan } = require(path.join(ROOT, 'netlify/functions/lib/freeTrialLib.js'));
const { getMonthKey } = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));

function pass(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

// ── Plan limits ─────────────────────────────────────────────────────────────
pass('Free Lesen max 8', PersonalPoolQuota.maxFor('free', 'lesen') === 8);
pass('Free Hören max 8', PersonalPoolQuota.maxFor('free', 'horen') === 8);
pass('Pro Lesen max 30', PersonalPoolQuota.maxFor('pro', 'lesen') === 30);
pass('Pro Hören max 30', PersonalPoolQuota.maxFor('pro', 'horen') === 30);
pass('Pro Max Lesen max 60 (proposal)', PersonalPoolQuota.maxFor('pro_max', 'lesen') === 60);
pass('Pro Max Hören max 60 (proposal)', PersonalPoolQuota.maxFor('pro_max', 'horen') === 60);

pass('free personal_lesen allowed in matrix', checkActionAccess('free', 'personal_lesen').ok);
pass('free personal_horen allowed in matrix', checkActionAccess('free', 'personal_horen').ok);

// ── Monthly reset (same month key as server) ────────────────────────────────
{
  const month = getMonthKey();
  const rec = applyMonthlyAiReset(
    { month, personalLesenUsed: 5, personalHorenUsed: 3, aiUsed: 2, aiMax: 6 },
    6,
    month,
  );
  pass('same month keeps personalLesenUsed', rec.personalLesenUsed === 5);
  pass('same month keeps personalHorenUsed', rec.personalHorenUsed === 3);
  const reset = applyMonthlyAiReset(
    { month: '2020-01', personalLesenUsed: 8, personalHorenUsed: 8 },
    6,
    month,
  );
  pass('new month resets personalLesenUsed', reset.personalLesenUsed === 0);
  pass('new month resets personalHorenUsed', reset.personalHorenUsed === 0);
}

// ── Client paywall mirror (featureQuota logic) ──────────────────────────────
function buildQuotaSandbox(initial = {}) {
  const sandbox = {
    S: {
      plan: 'free',
      quotaUsed: 0,
      quotaMax: 5,
      aiCreditsUsed: 6,
      aiCreditsMax: 6,
      aiCreditsRemaining: 0,
      aiCreditsRollover: 0,
      aiCreditsTopups: 0,
      aiCreditsTotalPool: 6,
      personalLesenUsed: 0,
      personalHorenUsed: 0,
      ...initial,
    },
    GUEST_QUOTA: 2,
    FREE_QUOTA: 5,
    PRO_QUOTA: 12,
    PersonalPoolQuota,
    window: {},
    document: {
      getElementById: () => ({ classList: { add() {}, remove() {} }, innerHTML: '', textContent: '' }),
    },
    notifyCalls: [],
    paywallCalls: [],
    upgradeCalls: [],
    loginCalls: [],
    notify(msg) {
      sandbox.notifyCalls.push(msg);
    },
    lcToast() {},
    showLogin() {
      sandbox.loginCalls.push(1);
    },
    showUpgrade() {
      sandbox.upgradeCalls.push(1);
    },
    showCreditPackModal(opts) {
      sandbox.paywallCalls.push({ type: 'creditPack', opts });
    },
    showPersonalPoolQuotaExceeded(mod) {
      sandbox.paywallCalls.push({ type: 'personalPool', mod });
    },
    getMonthKey,
    isPaidPlan() {
      return sandbox.S.plan === 'pro' || sandbox.S.plan === 'pro_max';
    },
    resolveAppPlan() {
      return sandbox.S.plan;
    },
    getAiCreditsRemaining() {
      const pool =
        (sandbox.S.aiCreditsMax || 0) +
        (sandbox.S.aiCreditsRollover || 0) +
        (sandbox.S.aiCreditsTopups || 0);
      const used = sandbox.S.aiCreditsUsed || 0;
      if (typeof sandbox.S.aiCreditsRemaining === 'number') return Math.max(0, sandbox.S.aiCreditsRemaining);
      return Math.max(0, pool - used);
    },
    getAiCreditsTotalPool() {
      return (
        (sandbox.S.aiCreditsMax || 0) +
        (sandbox.S.aiCreditsRollover || 0) +
        (sandbox.S.aiCreditsTopups || 0)
      );
    },
    aiCreditsRenewalLabel: () => '1 Aug 2026',
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(
    `var requireAiCreditsFn, exhaustedWallActionsForPlanFn, canUsePersonalPoolModuleFn, requirePersonalPoolModuleFn;
    (function(){
      const PRO_ONLY_ACTIONS = new Set([
        'personal_exam','personal_schreiben','personal_sprechen_gen','grammar_coaching','speaking_realtime',
      ]);
      function aiActionCost(action){
        const costs={
          personal_schreiben:2,personal_sprechen_gen:2,vocab_quiz:2,speaking:2,
          speaking_realtime:4,writing_correction:1,listening_game:2,vocab_phrases:1,
          personal_lesen:0,personal_horen:0,
        };
        return costs[action]??0;
      }
      function canUsePersonalPoolModule(module){
        if(S.plan==='guest')return false;
        return PersonalPoolQuota.canUse(S.plan,module,{
          personalLesenUsed:S.personalLesenUsed,personalHorenUsed:S.personalHorenUsed,
        });
      }
      function requirePersonalPoolModule(module){
        if(S.plan==='guest'){showLogin();return false;}
        if(canUsePersonalPoolModule(module))return true;
        showPersonalPoolQuotaExceeded(module);
        return false;
      }
      function exhaustedWallActionsForPlan(plan){
        const p=String(plan||S.plan||'guest').toLowerCase();
        if(p==='free'||p==='guest')return{primary:'upgrade_pro',showPacks:true,showAutoRecharge:false};
        if(p==='pro')return{primary:'upgrade_pro_max',showPacks:true,showAutoRecharge:true};
        if(p==='pro_max')return{primary:'buy_pack',showPacks:true,showAutoRecharge:true};
        return{primary:'upgrade_pro',showPacks:true,showAutoRecharge:false};
      }
      function showAiCreditsExhausted(){showCreditPackModal({mode:'exhausted'});}
      function requireAiCredits(action){
        if(S.plan==='guest'){showLogin();return false;}
        if(PRO_ONLY_ACTIONS.has(action)&&!isPaidPlan()){showUpgrade();return false;}
        const cost=aiActionCost(action);
        if(cost===0){
          if(action==='personal_lesen')return requirePersonalPoolModule('lesen');
          if(action==='personal_horen')return requirePersonalPoolModule('horen');
          return isPaidPlan();
        }
        if(getAiCreditsRemaining()>=cost)return true;
        showAiCreditsExhausted();
        return false;
      }
      requireAiCreditsFn=requireAiCredits;
      exhaustedWallActionsForPlanFn=exhaustedWallActionsForPlan;
      canUsePersonalPoolModuleFn=canUsePersonalPoolModule;
      requirePersonalPoolModuleFn=requirePersonalPoolModule;
    })();`,
    sandbox,
  );
  sandbox.requireAiCredits = sandbox.requireAiCreditsFn;
  sandbox.exhaustedWallActionsForPlan = sandbox.exhaustedWallActionsForPlanFn;
  sandbox.canUsePersonalPoolModule = sandbox.canUsePersonalPoolModuleFn;
  sandbox.requirePersonalPoolModule = sandbox.requirePersonalPoolModuleFn;
  return sandbox;
}

// Test 1: Free user 0 credits — 6 credit actions block with credit-pack paywall
{
  const sb = buildQuotaSandbox({ plan: 'free', aiCreditsUsed: 6, aiCreditsRemaining: 0 });
  const wall = sb.exhaustedWallActionsForPlan('free');
  pass('Free exhausted wall offers packs + upgrade', wall.showPacks === true && wall.primary === 'upgrade_pro');

  const creditActionsFree = ['writing_correction', 'speaking', 'vocab_quiz', 'listening_game', 'vocab_phrases'];
  let allBlockedFree = true;
  let allSamePaywallFree = true;
  for (const a of creditActionsFree) {
    sb.paywallCalls = [];
    sb.upgradeCalls = [];
    const ok = sb.requireAiCredits(a);
    if (ok) allBlockedFree = false;
    const usedCreditPack = sb.paywallCalls.some((p) => p.type === 'creditPack');
    if (!usedCreditPack) allSamePaywallFree = false;
  }
  pass('Free 0 credits: 4 accessible credit actions blocked', allBlockedFree);
  pass('Free 0 credits: blocked actions use credit-pack paywall', allSamePaywallFree);

  const sbPro = buildQuotaSandbox({ plan: 'pro', aiCreditsUsed: 40, aiCreditsRemaining: 0, aiCreditsMax: 40, aiCreditsTotalPool: 40 });
  const creditActionsPro = [
    'personal_schreiben',
    'personal_sprechen_gen',
    'speaking_realtime',
    'writing_correction',
    'speaking',
    'vocab_quiz',
    'listening_game',
  ];
  let allBlockedPro = true;
  let allSamePaywallPro = true;
  for (const a of creditActionsPro) {
    sbPro.paywallCalls = [];
    const ok = sbPro.requireAiCredits(a);
    if (ok) allBlockedPro = false;
    if (!sbPro.paywallCalls.some((p) => p.type === 'creditPack')) allSamePaywallPro = false;
  }
  pass('Pro 0 credits: all 7 credit-cost actions blocked', allBlockedPro);
  pass('Pro 0 credits: blocked actions use credit-pack paywall', allSamePaywallPro);
}

// Test 2: Free user Lesen pool quota 8/8 exhausted
{
  const sb = buildQuotaSandbox({
    plan: 'free',
    personalLesenUsed: 8,
    personalHorenUsed: 0,
    aiCreditsRemaining: 6,
  });
  sb.paywallCalls = [];
  const okLesen = sb.requirePersonalPoolModule('lesen');
  pass('Lesen 8/8 blocks', okLesen === false);
  pass('Lesen 8/8 shows personal-pool paywall', sb.paywallCalls.some((p) => p.type === 'personalPool' && p.mod === 'lesen'));
  pass('Lesen 8/8 no credit-pack paywall', !sb.paywallCalls.some((p) => p.type === 'creditPack'));

  sb.paywallCalls = [];
  const okHoren = sb.canUsePersonalPoolModule('horen');
  pass('Hören still available at 0/8', okHoren === true);
  pass('Hören 0/8 not blocked', sb.requirePersonalPoolModule('horen') === true);

  sb.S.personalHorenUsed = 8;
  sb.paywallCalls = [];
  pass('Hören 8/8 blocks', sb.requirePersonalPoolModule('horen') === false);
  pass('Hören 8/8 shows upgrade-only personal pool paywall', sb.paywallCalls.some((p) => p.type === 'personalPool'));
}

// Server-side personal pool check mirror
{
  const month = getMonthKey();
  const plan = 'free';
  const max = PersonalPoolQuota.maxFor(plan, 'lesen');
  const rec = applyMonthlyAiReset({ month, personalLesenUsed: 8 }, aiMaxForPlan(plan), month);
  const used = PersonalPoolQuota.usedFromRecord(rec, 'lesen');
  pass('server mirror: at 8/8 cannot use', used >= max && !PersonalPoolQuota.canUse(plan, 'lesen', rec));
}

console.log(process.exitCode ? '\nSome tests FAILED' : '\nAll personal-pool-quota-paywall tests passed');
