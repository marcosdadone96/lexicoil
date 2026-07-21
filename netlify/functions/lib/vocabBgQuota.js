'use strict';
/**
 * vocabBgQuota.js â€” CAS updates for bg state + personal pool quota on success.
 *
 * Downgrade policy (Case 6): bgGenStartedPlan is snapshotted at job start. If a job
 * began on Pro/Pro_max, commit uses that plan's pool limits so the user keeps content
 * they already paid for â€” even if downgrade happened while the job was running (<30 min).
 */
const { casWriteJson } = require('./casBlob.js');
const { applyMonthlyAiReset, buildQuotaPayload } = require('./aiQuotaState.js');
const { aiMaxForPlan } = require('./freeTrialLib.js');
const PersonalPoolQuota = require('../../../js/library/personalPoolQuota.js');
const VocabBgState = require('./vocabBgState.js');
const { syncVocabBgSweepQueue } = require('./vocabBgSweepQueue.js');
function personalPoolIdemKey(scopeKey, module, requestId) {
  return `personal_pool:${scopeKey}:${module}:${requestId}`;
}
function bgGenIdemKey(scopeKey, requestId) {
  return `vocab_bg_gen:${scopeKey}:${requestId}`;
}
async function readIdempotentResult(store, key) {
  try {
    return await store.get(key, { type: 'json' });
  } catch {
    return null;
  }
}
async function writeIdempotentResult(store, key, result) {
  const res = await store.setJSON(key, result, { onlyIfNew: true });
  if (res && res.modified === false) {
    const existing = await store.get(key, { type: 'json' });
    if (existing) return existing;
  }
  return result;
}
/**
 * Load quota + evaluate eligibility after vocab sync accumulation.
 */
async function processVocabSyncForBg(store, qKey, { prevCards, nextCards, plan, month, tombstones }) {
  return casWriteJson(
    store,
    qKey,
    (current) => {
      const aiMax = aiMaxForPlan(plan, null, month);
      const normalized = applyMonthlyAiReset(current, aiMax, month);
      const bgReset = VocabBgState.applyBgMonthReset(normalized, month);
      const rec = { ...normalized, ...bgReset, ...VocabBgState.attachBgFields(normalized) };
      const pipeline = VocabBgState.processBgVocabSync({
        prevCards,
        nextCards,
        rec,
        tombstones: tombstones || [],
      });
      const merged = pipeline.state;
      const elig = VocabBgState.evaluateBgEligibility(merged, plan);
      return {
        payload: buildQuotaPayload(
          {
            ...merged,
            ...VocabBgState.attachBgFields(merged),
          },
          true,
        ),
        result: {
          rec: merged,
          eligibility: elig,
          added: pipeline.added,
          bulkDeferTrigger: pipeline.bulkDeferTrigger,
          dropped: pipeline.dropped,
          pruneRemoved: pipeline.pruneRemoved,
        },
      };
    },
    { logTag: '[vocab-bg-sync]' },
  );
}
async function markBgGenStarted(store, qKey, requestId, plan, month, aiMax) {
  return casWriteJson(
    store,
    qKey,
    (current) => {
      const normalized = applyMonthlyAiReset(current, aiMax, month);
      const rec = { ...normalized, ...VocabBgState.attachBgFields(normalized) };
      const patch = VocabBgState.markBgGenPending(rec, requestId, plan);
      return {
        payload: buildQuotaPayload({ ...rec, ...patch }, true),
        result: { ok: true },
      };
    },
    { logTag: '[vocab-bg-start]' },
  );
}
async function commitBgGenSuccess(store, qKey, { requestId, module, usedWords, plan, month, aiMax }) {
  const idemKey = bgGenIdemKey(qKey, requestId);
  const prior = await readIdempotentResult(store, idemKey);
  if (prior) return prior;
  const poolIdem = personalPoolIdemKey(qKey, module, requestId);
  const result = await casWriteJson(
    store,
    qKey,
    (current) => {
      const normalized = applyMonthlyAiReset(current, aiMax, month);
      const rec = { ...normalized, ...VocabBgState.attachBgFields(normalized) };
      const mod = PersonalPoolQuota.normalizeModule(module) || 'lesen';
      const effectivePlan = rec.bgGenStartedPlan || plan;
      const max = PersonalPoolQuota.maxFor(effectivePlan, mod);
      const used = PersonalPoolQuota.usedFromRecord(rec, mod);
      if (used >= max) {
        const failPatch = VocabBgState.markBgGenFailed(rec, 'personal_pool_quota_exceeded');
        return {
          payload: buildQuotaPayload({ ...rec, ...failPatch }, true),
          result: { ok: false, error: 'personal_pool_quota_exceeded', module: mod, orphaned: true },
        };
      }
      const patch = VocabBgState.afterBgGenSuccessPatch(rec, { module: mod, requestId, usedWords });
      const payload = buildQuotaPayload({ ...rec, ...patch }, true);
      return {
        payload,
        result: {
          ok: true,
          module: mod,
          effectivePlan,
          personalLesenUsed: payload.personalLesenUsed,
          personalHorenUsed: payload.personalHorenUsed,
          bgGenCountMonth: patch.bgGenCountMonth,
        },
      };
    },
    { logTag: '[vocab-bg-commit]' },
  );
  if (result?.ok) {
    await writeIdempotentResult(store, idemKey, result);
    await writeIdempotentResult(store, poolIdem, result);
    const email = String(qKey).replace(/^quota:/, '');
    const after = await store.get(qKey, { type: 'json' }).catch(() => null);
    await syncVocabBgSweepQueue(store, email, after);
  }
  return result;
}
async function markBgGenFailed(store, qKey, error, month, aiMax, opts = {}) {
  const result = await casWriteJson(
    store,
    qKey,
    (current) => {
      const normalized = applyMonthlyAiReset(current, aiMax, month);
      const rec = { ...normalized, ...VocabBgState.attachBgFields(normalized) };
      let patch = VocabBgState.markBgGenFailed(rec, error);
      if (opts.attemptedKeys) {
        patch = {
          ...patch,
          ...VocabBgState.recordBgGenFailure(rec, {
            reason: error,
            attemptedKeys: opts.attemptedKeys,
          }),
        };
      }
      return {
        payload: buildQuotaPayload({ ...rec, ...patch }, true),
        result: { ok: false, error, quarantined: patch.quarantined || 0 },
      };
    },
    { logTag: '[vocab-bg-fail]' },
  );
  const email = String(qKey).replace(/^quota:/, '');
  const after = await store.get(qKey, { type: 'json' }).catch(() => null);
  await syncVocabBgSweepQueue(store, email, after, { reason: 'failed' });
  return result;
}
async function cancelBgGenOnDowngrade(store, email, month, aiMax) {
  const qKey = `quota:${email}`;
  return casWriteJson(
    store,
    qKey,
    (current) => {
      const normalized = applyMonthlyAiReset(current, aiMax, month);
      const rec = { ...normalized, ...VocabBgState.attachBgFields(normalized) };
      const { patch, cancelled } = VocabBgState.cancelBgGenOnDowngrade(rec);
      if (!cancelled) {
        return { skip: true, result: { ok: true, cancelled: false } };
      }
      return {
        payload: buildQuotaPayload({ ...rec, ...patch }, true),
        result: { ok: true, cancelled: true },
      };
    },
    { logTag: '[vocab-bg-downgrade-cancel]' },
  );
}
module.exports = {
  processVocabSyncForBg,
  markBgGenStarted,
  commitBgGenSuccess,
  markBgGenFailed,
  cancelBgGenOnDowngrade,
  bgGenIdemKey,
};
