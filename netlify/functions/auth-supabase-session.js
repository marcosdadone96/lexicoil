'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { userKey, signAuthToken, normalizeEmail, getJwtSecret, getTokenVersion } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, authSessionResponse, jsonResponse } = require('./lib/http.js');
const { resolvePlan, maxForPlan, getMonthKey } = require('./lib/quotaLib.js');
const {
  parseFreeComboFromBody,
  parseFreeComboFromMeta,
  ensureUserFreeCombo,
  freeComboForResponse,
} = require('./lib/freeComboLib.js');
const { mergeSupabasePlanIntoBlob } = require('./lib/planSync.js');
const sb = require('./lib/supabaseAdmin.js');

function trimEnv(v) {
  return String(v || '').trim();
}

exports.handler = async function handler(event) {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  try {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }
  if (!getJwtSecret()) {
    return jsonResponse(503, cors, { error: 'auth_not_configured' });
  }

  const supabaseUrl = trimEnv(process.env.SUPABASE_URL);
  const supabaseAnonKey = trimEnv(process.env.SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(503, cors, { error: 'supabase_not_configured' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const accessToken = trimEnv(body.access_token);
  if (!accessToken) {
    return jsonResponse(400, cors, { error: 'missing_token' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user?.email) {
    return jsonResponse(401, cors, { error: 'invalid_supabase_session' });
  }

  const sbUser = userData.user;
  const email = normalizeEmail(sbUser.email);
  if (!email) {
    return jsonResponse(401, cors, { error: 'invalid_supabase_session' });
  }

  const meta = sbUser.user_metadata || {};
  const name = String(meta.full_name || meta.name || email.split('@')[0]).trim().slice(0, 80);

  const store = getStoreForEvent(event);
  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
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
    let profile = await sb.getUserProfile(sbUser.id) || await sb.getUserProfileByEmail(email);
    if (!profile) {
      await sb.upsertUserProfile(sbUser.id, email, { plan: resolvePlan(user) });
      profile = await sb.getUserProfile(sbUser.id);
    }
    if (profile) {
      user = (await mergeSupabasePlanIntoBlob(store, email, profile, name)) || user;
    }
  }

  await store.setJSON(key, user);

  const session = signAuthToken(email, user.name, getTokenVersion(user));
  const plan = resolvePlan(user);
  const max = maxForPlan(plan);
  const month = getMonthKey();
  let used = 0;
  try {
    const q = await store.get(`quota:${email}`, { type: 'json' });
    if (q && q.month === month) used = Number(q.used) || 0;
  } catch (_) {
    /* fresh */
  }

  return authSessionResponse(200, cors, {
    expiresAt: session.expiresAt,
    user: {
      name: user.name,
      email,
      plan,
      pro: plan === 'pro',
      memberSince: user.createdAt || null,
      quota: { used, max, month },
      freeCombo: freeComboForResponse(user),
    },
  }, session.token, event);
  } catch (err) {
    console.error('auth-supabase-session:', err);
    return jsonResponse(500, cors, { error: 'internal_error' });
  }
};
