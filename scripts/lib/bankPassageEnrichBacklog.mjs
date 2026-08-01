/**
 * Passages present in questions.json but not yet in passages.json / passageVocab.
 * Clear with enrich-bank-vocab-tags.mjs (content batch — post-gates plan).
 */
export const PASSAGE_VOCAB_ENRICH_BACKLOG = new Set([
  'gen-l5-ca10ed0e',
  'gen-p-h2-6f343804',
  'gen-l5-0bb98790',
]);

/** @param {Array<{ id?: string }>} passages */
export function bankPassagesExcludingEnrichBacklog(passages) {
  return (passages || []).filter((p) => p?.id && !PASSAGE_VOCAB_ENRICH_BACKLOG.has(p.id));
}
