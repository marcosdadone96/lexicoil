'use strict';

const { userKey, normalizeEmail } = require('./authLib.js');
const { getMonthKey, PRO_MAX, resolvePlan } = require('./quotaLib.js');

async function loadBlobUser(store, email) {
  try {
    return await store.get(userKey(email), { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function syncPlanToBlob(store, rawEmail, plan) {
  const email = normalizeEmail(rawEmail);
  if (!email || !['free', 'pro', 'guest'].includes(plan)) return null;

  const normalizedPlan = plan === 'guest' ? 'free' : plan;
  let user = await loadBlobUser(store, email);

  if (!user) {
    user = {
      name: email.split('@')[0],
      email,
      plan: normalizedPlan,
      pro: normalizedPlan === 'pro',
      createdAt: Date.now(),
    };
  } else {
    user = { ...user, plan: normalizedPlan, pro: normalizedPlan === 'pro' };
    if (normalizedPlan === 'pro') {
      user.proActivatedAt = user.proActivatedAt || Date.now();
    } else {
      user.pro = false;
    }
  }

  await store.setJSON(userKey(email), user);

  if (normalizedPlan === 'pro') {
    const month = getMonthKey();
    await store.setJSON(`quota:${email}`, { used: 0, month, max: PRO_MAX });
  }

  return user;
}

/** Supabase lc_user_profiles.plan is authoritative when present. */
async function mergeSupabasePlanIntoBlob(store, email, supabaseProfile, fallbackName) {
  if (!supabaseProfile?.plan) return loadBlobUser(store, email);

  const sbPlan = supabaseProfile.plan === 'pro' ? 'pro' : 'free';
  let user = await loadBlobUser(store, email);

  if (!user) {
    user = {
      name: fallbackName || email.split('@')[0],
      email,
      plan: sbPlan,
      pro: sbPlan === 'pro',
      createdAt: supabaseProfile.created_at
        ? new Date(supabaseProfile.created_at).getTime()
        : Date.now(),
      supabaseId: supabaseProfile.id,
    };
    await store.setJSON(userKey(email), user);
    if (sbPlan === 'pro') {
      const month = getMonthKey();
      await store.setJSON(`quota:${email}`, { used: 0, month, max: PRO_MAX });
    }
    return user;
  }

  if (resolvePlan(user) === sbPlan) return user;

  user = {
    ...user,
    plan: sbPlan,
    pro: sbPlan === 'pro',
  };
  if (sbPlan === 'pro') {
    user.proActivatedAt =
      user.proActivatedAt ||
      (supabaseProfile.plan_activated_at
        ? new Date(supabaseProfile.plan_activated_at).getTime()
        : Date.now());
    const month = getMonthKey();
    await store.setJSON(`quota:${email}`, { used: 0, month, max: PRO_MAX });
  } else {
    user.pro = false;
  }

  await store.setJSON(userKey(email), user);
  return user;
}

async function syncPlanToSupabase(email, plan, existingUser) {
  const sb = require('./supabaseAdmin.js');
  if (!sb.isConfigured()) return;

  const normalizedPlan = plan === 'guest' ? 'free' : plan;
  let profile = await sb.getUserProfileByEmail(email);
  if (!profile) {
    const { emailToUserId } = require('./authLib.js');
    const userId = existingUser?.supabaseId || emailToUserId(email);
    profile = await sb.upsertUserProfile(userId, email, {
      plan: normalizedPlan,
      plan_activated_at: normalizedPlan === 'pro' ? new Date().toISOString() : null,
    });
    return;
  }
  await sb.setPlan(profile.id, normalizedPlan);
}

module.exports = {
  loadBlobUser,
  syncPlanToBlob,
  mergeSupabasePlanIntoBlob,
  syncPlanToSupabase,
};
