/**
 * finalizePoolReady.mjs — Paso final obligatorio tras generación OK.
 * Mueve el archivo a pool-verified (READY) o needs-regeneration (REJECT).
 * Copia a pool-content-ok si pasa gates 1–7 pero falla metadata retrieval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { poolReadyCheckWithRepair } from './poolReadyCheck.mjs';
import { enrichBatchMetadata } from './enrichBatchMetadata.mjs';
import {
  inferBatchLevel,
  normalizeLevel,
  poolVerifiedDir,
  poolContentOkDir,
  poolContentOkLesenDir,
  needsRegenerationDir,
  ensureLevelStagingDirs,
} from './batchPaths.mjs';

/** @deprecated use poolVerifiedDir(level) */
export const POOL_VERIFIED_DIR = path.join(ROOT, 'batches/ready/pool-verified');
export const POOL_CONTENT_OK_DIR = path.join(ROOT, 'batches/ready/pool-content-ok');
export const POOL_CONTENT_OK_LESEN_DIR = path.join(ROOT, 'batches/ready/pool-content-ok-lesen');
export const NEEDS_REGENERATION_DIR = path.join(ROOT, 'batches/needs-regeneration');

/** Strip reject stamps — never persist these on pool-verified copies. */
export function stripPoolRejectMeta(batch) {
  if (!batch || typeof batch !== 'object') return batch;
  const {
    _poolRejectReason,
    _poolRejectAt,
    _poolRejectDetails,
    _poolContentOkLesenAt,
    _poolContentOkLesenNote,
    _poolContentOkAt,
    _poolContentOkNote,
    ...clean
  } = batch;
  return clean;
}

function resolveLevel(batch, opts = {}) {
  return normalizeLevel(opts.level || inferBatchLevel(batch));
}

/** Write a READY batch to pool-verified/{level}/ (always strips reject / content-ok interim meta). */
export function writePoolVerified(file, batch, level = 'B1') {
  const lv = normalizeLevel(level);
  ensureLevelStagingDirs(lv);
  const dest = path.join(poolVerifiedDir(lv), file);
  const clean = stripPoolRejectMeta(batch);
  if (clean._poolRejectReason) {
    throw new Error(`refusing to write pool-verified/${lv}/${file}: still has _poolRejectReason`);
  }
  fs.writeFileSync(dest, `${JSON.stringify(clean, null, 2)}\n`);
  return dest;
}

/**
 * @param {string} absPath — archivo en batches/generated/{level}/
 * @param {object} batch
 * @param {object} [opts]
 * @returns {Promise<{ verdict: string, contentVerdict: string, poolPath: string|null, reasons: string[] }>}
 */
export async function finalizePoolReady(absPath, batch, opts = {}) {
  const lv = resolveLevel(batch, opts);
  ensureLevelStagingDirs(lv);
  const file = path.basename(absPath);
  const mod = String(batch.module || batch.questions?.[0]?.module || batch.passages?.[0]?.module || '').toLowerCase();
  const teilN = Number(batch.teil ?? batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil);
  const isHorenPictureMatching = mod === 'horen' && teilN === 2;
  const enriched = enrichBatchMetadata(batch, {
    fillGrammarDefaults: false,
    forceGrammar: isHorenPictureMatching,
  }).batch;
  const result = await poolReadyCheckWithRepair(enriched, {
    file,
    level: lv,
    q2Llm: opts.q2Llm === true,
    skipMetadata: opts.skipMetadata === true,
    ...opts,
  });

  const outBatch = result.batch || batch;

  if (result.verdict === 'READY') {
    const dest = writePoolVerified(file, outBatch, lv);
    try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* */ }
    console.log(`  [poolReady] READY → pool-verified/${lv}/${file}`);
    try {
      const { scheduleAutoPublishExams } = await import('./autoPublishExamsLib.mjs');
      scheduleAutoPublishExams({ lang: 'de', level: lv, trigger: `pool-verified:${file}` });
    } catch (_) {
      /* auto-publish optional in minimal envs */
    }
    try {
      const { scheduleAutoSyncPersonalPool } = await import('./autoSyncPersonalPoolLib.mjs');
      scheduleAutoSyncPersonalPool({
        file,
        batch: outBatch,
        level: lv,
        opts: { trigger: `pool-verified:${file}` },
      });
    } catch (_) {
      /* auto-sync optional in minimal envs */
    }
    return {
      verdict: 'READY',
      contentVerdict: result.contentVerdict,
      poolPath: dest,
      reasons: result.reasons || [],
      ok: true,
    };
  }

  if (result.q1OnlyReject && String(result.module || '').toLowerCase() === 'lesen') {
    const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = outBatch;
    const tagged = {
      ...clean,
      _poolContentOkLesenAt: new Date().toISOString(),
      _poolContentOkLesenNote:
        'gates pass except Q1 (exact/near_duplicate); Q1 still shadow until 2026-07-23 — accepted duplicate risk',
      _poolRejectReason: (result.rejectReasons || []).join(', '),
      _poolRejectDetails: (result.details || []).slice(0, 8),
    };
    const dest = path.join(poolContentOkLesenDir(lv), file);
    fs.writeFileSync(dest, `${JSON.stringify(tagged, null, 2)}\n`);
    try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* */ }
    console.log(`  [poolReady] Q1-only → pool-content-ok-lesen/${lv}/${file}`);
    return {
      verdict: 'REJECT',
      contentVerdict: result.contentVerdict,
      poolPath: dest,
      reasons: result.reasons || [],
      q1OnlyReject: true,
      ok: false,
    };
  }

  if (result.contentVerdict === 'READY' || result.contentVerdict === 'REPAIRABLE') {
    if (result.contentVerdict === 'READY') {
      const { _poolRejectReason, _poolRejectAt, _poolRejectDetails, ...clean } = outBatch;
      const contentCopy = {
        ...clean,
        _poolContentOkAt: new Date().toISOString(),
        _poolContentOkNote: 'gates 1-7 pass; not pool-verified (retrieval metadata)',
      };
      fs.writeFileSync(
        path.join(poolContentOkDir(lv), file),
        `${JSON.stringify(contentCopy, null, 2)}\n`,
      );
    }
  }

  const tagged = {
    ...outBatch,
    _poolRejectReason: (result.rejectReasons || result.reasons || []).join(', '),
    _poolRejectAt: new Date().toISOString(),
    _poolRejectDetails: (result.details || []).slice(0, 12),
  };
  const dest = path.join(needsRegenerationDir(lv), file);
  fs.writeFileSync(dest, `${JSON.stringify(tagged, null, 2)}\n`);
  try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* */ }
  console.log(
    `  [poolReady] ${result.verdict} → needs-regeneration/${lv}/${file} (${(result.rejectReasons || []).slice(0, 3).join(', ')})`,
  );
  return {
    verdict: result.verdict,
    contentVerdict: result.contentVerdict,
    poolPath: dest,
    reasons: result.reasons || [],
    ok: false,
  };
}
