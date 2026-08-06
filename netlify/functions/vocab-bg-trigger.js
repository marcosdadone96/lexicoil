'use strict';

/**
 * vocab-bg-trigger — evaluate + fire-and-forget background generation.
 */
const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth, userKey } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { resolvePlan, getMonthKey } = require('./lib/quotaLib.js');
const { aiMaxForPlan } = require('./lib/freeTrialLib.js');
const { markBgGenStarted } = require('./lib/vocabBgQuota.js');
const VocabBgState = require('./lib/vocabBgState.js');
const { syncVocabBgSweepQueue } = require('./lib/vocabBgSweepQueue.js');

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

function baseUrl(event) {
  const env = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  if (env) return env.replace(/\/$/, '');
  const host = event.headers?.host || event.headers?.Host;
  return host ? `https://${host}` : '';
}

async function invokeBackground(event, payload) {
  const url = `${baseUrl(event)}/.netlify/functions/vocab-bg-generate-background`;
  const secret = internalSecret();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vocab-bg-secret': secret,
      },
      body: JSON.stringify(payload),
    });
    return { status: res.status, ok: res.ok };
  } catch (err) {
    console.warn('[vocab-bg-trigger] background invoke failed:', err.message);
    return { status: 0, ok: false, error: err.message };
  }
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return jsonResponse(405, cors, { error: 'method_not_allowed' });

  if (!verifyInternal(event)) {
    return jsonResponse(401, cors, { error: 'unauthorized' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return jsonResponse(400, cors, { error: 'missing_email' });

  const store = getStoreForEvent(event);
  if (!store) return jsonResponse(503, cors, { error: 'store_unavailable' });

  const qKey = `quota:${email}`;
  let quotaRec;
  try {
    quotaRec = await store.get(qKey, { type: 'json' });
  } catch {
    quotaRec = null;
  }

  const user = await store.get(userKey(email), { type: 'json' }).catch(() => null);
  const plan = resolvePlan(user);
  const month = getMonthKey();
  const aiMax = aiMaxForPlan(plan, user, month);
  const rec = { ...(quotaRec || {}), month: quotaRec?.month || month };
  const elig = VocabBgState.evaluateBgEligibility(
    { ...rec, ...VocabBgState.attachBgFields(rec) },
    plan,
  );

  if (!elig.eligible) {
    return jsonResponse(200, cors, { ok: true, triggered: false, reason: elig.reason, eligibility: elig });
  }

  const requestId = body.requestId || crypto.randomUUID();
  await markBgGenStarted(store, qKey, requestId, plan, month, aiMax);
  await syncVocabBgSweepQueue(store, email, { ...rec, bgGenPending: true }, { reason: 'triggered' });

  const pendingRaw = Array.isArray(rec.bgVocabPending) ? rec.bgVocabPending : [];
  const pending = VocabBgState.getEligiblePendingEntries({ bgVocabPending: pendingRaw });
  const level = VocabBgState.resolveBgLevelFromPending(pending, 'B1');
  const invoke = await invokeBackground(event, {
    email,
    requestId,
    plan,
    level,
    preferredModule: elig.module,
    pendingWords: pending,
    trigger: elig.trigger,
  });

  return jsonResponse(202, cors, {
    ok: true,
    triggered: true,
    requestId,
    invoke,
    eligibility: elig,
  });
};
