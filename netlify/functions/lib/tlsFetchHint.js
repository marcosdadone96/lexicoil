'use strict';

/** Mirror of scripts/lib/tlsFetchHint.mjs for Netlify Functions (CJS). */

const TLS_HINT_DE =
  'TLS/Antivirus blockiert Gemini. Stoppe netlify dev und starte neu mit: npm run dev';
const TLS_HINT_EN =
  'TLS/antivirus blocked Gemini. Stop netlify dev and restart with: npm run dev';

function isTlsLeafVerifyError(err) {
  const code = err?.cause?.code || err?.code;
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return true;
  const msg = `${err?.cause?.message || ''} ${err?.message || ''}`;
  return /unable to verify the first certificate/i.test(msg);
}

function wrapFetchError(err) {
  if (isTlsLeafVerifyError(err)) {
    const detail = err?.cause?.message || err?.message || String(err);
    const e = new Error(`${TLS_HINT_EN}\n(${detail})`);
    e.code = 'tls_proxy_blocked';
    return e;
  }
  const msg = String(err?.message || err || '');
  if (/fetch failed/i.test(msg)) {
    const e = new Error(
      `${TLS_HINT_EN} (fetch failed — often TLS on Windows). See README § TLS / antivirus.`,
    );
    e.code = 'tls_proxy_blocked';
    return e;
  }
  return err;
}

module.exports = { TLS_HINT_DE, TLS_HINT_EN, isTlsLeafVerifyError, wrapFetchError };
