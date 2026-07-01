/**
 * normalizeT3.mjs
 *
 * Lightweight normalization for Lesen Teil 3 (ads-matching) batches.
 *
 * ⚠️  ARCHITECTURE NOTE:
 *   The canonical storage format keeps the shared A-J announcement list duplicated
 *   in options[] on every question. The runtime (js/library/adsMatching.js) builds
 *   part.ads from question.options[]. Therefore this normalizer MUST NOT empty options[],
 *   create sharedOptions, or move the list to part.text.
 *
 * What this normalizer does (safe, non-breaking):
 *   1. Ensures `correct` is uppercase (A-J or "0").
 *   2. Sets `correctAnswer` = `correct` (often missing or null in generated batches).
 *   3. Sets `type` = "matching" on every L3 item that has options.length >= 5.
 *   4. Canonicalizes the options[] array to a single whitespace-normalised form:
 *      if all items already carry the same A-J list (modulo whitespace), unifies them
 *      to the first item's cleaned version. If they differ in content, leaves them
 *      untouched (CHK-17 will correctly flag as per-item-real).
 *
 * Items with options.length <= 3 (MCQ A2 format) are left completely unchanged.
 */

/** Normalize whitespace in a single option string without changing content. */
function canonLine(s) {
  return String(s).trim().replace(/\s+/g, ' ');
}

/**
 * normalizeT3(batch)
 *
 * Returns a new batch object (original not mutated) with Lesen Teil 3 questions
 * normalized to the canonical matching format.
 */
export function normalizeT3(batch) {
  if (!batch || !Array.isArray(batch.questions)) return batch;

  const questions = batch.questions.map((q) => ({ ...q }));

  const t3Indices = [];
  for (let i = 0; i < questions.length; i++) {
    if (
      String(questions[i].module || '').toLowerCase() === 'lesen' &&
      Number(questions[i].teil) === 3
    ) {
      t3Indices.push(i);
    }
  }

  if (t3Indices.length === 0) return batch;

  // Separate matching candidates (options.length >= 5) from MCQ-A2 pass-throughs
  const matchingIndices = t3Indices.filter(
    (i) => Array.isArray(questions[i].options) && questions[i].options.length >= 5,
  );

  // ── Step 1: canonicalize shared A-J list (whitespace only) ──
  if (matchingIndices.length >= 1) {
    const refOpts = questions[matchingIndices[0]].options.map(canonLine);
    const allSameContent = matchingIndices.every((i) => {
      const opts = questions[i].options;
      if (opts.length !== refOpts.length) return false;
      return opts.every((o, j) => canonLine(o) === refOpts[j]);
    });

    if (allSameContent) {
      // All items share the same list — unify to canonical whitespace form
      for (const i of matchingIndices) {
        questions[i] = { ...questions[i], options: refOpts };
      }
    }
    // If NOT allSameContent → real per-item differences, leave untouched
  }

  // ── Step 2: per-item field normalization (type, correct, correctAnswer) ──
  for (const i of matchingIndices) {
    const q = questions[i];

    // Uppercase correct (A-J → A-J, 0 → 0, a → A, etc.)
    const rawCorrect = String(q.correct ?? q.correctAnswer ?? '').trim();
    const normalized = rawCorrect === '0' ? '0' : rawCorrect.toUpperCase();

    questions[i] = {
      ...q,
      type: 'matching',
      correct: normalized,
      correctAnswer: normalized,
    };
  }

  return { ...batch, questions };
}
