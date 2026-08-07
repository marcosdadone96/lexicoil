/**
 * Lesen T4 — bloqueo Jaccard vs reusable-seed en la misma celda (topic×T4)
 * antes de escribir pool-verified (evita API + auto-sync duplicados).
 */
import {
  buildExamSeedRecordFromBatch,
  checkPoolCellDedup,
} from './publishToPool.mjs';
import { loadPoolRecords } from './poolGapPlanner.mjs';
import { inferBatchLevel, normalizeLevel } from './batchPaths.mjs';

function isLesenT4Batch(batch) {
  const mod = String(
    batch?.module || batch?.passages?.[0]?.module || batch?.questions?.[0]?.module || '',
  ).toLowerCase();
  if (mod !== 'lesen') return false;
  const teil = Number(
    batch?.teil ?? batch?.passages?.[0]?.teil ?? batch?.questions?.[0]?.teil,
  );
  return teil === 4;
}

/**
 * @returns {{ ok: boolean, reasons: string[], details: object[] }}
 */
export function checkT4PoolDedup(batch, opts = {}) {
  if (!isLesenT4Batch(batch)) {
    return { ok: true, reasons: [], details: [] };
  }
  const lang = String(opts.lang || batch.lang || 'de').toLowerCase();
  const level = normalizeLevel(opts.level || inferBatchLevel(batch) || batch.level || 'B1');
  const teil = 4;
  const topicTag =
    batch.passages?.[0]?.topicTag ||
    batch.topicTag ||
    batch._requestedTopic ||
    batch._resolvedTopic ||
    null;

  const record = buildExamSeedRecordFromBatch(batch, {
    lang,
    level,
    module: 'lesen',
    teil,
    id: opts.recordId || 't4-dedup-preflight',
    idPrefix: 'pv',
    topicTag,
  });

  const poolRecords = loadPoolRecords(lang, level);
  const dedup = checkPoolCellDedup(record, poolRecords, {
    lang,
    level,
    module: 'lesen',
    teil,
    topicTag: record.topicTag || topicTag,
  });

  if (dedup.ok) {
    return { ok: true, reasons: [], details: [] };
  }

  return {
    ok: false,
    reasons: ['pool_dedup'],
    details: [
      {
        rule: 'pool_dedup',
        severity: 'reject',
        detail: dedup.message || dedup.reason,
        similarTo: dedup.similarTo,
        similarity: dedup.similarity,
      },
    ],
  };
}
