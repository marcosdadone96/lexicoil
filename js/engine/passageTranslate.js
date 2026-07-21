/**
 * Full passage translation limits (Lesen/Hören practice toolbar).
 * Word-level vocab cache must NOT handle text above PASSAGE_WORD_LOOKUP_MAX.
 */
(function (factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PassageTranslate = api;
  }
})(function passageTranslateFactory() {
  /** Above this length, text is a passage — use AI passage path, not word gloss cache. */
  const PASSAGE_WORD_LOOKUP_MAX = 120;

  /** Pool worst case: lesen-t5-gemini-013 ≈ 2004 DE chars → ~1100 EN output tokens + headroom. */
  const PASSAGE_OUTPUT_TOKEN_MIN = 1200;
  const PASSAGE_OUTPUT_TOKEN_MAX = 4096;
  const PASSAGE_OUTPUT_TOKEN_RATIO = 0.55;

  function isPassageText(text) {
    return String(text || '').trim().length > PASSAGE_WORD_LOOKUP_MAX;
  }

  function passageOutputMaxTokens(charCount) {
    const n = Math.max(0, Number(charCount) || 0);
    return Math.min(
      PASSAGE_OUTPUT_TOKEN_MAX,
      Math.max(PASSAGE_OUTPUT_TOKEN_MIN, Math.ceil(n * PASSAGE_OUTPUT_TOKEN_RATIO)),
    );
  }

  /**
   * Reject word-gloss cache hits (≈200 chars) and other truncated translations for long sources.
   */
  function isCompletePassageTranslation(source, translation) {
    const src = String(source || '').trim();
    const tr = String(translation || '').trim();
    if (!src || !tr) return false;
    if (!isPassageText(src)) return tr.length > 0;
    if (tr.length < 80) return false;
    if (!/[.!?]$/.test(tr) && tr.length < src.length * 0.55) return false;
    return tr.length >= src.length * 0.42;
  }

  function buildPassagePrompt(text, from, to) {
    const langNames = { de: 'German', en: 'English', es: 'Spanish', fr: 'French', it: 'Italian' };
    const src = langNames[from] || from;
    const tgt = langNames[to] || to;
    return `Translate the following ${src} exam reading passage into ${tgt}.

Rules:
- Return ONLY the full translation.
- Preserve all paragraph breaks and line breaks from the source.
- Translate every sentence completely; do not stop mid-sentence.
- No notes, no quotes around the whole text.

Source passage:

${String(text || '').trim()}`;
  }

  return {
    PASSAGE_WORD_LOOKUP_MAX,
    PASSAGE_OUTPUT_TOKEN_MIN,
    PASSAGE_OUTPUT_TOKEN_MAX,
    isPassageText,
    passageOutputMaxTokens,
    isCompletePassageTranslation,
    buildPassagePrompt,
  };
});
