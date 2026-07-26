/**
 * Merge OS trust store into Node's default CA list (equivalent to `node --use-system-ca`).
 * Fixes fetch/TLS on Windows when antivirus or corporate proxy intercepts HTTPS.
 */
import tls from 'node:tls';

let applied = false;

export function ensureSystemCaForTls() {
  if (applied) return;
  applied = true;
  if (typeof tls.setDefaultCACertificates !== 'function') return;
  if (typeof tls.getCACertificates !== 'function') return;
  try {
    const merged = [
      ...tls.getCACertificates('default'),
      ...tls.getCACertificates('system'),
    ];
    tls.setDefaultCACertificates(merged);
  } catch {
    /* older Node or restricted env — keep bundled CAs only */
  }
}

ensureSystemCaForTls();
