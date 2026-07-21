/**
 * Detect TLS interception (AV/corporate proxy) that breaks Node's default CA store.
 * Node 22+: prefer `node --use-system-ca` (wired into npm generate/judge scripts).
 */

const TLS_HINT =
  'TLS interceptado por antivirus/proxy: ejecuta con NODE_OPTIONS=--use-system-ca o define NODE_EXTRA_CA_CERTS. Ver README.';

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
