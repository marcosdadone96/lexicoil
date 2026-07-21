/**
 * Shared normalize + position-bias gates for manual Lesen publish paths.
 * Auto-generation uses coerceGeneratedLesenPart in generate-lesen-part-gemini.mjs;
 * manual scripts must call this before pool-verified / reusable-seed writes.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { normalizeBatch } from './normalizeBatch.mjs';
import { answerKeySequence } from './balanceMcq.mjs';

const require = createRequire(import.meta.url);
const { isPartPoolReady } = require(path.join(ROOT, 'scripts/audit-pass-2.mjs'));

const META_KEYS = [
  'topicTag',
  '_requestedTopic',
  '_resolvedTopic',
  '_textSubtype',
  '_t5InstitutionSeed',
  '_t5VariantProfile',
  '_debateSeed',
  '_debateTopic',
  'userVocabFeedback',
  '_scoreEstimate',
  '_generatedAt',
  '_curatedAt',
  '_curatedNote',
];

/**
 * @param {object} batch
 * @param {{ teil?: number, lang?: string, level?: string, module?: string }} [ctx]
 */
export function normalizeManualLesenBatch(batch, ctx = {}) {
  const teil = Number(ctx.teil ?? batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil);
  const lang = ctx.lang || batch.lang || 'de';
  const level = ctx.level || batch.level || 'B1';
  const meta = {};
  for (const k of META_KEYS) {
    if (batch[k] != null) meta[k] = batch[k];
  }
  const normalized = normalizeBatch(batch, {
    module: ctx.module || 'lesen',
    teil: Number.isFinite(teil) ? teil : ctx.teil,
    lang,
    level,
    rootTopicTag: meta.topicTag || meta._requestedTopic || null,
    stripPoolLegacy: ctx.stripPoolLegacy !== false,
  });
  return { ...normalized, ...meta, topicTag: meta.topicTag || normalized.topicTag };
}

/**
 * Apply balanceMcq when a manual Lesen batch can reach pool with MCQ position bias risk.
 * @param {object} batch
 * @param {{ teil?: number|null, lang?: string, level?: string, module?: string }} ctx
 */
export function maybeNormalizeManualLesenBatch(batch, ctx = {}) {
  const module = String(ctx.module || batch?.questions?.[0]?.module || 'lesen').toLowerCase();
  if (module !== 'lesen') return batch;
  const teil = Number(ctx.teil ?? batch?.questions?.[0]?.teil ?? batch?.passages?.[0]?.teil);
  if (![2, 5].includes(teil)) return batch;
  return normalizeManualLesenBatch(batch, {
    teil,
    lang: ctx.lang || batch.lang || 'de',
    level: ctx.level || batch.level || 'B1',
    module: 'lesen',
  });
}

/**
 * @param {object} batch
 * @returns {{ seq: string[], counts: Record<string, number>, n: number, maxPct: number, maxLetter: string|null }}
 */
export function measureMcqPositionDistribution(batch) {
  const seqStr = answerKeySequence(batch.questions || [], 'multiple_choice');
  const seq = seqStr ? seqStr.split(',').filter(Boolean) : [];
  const counts = { a: 0, b: 0, c: 0 };
  for (const l of seq) {
    if (l in counts) counts[l] += 1;
  }
  const n = seq.length;
  let maxPct = 0;
  let maxLetter = null;
  for (const L of ['a', 'b', 'c']) {
    const p = n ? counts[L] / n : 0;
    if (p > maxPct) {
      maxPct = p;
      maxLetter = L;
    }
  }
  return { seq, counts, n, maxPct, maxLetter };
}

export function formatMcqPositionLine(dist) {
  if (!dist?.n) return 'MCQ position: (no scored items)';
  const pct = (k) => (dist.n ? Math.round((100 * dist.counts[k]) / dist.n) : 0);
  return `MCQ position: seq=[${dist.seq.join(',')}] a=${pct('a')}% b=${pct('b')}% c=${pct('c')}% max=${Math.round(dist.maxPct * 100)}%`;
}

/**
 * Position-bias gates only (CHK-13/19 equivalent) — not full POOL-2 audit.
 * @param {object} batch
 * @param {{ teil?: number, lang?: string, level?: string }} [opts]
 */
export function assertManualPublishPositionGates(batch, opts = {}) {
  const normalized = normalizeManualLesenBatch(batch, opts);
  const dist = measureMcqPositionDistribution(normalized);
  const missingLetters = ['a', 'b', 'c'].filter((L) => !dist.seq.includes(L));
  const issues = [];
  if (!normalized._balanceMcqVersion) {
    issues.push('missing _balanceMcqVersion (balanceMcq not applied)');
  }
  if (dist.n >= 3 && missingLetters.length) {
    issues.push(`letters unused: ${missingLetters.join(',')}`);
  }
  if (dist.n >= 3 && dist.maxPct > 0.55) {
    issues.push(`max letter ${dist.maxLetter} = ${Math.round(dist.maxPct * 100)}% (>55%)`);
  }
  return {
    ok: issues.length === 0,
    batch: normalized,
    dist,
    issues,
    hasBalanceStamp: Boolean(normalized._balanceMcqVersion),
  };
}

/**
 * Full POOL-2 audit (includes CHK-18, etc.) — use in publish-lesen-generated POOL-2 path.
 * @param {object} batch
 * @param {{ teil?: number, lang?: string, level?: string, allowAuditFailures?: boolean }} [opts]
 */
export async function assertManualPublishGates(batch, opts = {}) {
  const pos = assertManualPublishPositionGates(batch, opts);
  const gate = await isPartPoolReady(pos.batch, {
    semantic: true,
    allowFailures: opts.allowAuditFailures === true,
  });
  const blocking = gate.blocking || [];
  const positionFindings = blocking.filter((f) => f.id === 'CHK-13' || f.id === 'CHK-19');
  const ok = pos.ok && gate.ok;
  return {
    ok,
    batch: pos.batch,
    dist: pos.dist,
    gate,
    positionFindings,
    positionIssues: pos.issues,
    hasBalanceStamp: pos.hasBalanceStamp,
  };
}
