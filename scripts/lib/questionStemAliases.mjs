/**
 * Canonical question-stem resolution for Gemini batch JSON.
 *
 * Corpus audit 2026-07-31 (batches/generated + .rejected + seed + pool-verified):
 * 1670 files, 1295 Lesen T4 question rows. When `question` is empty, only aliases
 * `text` (155 rows) and `questionText` (10 rows) appear — no statement/prompt/stem/etc.
 * `signText` is excluded: B1 T4 opinion field, not the matching enunciado.
 */
export const QUESTION_STEM_FIELD_ALIASES = ['question', 'text', 'questionText', 'statement'];

/** First non-empty stem among known Gemini aliases (excludes signText). */
export function resolveQuestionStem(q) {
  if (!q || typeof q !== 'object') return '';
  for (const key of QUESTION_STEM_FIELD_ALIASES) {
    const v = q[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Backfill canonical `question` from alias fields when absent. Mutates q. */
export function backfillCanonicalQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  if (String(q.question || '').trim()) return q;
  const stem = resolveQuestionStem(q);
  if (stem) q.question = stem;
  return q;
}
