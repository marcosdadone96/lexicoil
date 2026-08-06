/**
 * lesenT3BlueprintStock.mjs — stock disponible de blueprints T3 por tema B1.
 * Usado por make-t3 (preflight), generate-cli y auditorías de pool-fill.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterBlueprintsForTopic,
  detectTopicFromT3Situations,
  TOPIC_BLUEPRINT_PREFERENCE,
} from './lesenT3TopicFilter.mjs';
import {
  loadPoolVerifiedT3Index,
  T3_SHARED_MOLD_FAMILY,
  T3_SHARED_MOLD_SLUG_POOL_MAX,
  T3_SHARED_MOLD_FAMILY_POOL_MAX,
} from './t3PoolDedupGate.mjs';
import { t3SituationCoreFingerprintFromBatch } from './t3GroupFingerprint.mjs';
import { normalizeB1Topic } from './b1Topics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const T3_BLUEPRINT_DIR = path.join(ROOT, 'scripts', 't3-blueprints');

/** @param {object} bp */
export function validateT3Blueprint(bp) {
  const errors = [];
  const qs = bp?.questions || [];
  if (qs.length !== 7) {
    errors.push(`expected 7 questions, got ${qs.length}`);
    return errors;
  }
  if (!qs[0].options || qs[0].options.length !== 10) {
    errors.push(`q[0] must have 10 options`);
    return errors;
  }
  const canonical = qs[0].options.map((o) => String(o).trim()).join('|');
  for (let i = 1; i < qs.length; i++) {
    const cmp = (qs[i].options || []).map((o) => String(o).trim()).join('|');
    if (cmp !== canonical) errors.push(`q[${i}] has different options list`);
  }
  const corrects = qs.map((q) => String(q.correct || '0').toUpperCase());
  const zeros = corrects.filter((c) => c === '0').length;
  if (zeros !== 1) errors.push(`expected exactly 1 "0", got ${zeros}`);
  const nonZero = corrects.filter((c) => c !== '0');
  const seen = new Set();
  for (const c of nonZero) {
    if (seen.has(c)) errors.push(`letter "${c}" repeated`);
    seen.add(c);
  }
  return errors;
}

let _passingCache = null;

/** @returns {object[]} */
export function loadPassingT3Blueprints() {
  if (_passingCache) return _passingCache;
  const blueprints = fs
    .readdirSync(T3_BLUEPRINT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const bp = JSON.parse(fs.readFileSync(path.join(T3_BLUEPRINT_DIR, f), 'utf8'));
      bp.slug = bp.slug || f.replace(/\.json$/, '');
      bp._file = f;
      return bp;
    })
    .filter((bp) => validateT3Blueprint(bp).length === 0);
  _passingCache = blueprints;
  return blueprints;
}

export function resetPassingT3BlueprintCache() {
  _passingCache = null;
}

/**
 * Static pool-dedup block for a blueprint template (situations unchanged by perturb).
 * @param {object} bp
 * @param {ReturnType<typeof loadPoolVerifiedT3Index>} poolIdx
 */
export function t3BlueprintStaticDedupBlockReason(bp, poolIdx) {
  const slug = String(bp?.slug || '').trim();
  const coreFp = t3SituationCoreFingerprintFromBatch(bp);
  if (coreFp && poolIdx.byCoreFp.has(coreFp)) {
    const hit = poolIdx.byCoreFp.get(coreFp);
    return {
      code: 'core_fp_in_pool',
      detail: `core fp ${coreFp} ya en pool-verified/${hit.file} (slug ${hit.slug || '?'})`,
      slug,
      coreFp,
      conflictFile: hit.file,
    };
  }
  if (slug && T3_SHARED_MOLD_FAMILY.includes(slug)) {
    const slugCount = poolIdx.bySlug.get(slug) || 0;
    if (slugCount >= T3_SHARED_MOLD_SLUG_POOL_MAX) {
      return {
        code: 'shared_mold_slug_limit',
        detail: `slug «${slug}» ya tiene ${slugCount} copia(s) en pool`,
        slug,
      };
    }
    const familyCount = poolIdx.familyFiles.length;
    if (familyCount >= T3_SHARED_MOLD_FAMILY_POOL_MAX) {
      const existing = poolIdx.familyFiles.map((r) => `${r.file}(${r.slug})`).join(', ');
      return {
        code: 'shared_mold_family_limit',
        detail: `familia molde compartido ya tiene ${familyCount} en pool: ${existing}`,
        slug,
        familyCount,
      };
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} requestedTopic
 * @param {Set<string>|string[]} [exclude]
 * @param {{ level?: string, reloadPool?: boolean }} [opts]
 */
export function listT3BlueprintStockForTopic(requestedTopic, exclude = new Set(), opts = {}) {
  const topic = normalizeB1Topic(requestedTopic);
  const excludeSet =
    exclude instanceof Set ? exclude : new Set((exclude || []).map((s) => String(s).trim()).filter(Boolean));
  const passing = loadPassingT3Blueprints();
  const poolIdx = loadPoolVerifiedT3Index({ reload: opts.reloadPool !== false, level: opts.level || 'B1' });

  let compatible = passing;
  if (topic) {
    compatible = filterBlueprintsForTopic(passing, topic);
  }

  const rows = [];
  for (const bp of compatible) {
    const slug = bp.slug || bp._file?.replace(/\.json$/, '') || '';
    const detected = detectTopicFromT3Situations(bp.questions);
    const excluded = excludeSet.has(slug);
    const dedupBlock = excluded ? null : t3BlueprintStaticDedupBlockReason(bp, poolIdx);
    rows.push({
      slug,
      detected,
      excluded,
      dedupBlock,
      available: !excluded && !dedupBlock,
    });
  }

  const available = rows.filter((r) => r.available);
  return {
    topic: topic || null,
    preference: topic ? TOPIC_BLUEPRINT_PREFERENCE[topic] || null : null,
    passingTotal: passing.length,
    compatibleTotal: compatible.length,
    availableTotal: available.length,
    availableSlugs: available.map((r) => r.slug),
    rows,
    generatable: available.length > 0,
  };
}

export const T3_BLUEPRINT_EXHAUSTED_RE = /(?:ningún blueprint (?:disponible|compatible)|sin stock de blueprint)/i;

/** @param {string|null|undefined} reason */
export function isT3BlueprintExhaustedReason(reason) {
  return T3_BLUEPRINT_EXHAUSTED_RE.test(String(reason || ''));
}

/** @param {Error|string|null|undefined} err */
export function isT3BlueprintExhaustedError(err) {
  if (!err) return false;
  if (typeof err === 'string') return isT3BlueprintExhaustedReason(err);
  if (err.code === 'T3_BLUEPRINT_EXHAUSTED') return true;
  return isT3BlueprintExhaustedReason(err.message);
}

export class T3BlueprintExhaustedError extends Error {
  /**
   * @param {string} topic
   * @param {{ exclude?: Set<string>, stock?: ReturnType<typeof listT3BlueprintStockForTopic> }} [meta]
   */
  constructor(topic, meta = {}) {
    const stock = meta.stock || listT3BlueprintStockForTopic(topic, meta.exclude || new Set());
    const msg =
      `T3 generator: sin stock de blueprint para «${topic}»` +
      (stock.availableTotal === 0 && stock.compatibleTotal === 0
        ? ` (0 esqueletos compatibles de ${stock.passingTotal} válidos)`
        : stock.availableTotal === 0
          ? ` (0 disponibles; ${stock.compatibleTotal} compatibles bloqueados por dedup/exclusión)`
          : '');
    super(msg);
    this.name = 'T3BlueprintExhaustedError';
    this.code = 'T3_BLUEPRINT_EXHAUSTED';
    this.topic = topic;
    this.stock = stock;
  }
}
