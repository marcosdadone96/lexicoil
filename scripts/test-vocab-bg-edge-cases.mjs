#!/usr/bin/env node
/**
 * Vocab bg edge-case tests — Cases 2, 6, 9 (+ stale fallback smoke).
 * Run: node scripts/test-vocab-bg-edge-cases.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VocabBgState = require(path.join(ROOT, 'netlify/functions/lib/vocabBgState.js'));
const PersonalPoolQuota = require(path.join(ROOT, 'js/library/personalPoolQuota.js'));

const OUT = path.join(ROOT, 'batches/ready/gate-logs/vocab-bg-edge-cases-2026-07-14.json');

let passed = 0;
let failed = 0;

function assert(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n── Case 2: article normalization (der Urlaub → lema urlaub) ──');
{
  const fc = { word: 'der Urlaub', sourceLang: 'de', sourceLevel: 'B1', savedAt: Date.now() };
  const normalized = VocabBgState.accumulateBgVocabFromSync([], [fc], { bgVocabPending: [], bgVocabIneligible: [] }, null);
  const p = normalized.bgVocabPending[0];
  assert('lemma stored without article', p && p.word.toLowerCase() === 'urlaub', `got ${p?.word}`);
  assert('fcKey is urlaub|de', p?.key === 'urlaub|de', p?.key);
  assert('counts toward pending (added=1)', normalized.added === 1, String(normalized.added));
  assert('bank-eligible (not in ineligible)', !(normalized.bgVocabIneligible || []).some((e) => e.word === 'urlaub'));

  let rec = { month: VocabBgState.getMonthKey(), lastBgGenAt: null, lastBgGenModule: 'horen' };
  const pipe = VocabBgState.processBgVocabSync({ prevCards: [], nextCards: [fc], rec, tombstones: [] });
  rec = pipe.state;
  assert('effective pending count ≥1 for threshold', VocabBgState.effectivePendingCount(rec) >= 1);
}

console.log('\n── Case 6: downgrade + Pro snapshot commit ──');
{
  const staleRec = {
    bgGenPending: true,
    bgGenStartedAt: Date.now() - 31 * 60 * 1000,
    bgGenStartedPlan: 'pro',
  };
  const cancel = VocabBgState.cancelBgGenOnDowngrade(staleRec);
  assert('stale in-flight job cancelled on downgrade', cancel.cancelled === true);
  assert('bgGenPending cleared', cancel.patch.bgGenPending === false);

  const youngRec = {
    bgGenPending: true,
    bgGenStartedAt: Date.now() - 5 * 60 * 1000,
    bgGenStartedPlan: 'pro',
  };
  const grace = VocabBgState.cancelBgGenOnDowngrade(youngRec);
  assert('young job keeps grace window', grace.cancelled === false && grace.graceRemainingMs > 0);

  const atFreeCap = {
    personalLesenUsed: 8,
    personalHorenUsed: 0,
    bgGenPending: true,
    bgGenStartedPlan: null,
    lastBgGenModule: 'horen',
  };
  const freeMax = PersonalPoolQuota.maxFor('free', 'lesen');
  const used = PersonalPoolQuota.usedFromRecord(atFreeCap, 'lesen');
  assert('free at cap blocks commit without snapshot', used >= freeMax);

  const proSnapshot = { ...atFreeCap, bgGenStartedPlan: 'pro' };
  const proMax = PersonalPoolQuota.maxFor('pro', 'lesen');
  const proUsed = PersonalPoolQuota.usedFromRecord(proSnapshot, 'lesen');
  assert('Pro snapshot allows commit at same usage', proUsed < proMax);

  const orphanPatch = VocabBgState.markBgGenFailed(atFreeCap, 'personal_pool_quota_exceeded');
  assert('quota fail clears bgGenPending (no orphan)', orphanPatch.bgGenPending === false);
}

console.log('\n── Case 9: retry cap + quarantine (infinite spend guard) ──');
{
  let rec = {
    month: VocabBgState.getMonthKey(),
    lastBgGenAt: null,
    lastBgGenModule: 'horen',
    bgVocabPending: [
      {
        key: 'fitness|de',
        word: 'fitness',
        lang: 'de',
        level: 'B1',
        savedAt: Date.now(),
        queuedAt: Date.now(),
        attemptCount: 0,
      },
    ],
  };
  const reason = 'POOL-2: 3 blocking';
  const keys = new Set(['fitness|de']);

  for (let i = 1; i <= 3; i++) {
    const patch = VocabBgState.recordBgGenFailure(rec, { reason, attemptedKeys: keys });
    rec = { ...rec, ...patch };
    if (i < 3) {
      assert(`attempt ${i}: still in pending (backoff)`, (rec.bgVocabPending || []).length === 1);
      assert(`attempt ${i}: not eligible while in backoff`, VocabBgState.effectivePendingCount(rec) === 0);
    }
  }

  assert('after 3 same-reason fails → quarantined', (rec.bgVocabQuarantine || []).length === 1);
  assert('pending cleared for exhausted word', (rec.bgVocabPending || []).length === 0);
  assert('bgGenPending cleared on fail', rec.bgGenPending === false);

  const elig = VocabBgState.evaluateBgEligibility(rec, 'pro');
  assert('no further bg eligibility', !elig.eligible && elig.reason === 'pending_insufficient');

  rec.bgVocabPending = [
    {
      key: 'fitness|de',
      word: 'fitness',
      lang: 'de',
      attemptCount: 0,
      queuedAt: Date.now() - 31 * 86400 * 1000,
      savedAt: Date.now() - 31 * 86400 * 1000,
    },
  ];
  rec.lastBgGenAt = null;
  const staleElig = VocabBgState.evaluateBgEligibility(rec, 'pro');
  assert('Case 1 stale fallback fires for 1 old word', staleElig.eligible && staleElig.trigger === 'stale');
}

console.log('\n── Case 5: prune on delete/tombstone ──');
{
  const live = [{ word: 'urlaub', sourceLang: 'de', savedAt: Date.now() }];
  const rec = {
    bgVocabPending: [
      { key: 'urlaub|de', word: 'urlaub', lang: 'de' },
      { key: 'fitness|de', word: 'fitness', lang: 'de' },
    ],
  };
  const tombstones = [{ key: 'fitness|de', deletedAt: Date.now() }];
  const pr = VocabBgState.pruneBgVocabPending(rec, live, tombstones);
  assert('removed tombstoned fitness', pr.removed.some((r) => r.skippedReason === 'user_removed'));
  assert('kept live urlaub', pr.patch.bgVocabPending.some((p) => p.key === 'urlaub|de'));
}

console.log('\n── Case 10: bulk import defer + FIFO cap ──');
{
  const bank = [...VocabBgState.loadVocabBankLemmaSet('de', 'B1')].slice(0, 25);
  const words = bank.map((w, i) => ({
    word: w,
    sourceLang: 'de',
    sourceLevel: 'B1',
    savedAt: Date.now() + i,
  }));
  const pipe = VocabBgState.processBgVocabSync({
    prevCards: [],
    nextCards: words,
    rec: { bgVocabPending: [], bgVocabIneligible: [] },
    tombstones: [],
  });
  assert('bulk >20 defers immediate trigger', pipe.bulkDeferTrigger === true && pipe.added > 20);
}

console.log('\n── Case 8: mutex bgGenPending ──');
{
  const busy = {
    bgGenPending: true,
    bgGenStartedAt: Date.now(),
    bgVocabPending: [{ key: 'a|de', word: 'a', queuedAt: Date.now(), savedAt: Date.now() }],
    lastBgGenAt: Date.now() - 86400000,
  };
  const elig = VocabBgState.evaluateBgEligibility(busy, 'pro');
  assert('blocked while bgGenPending', !elig.eligible && elig.reason === 'bg_gen_in_progress');
}

const summary = {
  generatedAt: new Date().toISOString(),
  passed,
  failed,
  ok: failed === 0,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
