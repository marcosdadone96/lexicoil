/**
 * balanceMcq.mjs
 *
 * Guarantees balanced letter distribution (a/b/c) in 3-option MCQ groups and
 * breaks consecutive same-letter runs — WITHOUT ever altering the text content
 * of any answer option, only their ORDER within the options array.
 *
 * ⚠️  ONLY applies to type === "multiple_choice" with exactly 3 options.
 *     richtig_falsch, ja_nein and matching are intentionally untouched.
 */

/**
 * Rotate a single 3-option MCQ question so the correct answer lands at
 * `targetLetter` (one of "a", "b", "c").  Only the order of options[] changes;
 * every text string is preserved verbatim (the "a) " label prefix is updated).
 *
 * Returns the question unchanged if:
 *  - options length ≠ 3
 *  - correct letter is not in [a,b,c]
 *  - targetLetter is not in [a,b,c]
 *  - rotation is already in place
 */
function rotateToTarget(question, targetLetter) {
  const opts = question.options;
  if (!Array.isArray(opts) || opts.length !== 3) return question;

  const correctRaw = String(question.correct || '').toLowerCase().trim();
  const correctLetter = correctRaw.replace(/[^a-c]/g, '').slice(0, 1);
  const correctIdx = correctLetter ? correctLetter.charCodeAt(0) - 97 : -1;
  const targetIdx = targetLetter.charCodeAt(0) - 97;

  if (correctIdx < 0 || correctIdx >= 3 || targetIdx < 0 || targetIdx >= 3) {
    return question;
  }
  if (correctIdx === targetIdx) return question;

  // Rotate left by `shift` so correctIdx moves to targetIdx
  const shift = ((correctIdx - targetIdx) + 3) % 3;

  // Preserve original objects; only rotate positions
  const arr = opts.map((o, i) => ({ text: String(o), origIdx: i }));
  const rotated = [...arr.slice(shift), ...arr.slice(0, shift)];

  const newOptions = rotated.map(({ text }, i) => {
    const letter = String.fromCharCode(97 + i);
    // Replace the leading "a) " / "b) " / "c) " label if present
    return text.replace(/^[a-cA-C]\)\s*/, `${letter}) `);
  });

  return {
    ...question,
    options: newOptions,
    correct: targetLetter,
    correctAnswer: targetLetter,
  };
}

/**
 * balanceMcqGroup(questions)
 *
 * Takes the full questions array of a batch, identifies all 3-option MCQ items,
 * and assigns target letters cycling through a→b→c so that:
 *  - every letter appears at least once (when N ≥ 3)
 *  - no letter exceeds ⌈N/3⌉ occurrences (≤ 55% for any realistic batch size)
 *
 * Non-MCQ questions (richtig_falsch, ja_nein, matching…) pass through unchanged.
 * Returns a NEW array (original is not mutated).
 */
export function balanceMcqGroup(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const result = questions.map((q) => ({ ...q }));

  // Collect indices of 3-option MCQ items in order
  const mcqIndices = [];
  for (let i = 0; i < result.length; i++) {
    const q = result[i];
    if (
      q.type === 'multiple_choice' &&
      Array.isArray(q.options) &&
      q.options.length === 3
    ) {
      mcqIndices.push(i);
    }
  }

  if (mcqIndices.length === 0) return result;

  // Assign target letters: rank 0→a, 1→b, 2→c, 3→a, …
  mcqIndices.forEach((qIdx, rank) => {
    const targetLetter = String.fromCharCode(97 + (rank % 3));
    result[qIdx] = rotateToTarget(result[qIdx], targetLetter);
  });

  return result;
}

/**
 * antiRuns(questions, runThreshold = 4)
 *
 * Detects runs of ≥ `runThreshold` consecutive identical correct answers in the
 * MCQ subsequence of the batch and rotates the MIDDLE element of each run to a
 * different letter, breaking the run.
 *
 * Should be called AFTER balanceMcqGroup (in practice the cycling assignment
 * already prevents runs, but this is a defensive safety net).
 *
 * Non-MCQ questions are ignored (and do not count as part of a run).
 * Returns a NEW array.
 */
export function antiRuns(questions, runThreshold = 4) {
  if (!Array.isArray(questions) || questions.length < runThreshold) return questions;

  const result = questions.map((q) => ({ ...q }));

  // Build a view of only the MCQ items (by their index in result)
  const mcqIndices = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i].type === 'multiple_choice') mcqIndices.push(i);
  }
  if (mcqIndices.length < runThreshold) return result;

  let start = 0;
  while (start < mcqIndices.length) {
    const letter = String(result[mcqIndices[start]].correct || '').toLowerCase().slice(0, 1);
    let end = start;
    while (
      end + 1 < mcqIndices.length &&
      String(result[mcqIndices[end + 1]].correct || '').toLowerCase().slice(0, 1) === letter
    ) {
      end++;
    }
    const runLen = end - start + 1;
    if (runLen >= runThreshold) {
      // Break at the midpoint: assign it the "next" letter in cycle
      const midRank = Math.floor((start + end) / 2);
      const midQIdx = mcqIndices[midRank];
      const alternatives = ['a', 'b', 'c'].filter((l) => l !== letter);
      // Use the midRank to deterministically pick one of the two alternatives
      const newLetter = alternatives[midRank % alternatives.length];
      result[midQIdx] = rotateToTarget(result[midQIdx], newLetter);
    }
    start = end + 1;
  }

  return result;
}
