#!/usr/bin/env node
/**
 * Vocab bg E2E simulation (no Gemini) — state, eligibility, plan, quota caps.
 * Run: node scripts/test-vocab-bg-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { planVocabBgGeneration } from './lib/planVocabBgGeneration.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VocabBgState = require(path.join(ROOT, 'netlify/functions/lib/vocabBgState.js'));
const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));

const OUT = path.join(ROOT, 'batches/ready/gate-logs/vocab-bg-e2e-sim-2026-07-13.json');

function makeCards(n, baseTs) {
  const words = [
    'fitness', 'therapie', 'urlaub', 'umwelt', 'aktivität', 'alltag', 'ab', 'achten',
  ];
  return words.slice(0, n).map((w, i) => ({
    word: w,
    sourceLang: 'de',
    sourceLevel: 'B1',
    savedAt: baseTs + i * 1000,
  }));
}

const prev = [];
const next = makeCards(8, Date.now() - 60000);
let rec = {
  month: VocabBgState.getMonthKey(),
  personalLesenUsed: 0,
  personalHorenUsed: 0,
  bgGenCountMonth: 0,
  lastBgGenAt: null,
  lastBgGenModule: 'horen',
};

const acc = VocabBgState.accumulateBgVocabFromSync(prev, next, rec, rec.lastBgGenAt);
rec = { ...rec, ...acc };
rec.bgVocabPendingCount = VocabBgState.effectivePendingCount(rec);

const proElig = VocabBgState.evaluateBgEligibility(rec, 'pro');
const freeElig1 = VocabBgState.evaluateBgEligibility(rec, 'free');
rec.bgGenCountMonth = 2;
const freeEligCap = VocabBgState.evaluateBgEligibility(rec, 'free');

const plan = planVocabBgGeneration({
  pendingWords: rec.bgVocabPending,
  preferredModule: proElig.module,
});

const proMax = PersonalPoolQuota.maxFor('pro_max', 'lesen');
const freeMax = PersonalPoolQuota.maxFor('free', 'lesen');

const summary = {
  generatedAt: new Date().toISOString(),
  pendingCount: rec.bgVocabPendingCount,
  proEligible: proElig.eligible,
  proReason: proElig.reason,
  freeEligibleBeforeCap: freeElig1.eligible,
  freeBlockedAfterCap: !freeEligCap.eligible && freeEligCap.reason === 'free_bg_cap',
  plan: { module: plan.module, teil: plan.teil, topic: plan.topic, words: plan.words, userAnchor: plan.userAnchor },
  quotas: { proMaxLesen: proMax, freeMaxLesen: freeMax },
  ok:
    VocabBgState.effectivePendingCount(rec) === 8 &&
    proElig.eligible &&
    proElig.reason === 'batch_threshold' &&
    freeElig1.eligible &&
    freeEligCap.reason === 'free_bg_cap' &&
    plan.words.length >= 6 &&
    (plan.userAnchor?.length || 0) >= 2,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
