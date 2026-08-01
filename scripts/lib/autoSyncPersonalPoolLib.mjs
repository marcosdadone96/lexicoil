/**
 * autoSyncPersonalPoolLib — sync pool-verified parts → reusable-seed (+ optional Blobs).
 *
 * Hook points:
 *   - finalizePoolReady.mjs (after each READY write)
 *   - vocabBgRunner.mjs (safety net after publish)
 *   - backfill-orphan-pool-sync.mjs (batch)
 *
 * Disable: AUTO_SYNC_PERSONAL_POOL=0
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { normalizeLevel } from './batchPaths.mjs';
import {
  buildExamSeedRecordFromBatch,
  appendLesenRecordToPool,
  defaultPoolFile,
} from './publishToPool.mjs';
import { inferTeilFromBatch } from './extractJson.mjs';
import { oralTeilsForLevel } from './examLevelCells.mjs';
import { isSchreibenPerTeil, isSprechenPerTeil } from './examTemplatePrompt.mjs';

const require = createRequire(import.meta.url);
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');

export function isAutoSyncPersonalEnabled() {
  return process.env.AUTO_SYNC_PERSONAL_POOL !== '0';
}

/** Parse pool-verified filename → module, teil, record id(s). */
export function parsePoolVerifiedMeta(filename) {
  const base = path.basename(String(filename || ''), '.json');
  const lt = base.match(/^(lesen|horen)-t(\d+)/i);
  if (lt) {
    return { module: lt[1].toLowerCase(), teil: Number(lt[2]), recordId: base, bundle: false };
  }
  const oralTeil = base.match(/^(schreiben|sprechen)-t(\d+)/i);
  if (oralTeil) {
    return {
      module: oralTeil[1].toLowerCase(),
      teil: Number(oralTeil[2]),
      recordId: base,
      bundle: false,
    };
  }
  const bundle = base.match(/^(schreiben|sprechen)-gemini-(\d+)/i);
  if (bundle) {
    return { module: bundle[1].toLowerCase(), teil: null, recordId: base, bundle: true };
  }
  const curBundle = base.match(/^(schreiben|sprechen)-cur-([a-z]+)$/i);
  if (curBundle) {
    return { module: curBundle[1].toLowerCase(), teil: null, recordId: base, bundle: true };
  }
  return { module: null, teil: null, recordId: base, bundle: false };
}

function teilsForBundle(module, level = 'B1') {
  const lv = normalizeLevel(level);
  if (module === 'schreiben') return oralTeilsForLevel('schreiben', lv);
  if (module === 'sprechen') return oralTeilsForLevel('sprechen', lv);
  return [1];
}

/** Teils to sync — bundle filename may hold a single per-Teil oral part (A2/B2 Schreiben/Sprechen). */
export function resolveSyncTeils({ meta, batch, mod, lv }) {
  const batchTeils = [
    ...new Set((batch?.questions || []).map((q) => Number(q?.teil)).filter(Number.isFinite)),
  ];
  const fallbackTeil = Number(
    meta.teil ?? inferTeilFromBatch(batch) ?? batch?.questions?.[0]?.teil ?? 1,
  );
  const teilsInBatch = batchTeils.length ? batchTeils : [fallbackTeil];

  if (!meta.bundle) {
    return [Number(meta.teil ?? fallbackTeil ?? 1)];
  }

  const fullBundleTeils = teilsForBundle(mod, lv);
  const oralPerTeilLevel =
    (mod === 'schreiben' && isSchreibenPerTeil(mod, lv)) ||
    (mod === 'sprechen' && isSprechenPerTeil(mod, lv));

  if (oralPerTeilLevel && teilsInBatch.length < fullBundleTeils.length) {
    return teilsInBatch;
  }

  return fullBundleTeils;
}

function writeSyncLog(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOG_DIR, 'auto-sync-personal-pool.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Sync one pool-verified batch to personal pool (seed + optional Blobs).
 * @param {{ file: string, batch: object, level?: string, opts?: object }} params
 */
export async function syncPoolVerifiedBatch({ file, batch, level = 'B1', opts = {} }) {
  if (!isAutoSyncPersonalEnabled()) {
    return { skipped: true, reason: 'AUTO_SYNC_PERSONAL_POOL=0' };
  }
  if (!file || !batch) {
    return { ok: false, error: 'missing file or batch' };
  }

  const lv = normalizeLevel(level || batch.level || 'B1');
  const lang = String(opts.lang || batch.lang || 'de').toLowerCase();
  const meta = parsePoolVerifiedMeta(file);
  const mod = String(opts.module || meta.module || batch.module || 'lesen').toLowerCase();
  const poolFile = opts.poolFile || defaultPoolFile(lang, lv);
  const sourceFile =
    opts.sourceFile || `batches/ready/pool-verified/${lv}/${path.basename(file)}`;

  let store = opts.store || null;
  if (!store && opts.syncBlobs !== false) {
    try {
      const { getStore } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
      store = await getStore('reusable_part_idx');
    } catch {
      store = null;
    }
  }

  const teils = resolveSyncTeils({ meta, batch, mod, lv });

  const results = [];
  for (const teil of teils) {
    const recordId = meta.bundle ? `${meta.recordId}-t${teil}` : meta.recordId;
    const record = buildExamSeedRecordFromBatch(batch, {
      lang,
      level: lv,
      module: mod,
      teil,
      id: recordId,
      idPrefix: 'pv',
      topicTag: opts.topicTag,
    });
    record.sourceFile = sourceFile;
    record.contributor = opts.contributor || 'auto-sync-pool-verified';
    if (opts.bgGenerated) {
      record.bgGenerated = true;
      record.bgVocabLemmas = Array.isArray(opts.bgVocabLemmas) ? opts.bgVocabLemmas : [];
      record.bgGenAt = opts.bgGenAt || new Date().toISOString();
    }

    const pub = await appendLesenRecordToPool(record, {
      lang,
      level: lv,
      poolFile,
      store,
      skipLock: opts.skipLock === true,
      bgGenerated: opts.bgGenerated,
      bgVocabLemmas: opts.bgVocabLemmas,
      bgGenAt: opts.bgGenAt,
    });
    results.push({ recordId, teil, ...pub });
  }

  try {
    const { clearLocalSeedCache } = require(
      path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'),
    );
    const { clearPoolSearchCache } = require(
      path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'),
    );
    clearLocalSeedCache();
    clearPoolSearchCache();
  } catch {
    /* optional in minimal envs */
  }

  const ok = results.some((r) => r.ok);
  const entry = {
    trigger: opts.trigger || 'sync',
    file: path.basename(file),
    ok,
    results: results.map((r) => ({
      recordId: r.recordId,
      ok: r.ok,
      duplicate: r.duplicate,
      error: r.error,
    })),
  };
  writeSyncLog(entry);
  try {
    const { logAssembledStaleAfterPoolTouch } = await import('./assembledExamFreshness.mjs');
    logAssembledStaleAfterPoolTouch({ level: lv, file: path.basename(file), trigger: opts.trigger || 'sync' });
  } catch {
    /* optional */
  }
  return { ok, file: path.basename(file), results, duplicate: results.every((r) => r.duplicate) };
}

/** Fire-and-forget wrapper for generation pipelines. */
export function scheduleAutoSyncPersonalPool(opts = {}) {
  if (!isAutoSyncPersonalEnabled()) return;
  setImmediate(() => {
    syncPoolVerifiedBatch(opts).catch((err) => {
      console.warn('[auto-sync-personal] failed:', err?.message || err);
      writeSyncLog({ trigger: opts.trigger || 'scheduled', error: err?.message || String(err) });
    });
  });
}
