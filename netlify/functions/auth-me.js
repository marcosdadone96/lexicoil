'use strict';



const { getStoreForEvent } = require('./lib/blobStore.js');

const { getJwtSecret, verifyAuthToken, userKey } = require('./lib/authLib.js');

const { resolvePlan, maxForPlan, getMonthKey } = require('./lib/quotaLib.js');
const { getAiCredits } = require('./lib/aiCredits.js');
const { ensureUserFreeCombo, freeComboForResponse } = require('./lib/freeComboLib.js');
const { mergeSupabasePlanIntoBlob, loadBlobUser } = require('./lib/planSync.js');
const sb = require('./lib/supabaseAdmin.js');

const { corsHeaders, getBearer, jsonResponse } = require('./lib/http.js');



exports.handler = async (event) => {

  const cors = corsHeaders(event, 'GET, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  if (event.httpMethod !== 'GET') {

    return jsonResponse(405, cors, { error: 'method_not_allowed' });

  }

  if (!getJwtSecret()) {

    return jsonResponse(503, cors, { error: 'auth_not_configured', enabled: false });

  }



  const auth = verifyAuthToken(getBearer(event));

  if (!auth.ok) {

    return jsonResponse(401, cors, { error: auth.error || 'unauthorized' });

  }



  const store = getStoreForEvent(event);

  let user = await loadBlobUser(store, auth.email);

  if (!user && sb.isConfigured()) {
    const profile = await sb.getUserProfile(auth.userId) || await sb.getUserProfileByEmail(auth.email);
    if (profile) {
      user = await mergeSupabasePlanIntoBlob(store, auth.email, profile, auth.payload?.name);
    }
  }

  if (!user) {
    return jsonResponse(401, cors, { error: 'unauthorized' });
  }

  if (sb.isConfigured()) {
    const profile = await sb.getUserProfile(auth.userId) || await sb.getUserProfileByEmail(auth.email);
    if (profile) {
      user = (await mergeSupabasePlanIntoBlob(store, auth.email, profile, user.name)) || user;
    }
  }

  if (user.tokenVersion != null && auth.payload.tv !== user.tokenVersion) {
    return jsonResponse(401, cors, { error: 'token_revoked' });
  }

  if (!user.createdAt) {
    user.createdAt = Date.now();
    try {
      await store.setJSON(userKey(auth.email), user);
    } catch (_) {
      /* non-fatal */
    }
  }

  const plan = resolvePlan(user);
  const max = maxForPlan(plan);
  let used = 0;
  const month = getMonthKey();

  try {
    const q = await store.get(`quota:${auth.email}`, { type: 'json' });
    if (q && q.month === month) {
      used = Math.min(Number(q.used) || 0, max);
    }
  } catch (_) {
    /* fresh */
  }

  const aiSnap = await getAiCredits(event);

  const beforeCombo = user.freeCombo ? JSON.stringify(user.freeCombo) : '';
  user = ensureUserFreeCombo(user);
  if (plan !== 'pro' && JSON.stringify(user.freeCombo || {}) !== beforeCombo) {
    await store.setJSON(userKey(auth.email), user);
  }

  // UI-only signal — create/mutate admin APIs still re-check lc_admin_roles server-side.
  let isAdmin = false;
  if (sb.isConfigured()) {
    try {
      isAdmin = !!(await sb.isAdminByEmail(auth.email)) || !!(await sb.isAdmin(auth.userId));
    } catch (_) {
      isAdmin = false;
    }
  }

  return jsonResponse(200, cors, {
    enabled: true,
    user: {
      name: user.name,
      email: auth.email,
      avatar: (user.name || auth.email || '?')[0].toUpperCase(),
      plan,
      pro: plan === 'pro' || plan === 'pro_max',
      isAdmin,
      quota: { used, max, month },
      aiCredits: {
        used: aiSnap.used,
        max: aiSnap.max,
        remaining: aiSnap.remaining,
        totalPool: aiSnap.totalPool,
        rollover: aiSnap.rollover,
        creditTopups: aiSnap.creditTopups,
        overdraft: aiSnap.overdraft,
        month: aiSnap.month,
        autoRecharge: aiSnap.autoRecharge,
        trialActive: !!aiSnap.trialActive,
        trialMax: aiSnap.trialMax || 0,
        personalLesenUsed: aiSnap.personalLesenUsed ?? 0,
        personalHorenUsed: aiSnap.personalHorenUsed ?? 0,
        personalLesenMax: aiSnap.personalLesenMax ?? 0,
        personalHorenMax: aiSnap.personalHorenMax ?? 0,
      },
      proActivatedAt: user.proActivatedAt || null,
      memberSince: user.createdAt || null,
      hasBillingAccount: !!user.stripeCustomerId,
      billingSource: user.billingSource || (user.stripeCustomerId ? 'stripe' : null),
      freeCombo: freeComboForResponse(user),
    },
  });

};

