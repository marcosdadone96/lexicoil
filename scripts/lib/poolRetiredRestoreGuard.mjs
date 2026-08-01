/**
 * Bloquea copias silenciosas de batches retirados (needs-regeneration → pool-verified).
 * Requiere --acknowledge-retired-restore explícito para reintroducir contenido con _poolRetiredReason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { poolVerifiedDir, NEEDS_REGEN_ROOT } from './batchPaths.mjs';

export function poolRetiredMeta(batchOrPath) {
  let batch = batchOrPath;
  if (typeof batchOrPath === 'string') {
    const abs = path.isAbsolute(batchOrPath) ? batchOrPath : path.join(ROOT, batchOrPath);
    if (!fs.existsSync(abs)) return null;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      return null;
    }
  }
  if (!batch || typeof batch !== 'object') return null;
  const reason = batch._poolRetiredReason || batch._poolRetiredAt ? batch._poolRetiredReason : null;
  if (!reason) return null;
  return {
    reason: String(reason),
    at: batch._poolRetiredAt || null,
    from: batch._poolRetiredFrom || null,
    note: batch._poolRetiredNote || null,
  };
}

/**
 * @param {{ sourceAbs: string, destAbs?: string, acknowledgeRetiredRestore?: boolean }} opts
 * @returns {{ blocked: false } | { blocked: true, meta: object, message: string }}
 */
export function checkRetiredRestoreToPoolVerified(opts) {
  const sourceAbs = path.resolve(opts.sourceAbs);
  const destAbs = opts.destAbs ? path.resolve(opts.destAbs) : null;
  const destUnderPool =
    destAbs &&
    (destAbs.startsWith(path.resolve(poolVerifiedDir('A2')) + path.sep) ||
      destAbs.startsWith(path.resolve(poolVerifiedDir('B1')) + path.sep) ||
      destAbs.includes(`${path.sep}pool-verified${path.sep}`));
  const srcUnderNeeds =
    sourceAbs.includes(`${path.sep}needs-regeneration${path.sep}`) ||
    sourceAbs.startsWith(path.resolve(NEEDS_REGEN_ROOT) + path.sep);

  const meta = poolRetiredMeta(sourceAbs);
  if (!meta) return { blocked: false };
  if (!srcUnderNeeds && !destUnderPool) return { blocked: false };

  const target = destUnderPool ? 'pool-verified' : 'pool-verified (destino implícito)';
  const message =
    `BLOQUEADO: restauración a ${target} desde batch retirado.\n` +
    `  origen: ${path.relative(ROOT, sourceAbs).replace(/\\/g, '/')}\n` +
    `  _poolRetiredReason: ${meta.reason}\n` +
    (meta.from ? `  _poolRetiredFrom: ${meta.from}\n` : '') +
    `¿De verdad quieres reintroducir un archivo retirado por una razón activa?\n` +
    `  → Use sucesor regenerado en pool-verified, o actualice assembled/publish.\n` +
    `  → Solo con decisión consciente: --acknowledge-retired-restore en copy-batch-to-pool-verified.mjs`;

  if (opts.acknowledgeRetiredRestore === true) {
    return { blocked: false, acknowledged: true, meta, warning: message };
  }
  return { blocked: true, meta, message };
}

export function assertSafeCopyIntoPoolVerified(opts) {
  const chk = checkRetiredRestoreToPoolVerified(opts);
  if (chk.blocked) {
    const err = new Error(chk.message);
    err.code = 'POOL_RETIRED_RESTORE_BLOCKED';
    err.meta = chk.meta;
    throw err;
  }
  return chk;
}
