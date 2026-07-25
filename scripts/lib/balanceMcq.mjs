/**
 * balanceMcq.mjs
 *
 * Guarantees balanced letter distribution (a/b/c) in 3-option MCQ groups and
 * breaks consecutive same-letter runs — WITHOUT ever altering the text content
 * of any answer option, only their ORDER within the options array.
 *
 * ⚠️  ONLY applies to type === "multiple_choice" with exactly 3 options.
 *     richtig_falsch, ja_nein and matching are intentionally untouched by
 *     balanceMcqGroup — use shuffleKeyedQuestionOrder for per-part key entropy.
 */

import crypto from 'node:crypto';

const LETTERS = ['a', 'b', 'c'];
const KEY_SHUFFLE_TYPES = new Set(['richtig_falsch', 'ja_nein']);

/** Deterministic seed string from question content (stable across re-normalize). */
export function derivePartShuffleSeed(questions) {
  const parts = (questions || []).map((q) =>
    [
      q.id,
      q.type,
      q.passageId,
      q.correct,
      q.question,
      q.signText,
      (q.options || []).join(';'),
    ].join('|'),
  );
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed) {
  const hex = String(seed || '0').replace(/[^0-9a-f]/gi, '').slice(0, 8);
  return parseInt(hex.padEnd(8, '0'), 16) >>> 0;
}

/** Fisher–Yates shuffle with deterministic PRNG. Returns a new array. */
export function seededShuffle(items, seed) {
  const out = [...items];
  const rand = mulberry32(seedToInt(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build n target letters with balanced a/b/c counts, then shuffle order. */
export function buildBalancedLetterTargets(n, seed) {
  if (n <= 0) return [];
  const counts = { a: 0, b: 0, c: 0 };
  const targets = [];
  for (let i = 0; i < n; i++) {
    let best = LETTERS[0];
    for (const l of LETTERS) {
      if (counts[l] < counts[best]) best = l;
    }
    targets.push(best);
    counts[best]++;
  }
  return seededShuffle(targets, seed);
}

/**
 * Canonical answer-key sequence for cross-part comparison (CHK-25).
 * @param {object[]} questions
 * @param {string} [typeFilter] - e.g. 'multiple_choice', 'ja_nein'
 */
export function answerKeySequence(questions, typeFilter) {
  const norm = (q) => {
    const c = String(q.correct ?? q.correctAnswer ?? '').trim();
    const t = String(q.type || '').toLowerCase();
    if (t === 'ja_nein') return /^j/i.test(c) ? 'ja' : 'nein';
    if (t === 'richtig_falsch') return /^r/i.test(c) ? 'richtig' : 'falsch';
    return c.toLowerCase().replace(/[^a-c]/g, '') || c.toLowerCase();
  };
  return (questions || [])
    .filter((q) => {
      if (!typeFilter) return true;
      const t = String(q.type || '').toLowerCase();
      if (typeFilter === 'multiple_choice') {
        return t === 'multiple_choice' || t === 'multiple' || t === 'mcq';
      }
      return t === typeFilter;
    })
    .map(norm)
    .join(',');
}

/**
 * Rotate a single 3-option MCQ question so the correct answer lands at
 * `targetLetter` (one of "a", "b", "c").  Only the order of options[] changes;
 * every text string is preserved verbatim (the "a) " label prefix is updated).
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

  const shift = ((correctIdx - targetIdx) + 3) % 3;
  const arr = opts.map((o, i) => ({ text: String(o), origIdx: i }));
  const rotated = [...arr.slice(shift), ...arr.slice(0, shift)];

  const newOptions = rotated.map(({ text }, i) => {
    const letter = String.fromCharCode(97 + i);
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
 * balanceMcqGroup(questions, opts?)
 *
 * Assigns shuffled-but-balanced target letters to 3-option MCQ items so that
 * no letter exceeds ⌈N/3⌉ and (when N ≥ 3) all three letters appear — without
 * a fixed positional pattern like a,b,c,a,b,c across parts.
 */
export function balanceMcqGroup(questions, opts = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const result = questions.map((q) => ({ ...q }));
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

  const seed = opts.seed ?? derivePartShuffleSeed(questions);
  const targets = buildBalancedLetterTargets(mcqIndices.length, `${seed}:mcq`);

  mcqIndices.forEach((qIdx, rank) => {
    result[qIdx] = rotateToTarget(result[qIdx], targets[rank]);
  });

  return result;
}

/**
 * Shuffle question order within (type, passageId) groups for richtig_falsch /
 * ja_nein so positional key patterns differ per part without changing semantics.
 */
export function shuffleKeyedQuestionOrder(questions, opts = {}) {
  if (!Array.isArray(questions) || questions.length < 2) return questions;

  const result = questions.map((q) => ({ ...q }));
  const seedBase = opts.seed ?? derivePartShuffleSeed(questions);
  const groups = new Map();

  for (let i = 0; i < result.length; i++) {
    const q = result[i];
    if (!KEY_SHUFFLE_TYPES.has(q.type)) continue;
    const gkey = `${q.type}:${q.passageId || '_'}`;
    if (!groups.has(gkey)) groups.set(gkey, []);
    groups.get(gkey).push(i);
  }

  for (const [gkey, indices] of groups) {
    if (indices.length < 2) continue;
    const qs = indices.map((i) => result[i]);
    const shuffledQs = seededShuffle(qs, `${seedBase}:${gkey}`);
    indices.forEach((idx, rank) => {
      result[idx] = shuffledQs[rank];
    });
  }

  return result;
}

/**
 * antiRuns(questions, runThreshold = 4)
 *
 * Detects runs of ≥ `runThreshold` consecutive identical correct answers in the
 * MCQ subsequence and breaks them by rotating the middle item.
 */
export function antiRuns(questions, runThreshold = 4) {
  if (!Array.isArray(questions) || questions.length < runThreshold) return questions;

  const result = questions.map((q) => ({ ...q }));
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
      const midRank = Math.floor((start + end) / 2);
      const midQIdx = mcqIndices[midRank];
      const alternatives = LETTERS.filter((l) => l !== letter);
      const newLetter = alternatives[midRank % alternatives.length];
      result[midQIdx] = rotateToTarget(result[midQIdx], newLetter);
    }
    start = end + 1;
  }

  return result;
}
