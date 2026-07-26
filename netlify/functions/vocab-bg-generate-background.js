'use strict';
/**
 * vocab-bg-generate-background â€” Netlify Background Function (up to 15 min).
 */
const crypto = require('crypto');
const path = require('path');
const { getStore } = require('@netlify/blobs');
const { userKey } = require('./lib/authLib.js');
const { STORE_NAME } = require('./lib/blobStore.js');
const { resolvePlan, getMonthKey } = require('./lib/quotaLib.js');
const { aiMaxForPlan } = require('./lib/freeTrialLib.js');
const { commitBgGenSuccess, markBgGenFailed } = require('./lib/vocabBgQuota.js');
const VocabBgState = require('./lib/vocabBgState.js');
function internalSecret() {
  return String(process.env.VOCAB_BG_INTERNAL_SECRET || process.env.AUTH_JWT_SECRET || '').trim();
}
function verifyInternal(event) {
  const hdr = event.headers?.['x-vocab-bg-secret'] || event.headers?.['X-Vocab-Bg-Secret'] || '';
  const secret = internalSecret();
  if (!secret) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(String(hdr)), Buffer.from(secret));
  } catch {
    return String(hdr) === secret;
  }
}
function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw);
}
exports.handler = async (event) => {
  if (!verifyInternal(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }
  let body;
  try {
    body = parseBody(event);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }
  const email = String(body.email || '').trim().toLowerCase();
  const requestId = String(body.requestId || '');
  if (!email || !requestId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_fields' }) };
  }
  const store = getStore(STORE_NAME);
  const qKey = `quota:${email}`;
  const user = await store.get(userKey(email), { type: 'json' }).catch(() => null);
  const plan = body.plan || resolvePlan(user);
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(plan, user, month);
  const pendingWords = VocabBgState.getEligiblePendingEntries({
    bgVocabPending: body.pendingWords || [],
  });
  const level = String(
    body.level || VocabBgState.resolveBgLevelFromPending(pendingWords, 'B1'),
  ).trim().toUpperCase();
  const lang = String(body.lang || 'de').trim().toLowerCase();
  let planResult = null;
  try {
    const runnerPath = path.join(__dirname, '..', 'scripts', 'lib', 'vocabBgRunner.mjs');
    const { runVocabBgGeneration } = await import(`file://${runnerPath.replace(/\\/g, '/')}`);
    const result = await runVocabBgGeneration({
      store,
      pendingWords,
      preferredModule: body.preferredModule,
      requestId,
      lang,
      level,
    });
    planResult = result.plan;
    if (!result.ok) {
      const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(result.plan, pendingWords);
      await markBgGenFailed(store, qKey, result.reason || 'failed', month, aiMax, { attemptedKeys });
      return {
        statusCode: result.queued ? 202 : 422,
        body: JSON.stringify({ ok: false, ...result }),
      };
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
      const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(planResult, pendingWords);
      await markBgGenFailed(store, qKey, commit.error || 'commit_failed', month, aiMax, {
        attemptedKeys,
      });
      return {
        statusCode: 422,
        body: JSON.stringify({ ok: false, commit, orphaned: commit.orphaned === true }),
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, result, commit }),
    };
  } catch (err) {
    console.error('[vocab-bg-background] fatal:', err);
    const attemptedKeys = VocabBgState.buildAttemptedKeysFromPlan(planResult, pendingWords);
    await markBgGenFailed(store, qKey, err.message, month, aiMax, { attemptedKeys });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
