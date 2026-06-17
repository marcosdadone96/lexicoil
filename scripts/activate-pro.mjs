/**
 * Manually activate Pro for a user (support / missed webhook).
 *
 * Usage:
 *   ADMIN_SECRET=your_secret node scripts/activate-pro.mjs marcosdadra@gmail.com
 *
 * Set ADMIN_SECRET in Netlify env vars first.
 */

const email = process.argv[2];
const secret = process.env.ADMIN_SECRET;
const site = process.env.LEXICOIL_SITE_URL || 'https://lexicoil.com';

if (!email) {
  console.error('Usage: ADMIN_SECRET=... node scripts/activate-pro.mjs user@email.com');
  process.exit(1);
}
if (!secret) {
  console.error('Missing ADMIN_SECRET env var');
  process.exit(1);
}

const res = await fetch(`${site.replace(/\/$/, '')}/.netlify/functions/admin-activate-pro`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Failed:', data.error || res.status);
  process.exit(1);
}

console.log('Pro activated:', data);
