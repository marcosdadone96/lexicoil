'use strict';

/** Stripe subscription statuses that revoke Pro access. */
const PRO_REVOKE_STATUSES = new Set(['unpaid', 'canceled', 'incomplete_expired']);

/** Grace period — warn user but keep Pro while Stripe retries. */
const PRO_GRACE_STATUSES = new Set(['past_due']);

const PRO_ACTIVE_STATUSES = new Set(['active', 'trialing']);

function shouldRevokePro(status) {
  return PRO_REVOKE_STATUSES.has(String(status || '').toLowerCase());
}

function shouldMarkPaymentWarning(status) {
  const s = String(status || '').toLowerCase();
  return PRO_GRACE_STATUSES.has(s);
}

function isProActiveStatus(status) {
  return PRO_ACTIVE_STATUSES.has(String(status || '').toLowerCase());
}

function extractStripeEmail(obj) {
  if (!obj) return null;
  return (
    obj.metadata?.email ||
    obj.customer_email ||
    obj.client_reference_id ||
    (typeof obj.customer === 'object' ? obj.customer?.email : null) ||
    null
  );
}

module.exports = {
  PRO_REVOKE_STATUSES,
  PRO_GRACE_STATUSES,
  PRO_ACTIVE_STATUSES,
  shouldRevokePro,
  shouldMarkPaymentWarning,
  isProActiveStatus,
  extractStripeEmail,
};
