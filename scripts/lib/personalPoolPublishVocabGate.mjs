/**
 * Phase C — pool parts need enough vocabKeys for pickReusablePartByVocab / planner.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const require = createRequire(import.meta.url);
const { vocabKeysFromPart } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSearchCache.js',
));

export const MIN_POOL_VOCAB_KEYS = 3;

const SKIP_MODULES = new Set(['schreiben', 'sprechen', 'writing', 'speaking']);

/**
 * @param {object} part — reusable part payload or batch-shaped object
 * @param {{ module?: string, minKeys?: number }} [opts]
 */
export function verifyPartVocabIndexForPool(part, opts = {}) {
  const mod = String(opts.module || part?.module || 'lesen').toLowerCase();
  if (SKIP_MODULES.has(mod)) {
    return { ok: true, skipped: true, module: mod, keyCount: 0, minKeys: opts.minKeys ?? MIN_POOL_VOCAB_KEYS };
  }
  const minKeys = opts.minKeys ?? MIN_POOL_VOCAB_KEYS;
  const keys = vocabKeysFromPart(part || {});
  const unique = [...new Set(keys.map((k) => String(k).toLowerCase()).filter(Boolean))];
  return {
    ok: unique.length >= minKeys,
    skipped: false,
    module: mod,
    keyCount: unique.length,
    minKeys,
    keys: unique,
    reason: unique.length >= minKeys ? null : `pool_vocab_index_sparse_${unique.length}_of_${minKeys}`,
  };
}
