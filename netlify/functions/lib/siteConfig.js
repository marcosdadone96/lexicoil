'use strict';

/** Canonical production URL (no trailing slash). Override with LEXICOIL_SITE_URL in Netlify. */
const DEFAULT_SITE_URL = 'https://lexicoil.com';

const PRODUCTION_ORIGINS = [
  'https://www.lexicoil.com',
  'https://lexicoil.com',
];

const CONTACT_EMAIL = 'contact@lexicoil.com';

function cleanSiteUrl(raw) {
  let u = String(raw || '').trim();
  const mdParen = u.match(/\((https?:\/\/[^)]+)\)/);
  if (mdParen) u = mdParen[1];
  const mdBracket = u.match(/^\[(https?:\/\/[^\]]+)\]/);
  if (mdBracket) u = mdBracket[1];
  u = u.replace(/\/$/, '');
  if (!u || !/^https?:\/\//i.test(u)) return '';
  if (/tu-sitio|example\.com|your-?domain|placeholder|localhost/i.test(u)) return '';
  return u;
}

function getSiteUrl() {
  const fromEnv = cleanSiteUrl(
    process.env.LEXICOIL_SITE_URL || process.env.LEXILOOP_SITE_URL || '',
  );
  return fromEnv || DEFAULT_SITE_URL;
}

function getProductionOrigins() {
  return [...PRODUCTION_ORIGINS];
}

module.exports = {
  DEFAULT_SITE_URL,
  PRODUCTION_ORIGINS,
  CONTACT_EMAIL,
  getSiteUrl,
  getProductionOrigins,
};
