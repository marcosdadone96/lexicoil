/**
 * t3PoolDedupGate.mjs — Bloqueo de duplicados T3 antes de pool-verified.
 *
 * 1. Core fingerprint (slots 1–6, q7 excluido por rotación de nombre).
 * 2. Límite 1 copia total en pool para la familia de molde compartido (4 blueprints).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import { listPoolVerifiedJson, poolVerifiedDir, POOL_VERIFIED_DIR } from './batchPaths.mjs';
import {
  t3SituationCoreFingerprintFromBatch,
  t3SituationCoreFingerprintFromQuestions,
} from './t3GroupFingerprint.mjs';

/** Blueprints que comparten anuncios + elenco (diversidad falsa). */
export const T3_SHARED_MOLD_FAMILY = Object.freeze([
  'bp-reparatur-kurse',
  'bp-ernaehrung',
  'bp-gesundheit',
  'bp-umwelt',
]);

/** Máximo de partes de la familia en pool-verified (1 total hasta ampliar moldes). */
export const T3_SHARED_MOLD_FAMILY_POOL_MAX = 1;

/** Máximo por slug individual dentro de la familia. */
export const T3_SHARED_MOLD_SLUG_POOL_MAX = 1;

let _poolIndexCache = null;

function isLesenT3Batch(batch) {
  const qs = batch?.questions || [];
  if (!qs.length) return false;
  return qs.every(
    (q) => String(q?.module || 'lesen').toLowerCase() === 'lesen' && Number(q?.teil) === 3,
  );
}

function listPoolVerifiedT3Files(level = 'B1') {
  return listPoolVerifiedJson(level).filter((abs) => /lesen-t3/i.test(path.basename(abs)));
}

/**
 * @param {{ reload?: boolean, poolDir?: string, excludeFile?: string }} [opts]
 */
export function loadPoolVerifiedT3Index(opts = {}) {
  if (_poolIndexCache && !opts.reload) return _poolIndexCache;

  const level = opts.level || 'B1';
  const poolDir = opts.poolDir || poolVerifiedDir(level);
  const excludeBase = opts.excludeFile ? path.basename(opts.excludeFile) : null;
  const byCoreFp = new Map();
  const bySlug = new Map();
  const familyFiles = [];

  for (const abs of listPoolVerifiedT3Files(level)) {
    const base = path.basename(abs);
    if (excludeBase && base === excludeBase) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const slug = String(batch._blueprintSlug || batch.blueprintSlug || '').trim();
    const coreFp = t3SituationCoreFingerprintFromBatch(batch);
    const row = { file: base, slug, coreFp };

    if (coreFp && !byCoreFp.has(coreFp)) byCoreFp.set(coreFp, row);
    if (slug) {
      bySlug.set(slug, (bySlug.get(slug) || 0) + 1);
      if (T3_SHARED_MOLD_FAMILY.includes(slug)) familyFiles.push(row);
    }
  }

  _poolIndexCache = { byCoreFp, bySlug, familyFiles, poolDir };
  return _poolIndexCache;
}

export function resetPoolVerifiedT3IndexCache() {
  _poolIndexCache = null;
}

function isSharedMoldSlug(slug) {
  return T3_SHARED_MOLD_FAMILY.includes(String(slug || '').trim());
}

/**
 * @param {object} batch
 * @param {{ file?: string, poolDir?: string, reload?: boolean }} [opts]
 * @returns {{ ok: boolean, reasons: string[], details: object[] }}
 */
export function checkT3PoolDedup(batch, opts = {}) {
  const reasons = [];
  const details = [];
  if (!isLesenT3Batch(batch)) return { ok: true, reasons, details };

  const slug = String(batch._blueprintSlug || batch.blueprintSlug || '').trim();
  const coreFp = t3SituationCoreFingerprintFromBatch(batch);
  const index = loadPoolVerifiedT3Index({
    reload: opts.reload,
    poolDir: opts.poolDir,
    excludeFile: opts.file,
  });

  if (coreFp) {
    const hit = index.byCoreFp.get(coreFp);
    if (hit) {
      reasons.push('t3_situation_core_duplicate');
      details.push({
        rule: 't3_situation_core_duplicate',
        severity: 'reject',
        detail: `core fp ${coreFp} ya en pool-verified/${hit.file} (slug ${hit.slug || '?'})`,
        conflictFile: hit.file,
        coreFp,
      });
    }
  }

  if (slug && isSharedMoldSlug(slug)) {
    const slugCount = index.bySlug.get(slug) || 0;
    if (slugCount >= T3_SHARED_MOLD_SLUG_POOL_MAX) {
      reasons.push('t3_shared_mold_slug_limit');
      details.push({
        rule: 't3_shared_mold_slug_limit',
        severity: 'reject',
        detail: `slug «${slug}» ya tiene ${slugCount} copia(s) en pool (máx ${T3_SHARED_MOLD_SLUG_POOL_MAX})`,
        slug,
      });
    }

    const familyCount = index.familyFiles.length;
    if (familyCount >= T3_SHARED_MOLD_FAMILY_POOL_MAX) {
      const existing = index.familyFiles.map((r) => `${r.file}(${r.slug})`).join(', ');
      reasons.push('t3_shared_mold_family_limit');
      details.push({
        rule: 't3_shared_mold_family_limit',
        severity: 'reject',
        detail:
          `familia molde compartido ya tiene ${familyCount} en pool (máx ${T3_SHARED_MOLD_FAMILY_POOL_MAX}): ${existing}`,
        slug,
        familyCount,
      });
    }
  }

  return { ok: reasons.length === 0, reasons, details, coreFp, slug };
}

export const T3_POOL_DEDUP_GATE_VERSION = 'v1.0-core-fp-family-limit-2026-07-15';
