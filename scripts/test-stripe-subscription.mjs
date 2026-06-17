#!/usr/bin/env node
/**
 * Stripe subscription status helpers — Pro revoke vs payment grace.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  shouldRevokePro,
  shouldMarkPaymentWarning,
  isProActiveStatus,
  PRO_REVOKE_STATUSES,
  PRO_GRACE_STATUSES,
} = require(path.join(ROOT, 'netlify/functions/lib/stripeSubscription.js'));

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) {
    console.log('  OK:', label);
    passed++;
  } else {
    console.error('FAIL:', label);
    failed++;
  }
}

console.log('\n[a] Revoke only on terminal subscription statuses');
for (const status of ['unpaid', 'canceled', 'incomplete_expired']) {
  check(`revoke ${status}`, shouldRevokePro(status));
}
check('no revoke past_due (grace)', !shouldRevokePro('past_due'));
check('no revoke active', !shouldRevokePro('active'));
check('no revoke trialing', !shouldRevokePro('trialing'));

console.log('\n[b] Payment warning on grace / retry window');
check('warn past_due', shouldMarkPaymentWarning('past_due'));
check('no warn active', !shouldMarkPaymentWarning('active'));

console.log('\n[c] Active clears warning flag eligibility');
check('active is pro-active', isProActiveStatus('active'));
check('trialing is pro-active', isProActiveStatus('trialing'));
check('past_due not pro-active status', !isProActiveStatus('past_due'));

console.log('\n[d] Status sets are disjoint for revoke vs grace');
for (const s of PRO_REVOKE_STATUSES) {
  check(`${s} not in grace set`, !PRO_GRACE_STATUSES.has(s));
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
