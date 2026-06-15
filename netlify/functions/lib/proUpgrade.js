'use strict';

const { userKey, normalizeEmail } = require('./authLib.js');
const { getMonthKey, PRO_MAX } = require('./quotaLib.js');
const { sendProWelcomeEmail } = require('./email.js');
const { syncPlanToSupabase } = require('./planSync.js');

async function activateProForEmail(store, rawEmail, { sendEmail = true, stripeCustomerId = null } = {}) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };

  const key = userKey(email);
  let user = null;
  try {
    user = await store.get(key, { type: 'json' });
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { ok: false, error: 'user_not_found', email };
  }

  const updatedUser = {
    ...user,
    plan: 'pro',
    pro: true,
    proActivatedAt: Date.now(),
  };
  if (stripeCustomerId) updatedUser.stripeCustomerId = stripeCustomerId;
  await store.setJSON(key, updatedUser);

  const month = getMonthKey();
  await store.setJSON(`quota:${email}`, { used: 0, month, max: PRO_MAX });

  await syncPlanToSupabase(email, 'pro', updatedUser);

  if (sendEmail) {
    try {
      await sendProWelcomeEmail(email, updatedUser.name || email.split('@')[0]);
    } catch (err) {
      console.error('[proUpgrade] welcome email failed:', err.message);
    }
  }

  return {
    ok: true,
    email,
    user: updatedUser,
    quota: { used: 0, max: PRO_MAX, month },
  };
}

module.exports = { activateProForEmail };
