/**
 * Semantic deduplication for generated batches.
 *
 * Uses Jaccard similarity on content tokens (nouns, verbs ≥4 chars).
 * Compares each new passage against an in-memory corpus of existing passages.
 *
 * Usage:
 *   const corpus = buildCorpus(existingBatches);   // built once
 *   const result = checkDuplicate(newBatch, corpus, { threshold: 0.55 });
 *   if (!result.ok) console.log(result.issues);
 */

const STOPWORDS = new Set([
  'sein', 'haben', 'werden', 'können', 'müssen', 'sollen', 'dürfen', 'wollen', 'mögen',
  'auch', 'aber', 'oder', 'und', 'dass', 'weil', 'wenn', 'dann', 'noch', 'schon',
  'sehr', 'mehr', 'viel', 'alle', 'eine', 'einer', 'einen', 'einem', 'eines',
  'dieser', 'diese', 'dieses', 'diesem', 'diesen', 'welche', 'welchen', 'welcher',
  'nicht', 'kein', 'keine', 'keinen', 'nach', 'über', 'unter', 'zwischen', 'durch',
  'damit', 'dabei', 'dazu', 'daran', 'darauf', 'davon', 'dafür', 'daher', 'darum',
  'immer', 'often', 'gibt', 'gibt', 'wird', 'wurde', 'worden', 'haben', 'hatte',
  'sind', 'waren', 'sein', 'beim', 'ihrer', 'ihrem', 'ihren', 'ihres',
  'jedoch', 'sowohl', 'sowie', 'zudem', 'dabei', 'bereits', 'insgesamt', 'besonders',
]);

/** Extract significant content tokens from a text string. */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Jaccard similarity between two token sets (0–1). */
export function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setB) {
    if (setA.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Normalized text for exact-match hash comparison. */
function normalizeForHash(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zäöüß0-9 ]/gi, '')
    .trim();
}

/** Extract a fingerprint string from a passage (title + first 60 tokens). */
function passageFingerprint(passage) {
  const text = `${passage.title || ''} ${passage.text || ''}`;
  return tokenize(text).slice(0, 60);
}

/**
 * Build a corpus index from an array of batches.
 * Each entry: { id, module, teil, tokens, hash, preview }
 */
export function buildCorpus(batches) {
  const entries = [];
  for (const batch of batches) {
    for (const p of batch.passages || []) {
      if (!p.text || p.text.length < 50) continue;
      const tokens = passageFingerprint(p);
      // Store normalized hash for exact-match pre-filter (catches Jaccard=1.0)
      const hash = normalizeForHash(`${p.title || ''} ${(p.text || '').slice(0, 200)}`);
      entries.push({
        id: p.id || '?',
        module: p.module || batch.module || '?',
        teil: p.teil ?? batch.teil ?? '?',
        tokens,
        hash,
        preview: String(p.title || p.text || '').slice(0, 60),
      });
    }
  }
  return entries;
}

/**
 * Check whether any passage in `newBatch` is too similar to something in `corpus`.
 *
 * @param {object} newBatch
 * @param {Array}  corpus  — built by buildCorpus()
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.55]  — Jaccard threshold above which it's a duplicate
 * @returns {{ ok: boolean, issues: string[], warnings: string[], pairs: Array }}
 */
/**
 * Check whether any passage in `newBatch` is too similar to something in `corpus`.
 *
 * Uses two-tier approach:
 *   1. Exact-match hash (catches Jaccard=1.0 / identical passages)
 *   2. Jaccard similarity (configurable threshold, default lowered to 0.40 per audit I2)
 *
 * @param {object} newBatch
 * @param {Array}  corpus  — built by buildCorpus()
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.40]  — Jaccard threshold above which it's a duplicate
 * @returns {{ ok: boolean, issues: string[], warnings: string[], pairs: Array }}
 */
export function checkDuplicate(newBatch, corpus, { threshold = 0.40 } = {}) {
  const issues = [];
  const warnings = [];
  const pairs = [];

  for (const p of newBatch.passages || []) {
    if (!p.text || p.text.length < 50) continue;
    const newTokens = passageFingerprint(p);
    // Pre-compute exact hash for tier-1 check
    const newHash = normalizeForHash(`${p.title || ''} ${(p.text || '').slice(0, 200)}`);
    let maxSim = 0;
    let bestMatch = null;

    for (const entry of corpus) {
      // Tier 1: exact hash → immediate duplicate (Jaccard ≈ 1.0)
      if (newHash && entry.hash && newHash === entry.hash) {
        issues.push(
          `Pasaje «${String(p.title || p.id).slice(0, 40)}» es IDÉNTICO ` +
          `al existente «${entry.preview}» (hash exacto)`,
        );
        pairs.push({ newId: p.id, matchId: entry.id, similarity: 1.0, exact: true });
        maxSim = 1.0;
        bestMatch = null; // already reported
        break;
      }
      // Tier 2: Jaccard
      const sim = jaccardSimilarity(newTokens, entry.tokens);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = entry;
      }
    }

    if (maxSim >= 1.0) continue; // already reported as exact duplicate

    const pct = Math.round(maxSim * 100);
    if (bestMatch && maxSim >= threshold) {
      issues.push(
        `Pasaje «${String(p.title || p.id).slice(0, 40)}» demasiado similar ` +
        `al existente «${bestMatch.preview}» (similitud=${pct}%, umbral=${Math.round(threshold * 100)}%)`,
      );
      pairs.push({ newId: p.id, matchId: bestMatch.id, similarity: maxSim });
    } else if (bestMatch && maxSim >= threshold * 0.75) {
      warnings.push(
        `Pasaje «${String(p.title || p.id).slice(0, 40)}» similar en ${pct}% ` +
        `a «${bestMatch.preview}» (por debajo del umbral, vigilar)`,
      );
    }
  }

  return { ok: issues.length === 0, issues, warnings, pairs };
}

/**
 * Synchronous version for use in mjs pipeline (no top-level await needed).
 * Pass `fs` and `path` explicitly.
 */
export function buildCorpusFromDirSync(dir, fs, path) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
  const batches = [];
  for (const f of files) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      batches.push(b);
    } catch {
      // skip malformed
    }
  }
  return buildCorpus(batches);
}
