/**
 * Detect TLS interception (AV/corporate proxy) that breaks Node's default CA store.
 * geminiClient.mjs merges the OS trust store on import (see ensureSystemCa.mjs).
 */

const TLS_HINT =
  'TLS interceptado por antivirus/proxy: el cliente Gemini ya fusiona certificados del sistema; ' +
  'si persiste, define NODE_EXTRA_CA_CERTS con el CA raíz del proxy. Ver README.';

export function isTlsLeafVerifyError(err) {
  const code = err?.cause?.code || err?.code;
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return true;
  const msg = `${err?.cause?.message || ''} ${err?.message || ''}`;
  return /unable to verify the first certificate/i.test(msg);
}

/** Re-throw with an actionable message; otherwise rethrow original. */
export function rethrowIfTlsIntercept(err) {
  if (isTlsLeafVerifyError(err)) {
    const detail = err?.cause?.message || err?.message || String(err);
    throw new Error(`${TLS_HINT}\n(${detail})`);
  }
  throw err;
}

export { TLS_HINT };
