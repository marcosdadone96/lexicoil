'use strict';

const { getStoreForEvent } = require('./blobStore.js');
const { userKey, signAuthToken, normalizeEmail, getTokenVersion } = require('./authLib.js');
const { authSessionResponse, jsonResponse } = require('./http.js');
const { resolvePlan, maxForPlan, getMonthKey } = require('./quotaLib.js');
const {
  parseFreeComboFromBody,
  parseFreeComboFromMeta,
  ensureUserFreeCombo,
  freeComboForResponse,
} = require('./freeComboLib.js');
const { mergeSupabasePlanIntoBlob } = require('./planSync.js');
const sb = require('./supabaseAdmin.js');
const { fetchSupabaseUser, readSupabaseEnv } = require('./supabaseAuthRest.js');

function applySupabaseProfileToUser(user, profile, fallbackName) {
  if (!profile?.plan) return user;
  const sbPlan = profile.plan === 'pro' ? 'pro' : 'free';
  return {
    ...user,
    name: user.name || fallbackName,
    plan: sbPlan,
    pro: sbPlan === 'pro',
    supabaseId: profile.id || user.supabaseId,
    proActivatedAt:
      user.proActivatedAt ||
      (profile.plan_activated_at ? new Date(profile.plan_activated_at).getTime() : Date.now()),
  };
}

/**
 * Exchange a Supabase access token for an app session (HttpOnly cookie + user payload).
 * @returns {Promise<{ statusCode: number, headers: object, body?: string }>}
 */
async function completeSupabaseSession(event, cors, accessToken, body = {}) {
  const { supabaseUrl, supabaseAnonKey } = readSupabaseEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(503, cors, { error: 'supabase_not_configured' });
  }

  const token = String(accessToken || '').trim();
  if (!token) {
    return jsonResponse(400, cors, { error: 'missing_token' });
  }

  const { user: sbUser, error: userError } = await fetchSupabaseUser(supabaseUrl, supabaseAnonKey, token);
  if (userError || !sbUser?.email) {
    return jsonResponse(userError === 'supabase_unreachable' ? 503 : 401, cors, {
      error: userError || 'invalid_supabase_session',
    });
  }

  const email = normalizeEmail(sbUser.email);
  if (!email) {
    return jsonResponse(401, cors, { error: 'invalid_supabase_session' });
  }

  const meta = sbUser.user_metadata || {};
  const name = String(meta.full_name || meta.name || email.split('@')[0]).trim().slice(0, 80);

  let store = null;
  try {
    store = getStoreForEvent(event);
  } catch (err) {
    console.warn('completeSupabaseSession: blobs unavailable:', err.message);
  }

  const key = userKey(email);
  let user = null;
  if (store) {
    try {
      user = await store.get(key, { type: 'json' });
    } catch (_) {
      user = null;
    }
  }

  const comboFromBody = parseFreeComboFromBody(body);
  const comboFromMeta = parseFreeComboFromMeta(meta);

  if (!user) {
    user = ensureUserFreeCombo({
      name,
      email,
      plan: 'free',
      pro: false,
      createdAt: Date.now(),
      supabaseId: sbUser.id,
      freeCombo: comboFromBody || comboFromMeta,
    });
  } else {
    user.name = user.name || name;
    user.supabaseId = sbUser.id;
    if (!user.createdAt) user.createdAt = Date.now();
    if (!user.pro && !user.freeCombo && (comboFromBody || comboFromMeta)) {
      user.freeCombo = comboFromBody || comboFromMeta;
    }
    user = ensureUserFreeCombo(user);
  }

  if (sb.isConfigured()) {
    let profile = (await sb.getUserProfile(sbUser.id)) || (await sb.getUserProfileByEmail(email));
    if (!profile) {
      await sb.upsertUserProfile(sbUser.id, email, { plan: resolvePlan(user) });
      profile = await sb.getUserProfile(sbUser.id);
    }
    if (profile) {
      if (store) {
        user = (await mergeSupabasePlanIntoBlob(store, email, profile, name)) || user;
      } else {
        user = applySupabaseProfileToUser(user, profile, name);
      }
    }
  }

  if (store) {
    try {
      await store.setJSON(key, user);
    } catch (err) {
      console.warn('completeSupabaseSession: blob write failed:', err.message);
    }
  }

  const session = signAuthToken(email, user.name, getTokenVersion(user), sbUser.id);
  if (!session?.token) {
    return jsonResponse(503, cors, { error: 'auth_not_configured' });
  }

  const plan = resolvePlan(user);
  const max = maxForPlan(plan);
  const month = getMonthKey();
  let used = 0;
  if (store) {
    try {
      const q = await store.get(`quota:${email}`, { type: 'json' });
      if (q && q.month === month) used = Number(q.used) || 0;
    } catch (_) {
      /* fresh */
    }
  }

  return authSessionResponse(
    200,
    cors,
    {
      expiresAt: session.expiresAt,
      user: {
        name: user.name,
        email,
        plan,
        pro: plan === 'pro',
        memberSince: user.createdAt || null,
        quota: { used, max, month },
        freeCombo: freeComboForResponse(user),
        isAdmin: sb.isConfigured()
          ? !!(await sb.isAdminByEmail(email)) || !!(await sb.isAdmin(sbUser.id))
          : false,
      },
    },
    session.token,
    event,
  );
}

module.exports = { completeSupabaseSession };
