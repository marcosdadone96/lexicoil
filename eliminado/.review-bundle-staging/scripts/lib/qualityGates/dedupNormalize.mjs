/**
 * Normalización compartida para duplicateContentGate (Q1a).
 */

/** Minúsculas, colapsar espacios, quitar puntuación no alfanumérica (conserva äöüß). */
export function normalizeComparableText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zäöüß0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip MCQ / matching letter prefix: "A) foo" → "foo" */
export function stripOptionLetter(opt) {
  return String(opt || '').replace(/^[A-Ja-j]\)\s*/i, '').trim();
}

/**
 * Word shingles (n=5) for cheap prefilter.
 * @param {string} text normalized
 * @returns {Set<string>}
 */
export function wordShingles(text, n = 5) {
  const words = normalizeComparableText(text).split(/\s+/).filter((w) => w.length >= 3);
  const set = new Set();
  if (words.length < n) {
    if (words.length) set.add(words.join(' '));
    return set;
  }
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Jaccard similarity between two sets (0–1).
 */
export function jaccardSets(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
