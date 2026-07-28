/**
 * Personal Lesen/Hören pool — vocabulary visibility contract (Phase B).
 */
const PersonalPoolVocabGate = Object.freeze({
  /** Minimum distinct user lemmas that must appear in the assembled module text. */
  PERSONAL_VOCAB_MIN_VISIBLE: 3,
  /** UI minimum selection (Phase A). */
  PERSONAL_VOCAB_MIN_SELECT: 4,
  TOP_K_CANDIDATES: 15,
  PER_TEIL_SEARCH_BRANCH: 8,
});

if (typeof module !== 'undefined') module.exports = PersonalPoolVocabGate;
if (typeof window !== 'undefined') window.PersonalPoolVocabGate = PersonalPoolVocabGate;
