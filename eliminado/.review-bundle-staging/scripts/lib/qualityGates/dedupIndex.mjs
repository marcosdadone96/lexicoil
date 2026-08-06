/**
 * Índice de deduplicación (Q1a) — batches/ready/.dedup-index.json
 *
 * Formato:
 * {
 *   "version": 1,
 *   "updatedAt": "ISO",
 *   "entries": [
 *     {
 *       "id": "sha256 or t3fp",
 *       "kind": "passage_hash" | "t3_matching_fp" | "questions_set",
 *       "teil": 3,
 *       "logicalId": "lesen-t3-auto-qeh7ew",
 *       "source": "batches/ready/lesen/lesen-t3-auto-qeh7ew.json",
 *       "preview": "…",
 *       "shingles": ["word1 word2 …"]  // top shingles sample for debug
 *     }
 *   ],
 *   "byExactHash": { "sha256hex": "source" },
 *   "byT3Fp": { "16hex": "source" },
 *   "shingleIndex": { "shingle": ["source1", "source2"] }
 * }
 *
 * Actualización: rebuildDedupIndex() escanea corpus dirs y reescribe el archivo.
 * Canonicalización: un ID lógico (basename) se indexa una sola vez (ready > generated).
 * En dry-run se reconstruye; en generación se puede cargar cache y append tras aceptar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DEDUP_INDEX_PATH = path.resolve(
  __dirname,
  '../../../batches/ready/.dedup-index.json',
);

/**
 * @param {object} index
 * @param {string} [outPath]
 */
export function saveDedupIndex(index, outPath = DEFAULT_DEDUP_INDEX_PATH) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} [indexPath]
 */
export function loadDedupIndex(indexPath = DEFAULT_DEDUP_INDEX_PATH) {
  if (!fs.existsSync(indexPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {Array<object>} entries
 * @returns {object}
 */
export function buildIndexFromEntries(entries) {
  const byExactHash = {};
  const byT3Fp = {};
  const shingleIndex = {};

  for (const e of entries) {
    if (e.kind === 'passage_hash' && e.id) {
      byExactHash[e.id] = e.source;
    }
    if (e.kind === 't3_matching_fp' && e.id) {
      byT3Fp[e.id] = e.source;
    }
    for (const sh of e.shingles || []) {
      if (!shingleIndex[sh]) shingleIndex[sh] = [];
      if (!shingleIndex[sh].includes(e.source)) shingleIndex[sh].push(e.source);
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries,
    byExactHash,
    byT3Fp,
    shingleIndex,
  };
}

/**
 * Candidatos por shingle overlap (prefilter barato).
 * @param {Set<string>} shingles
 * @param {object} index
 * @param {number} minShared minimum shared shingles to qualify
 */
export function shingleCandidates(shingles, index, minShared = 1) {
  const counts = new Map();
  for (const sh of shingles) {
    const sources = index.shingleIndex?.[sh] || [];
    for (const src of sources) {
      counts.set(src, (counts.get(src) || 0) + 1);
    }
  }
  const min = Math.max(minShared, Math.ceil(shingles.size * 0.2));
  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([src]) => src);
}
