'use strict';

/**
 * vocab-bg-sweep — scheduled safety net (every 30 min) + publish queue drain + bg event queue.
 */
const crypto = require('crypto');
const path = require('path');
const { getStore } = require('@netlify/blobs');
const { STORE_NAME } = require('./lib/blobStore.js');
const { userKey } = require('./lib/authLib.js');
const { resolvePlan, getMonthKey } = require('./lib/quotaLib.js');
const { aiMaxForPlan } = require('./lib/freeTrialLib.js');
const VocabBgState = require('./lib/vocabBgState.js');
const { markBgGenStarted, commitBgGenSuccess, markBgGenFailed } = require('./lib/vocabBgQuota.js');
const {
  peekVocabBgSweepBatch,
  syncVocabBgSweepQueue,
  recordNeedsSweep,
  listVocabBgSweepQueue,
} = require('./lib/vocabBgSweepQueue.js');

async function processPendingUser(store, qKey) {
  const email = qKey.replace(/^quota:/, '');
  let rec;
  try {
    rec = await store.get(qKey, { type: 'json' });
  } catch {
    return { email, skipped: true };
  }
  if (!rec) return { email, skipped: true };

  const user = await store.get(userKey(email), { type: 'json' }).catch(() => null);
  const plan = resolvePlan(user);
  const merged = { ...rec, ...VocabBgState.attachBgFields(rec) };
  const elig = VocabBgState.evaluateBgEligibility(merged, plan);
  if (!elig.eligible) {
    await syncVocabBgSweepQueue(store, email, merged);
    return { email, skipped: true, reason: elig.reason };
  }

  const requestId = crypto.randomUUID();
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(plan, user, month);
  await markBgGenStarted(store, qKey, requestId, plan, month, aiMax);
  await syncVocabBgSweepQueue(store, email, { ...merged, bgGenPending: true }, { reason: 'in_progress' });

  const runnerPath = path.join(__dirname, '..', 'scripts', 'lib', 'vocabBgRunner.mjs');
  const { runVocabBgGeneration } = await import(`file://${runnerPath.replace(/\\/g, '/')}`);

  const result = await runVocabBgGeneration({
    store,
    pendingWords: VocabBgState.getEligiblePendingEntries(merged),
    preferredModule: elig.module,
    requestId,
  });

  if (!result.ok) {
    const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(result.plan, merged.bgVocabPending || []);
    await markBgGenFailed(store, qKey, result.reason, month, aiMax, { attemptedKeys });
    const after = await store.get(qKey, { type: 'json' }).catch(() => null);
    await syncVocabBgSweepQueue(store, email, after || merged, { reason: 'failed' });
    return { email, ok: false, reason: result.reason };
  }

  const commit = await commitBgGenSuccess(store, qKey, {
    requestId,
    module: result.module,
    usedWords: result.userAnchor || result.words,
    plan,
    month,
    aiMax,
  });

  if (!commit?.ok) {
    const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(result.plan, merged.bgVocabPending || []);
    await markBgGenFailed(store, qKey, commit.error || 'commit_failed', month, aiMax, { attemptedKeys });
    const after = await store.get(qKey, { type: 'json' }).catch(() => null);
    await syncVocabBgSweepQueue(store, email, after || merged, { reason: 'commit_failed' });
    return { email, ok: false, reason: commit.error };
  }

  const after = await store.get(qKey, { type: 'json' }).catch(() => null);
  await syncVocabBgSweepQueue(store, email, after || merged);
  return { email, ok: true, poolId: result.poolId };
}

exports.handler = async () => {
  const store = getStore(STORE_NAME);
  const stats = {
    scanned: 0,
    processed: 0,
    ok: 0,
    fail: 0,
    queueDrained: 0,
    queueDeadLettered: 0,
    queueRemaining: 0,
    sweepQueueSize: 0,
    sweepCandidates: 0,
  };

  try {
    const queuePath = path.join(__dirname, '..', 'scripts', 'lib', 'poolPublishQueue.mjs');
    const { drainQueuedPoolPublishes } = await import(`file://${queuePath.replace(/\\/g, '/')}`);
    const drained = await drainQueuedPoolPublishes(store, 'de', 'B1');
    stats.queueDrained = drained.processed;
    stats.queueDeadLettered = drained.deadLettered || 0;
    stats.queueRemaining = drained.remaining || 0;
    if (drained.deadLettered > 0) {
      console.error(
        `[vocab-bg-sweep] pool_publish_queue dead-lettered=${drained.deadLettered} remaining=${drained.remaining}`,
      );
    }
  } catch (err) {
    console.error('[vocab-bg-sweep] queue drain FAILED:', err.message);
  }

  const queueEntries = await listVocabBgSweepQueue(store);
  stats.sweepQueueSize = queueEntries.length;
  const emails = await peekVocabBgSweepBatch(store, { limit: 50 });
  stats.sweepCandidates = emails.length;

  for (const email of emails) {
    stats.scanned++;
    const qKey = `quota:${email}`;
    const rec = await store.get(qKey, { type: 'json' }).catch(() => null);
    if (!recordNeedsSweep(rec)) {
      await syncVocabBgSweepQueue(store, email, rec);
      continue;
    }
    try {
      const row = await processPendingUser(store, qKey);
      if (!row.skipped) {
        stats.processed++;
        if (row.ok) stats.ok++;
        else stats.fail++;
      }
    } catch (err) {
      stats.fail++;
      console.error('[vocab-bg-sweep] user error:', qKey, err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, stats }),
  };
};
