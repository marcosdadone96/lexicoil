/**
 * balanceMcq.mjs
 *
 * Guarantees balanced letter distribution (a/b/c) in 3-option MCQ groups and
 * breaks consecutive same-letter runs — WITHOUT ever altering the text content
 * of any answer option, only their ORDER within the options array.
 *
 * ⚠️  ONLY applies to type === "multiple_choice" with exactly 3 options.
 *     richtig_falsch is never reordered here — chrono = evidence char offset in
 *     passages[0].text (see horenRfChronoEvidence.mjs). NOT audio-turn overlap.
 *     ja_nein may be reordered via shuffleKeyedQuestionOrder for key entropy.
 *     matching is untouched.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

/** Shared with js/engine/prompts/partPostprocess.js — do not fork regexes. */
const require = createRequire(import.meta.url);
const {
  resyncExplanationOptionLetter: resyncExplanationOptionLetterShared,
  alignExplanationOptionLetters,
  findExplanationOptionLetters,
} = require('../../js/engine/prompts/explanationOptionResync.js');

export const resyncExplanationOptionLetter = resyncExplanationOptionLetterShared;
export { alignExplanationOptionLetters, findExplanationOptionLetters };

/** Bump when letter-target / remainder / R-F shuffle policy changes (pool re-stamp). */
export const BALANCE_MCQ_VERSION = 'v1.2-no-rf-chrono-shuffle-2026-07-11';

const LETTERS = ['a', 'b', 'c'];
/**
 * Only ja_nein may be reordered for key entropy (Lesen T4 forum opinions).
 * richtig_falsch must keep chronological evidence order — Goethe Hören T3
 * follows dialogue chronology measured by char offset in passages[0].text
 * (horenRfChronoEvidence.mjs). Audio-turn token overlap is NOT the metric
 * (false-green risk). shuffleKeyedQuestionOrder used to break that (P0.3).
 */
const KEY_SHUFFLE_TYPES = new Set(['ja_nein']);

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

/**
 * Build n target letters with counts as even as possible (⌊n/3⌋ or ⌈n/3⌉),
 * then shuffle order with `seed`.
 *
 * When n % 3 ≠ 0, the remainder letter(s) used to always prefer `a` (then `b`)
 * because the greedy loop broke ties with LETTERS[0]. That made every N=4 part
 * → {a:2,b:1,c:1} and every N=5 part → {a:2,b:2,c:1}, biasing the whole pool.
 *
 * v1.1: rotate the tie-break order from `seed` so remainder cycles a→b→c across
 * parts while each individual part stays as balanced as N allows.
 */
export function buildBalancedLetterTargets(n, seed) {
  if (n <= 0) return [];
  const start = seedToInt(`${seed || '0'}:remainder`) % LETTERS.length;
  const order = [...LETTERS.slice(start), ...LETTERS.slice(0, start)];
  const counts = { a: 0, b: 0, c: 0 };
  const targets = [];
  for (let i = 0; i < n; i++) {
    let best = order[0];
    for (const l of order) {
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
 * Strip leading "a) " / "A) " label from an option string for body comparison.
 */
export function stripMcqOptionLabel(text) {
  return String(text || '').replace(/^[a-cA-C]\)\s*/, '').trim();
}

function mcqCorrectLetter(q) {
  const raw = String(q?.correct ?? q?.correctAnswer ?? '').toLowerCase().trim();
  return raw.replace(/[^a-c]/g, '').slice(0, 1) || '';
}

function optionBodies(q) {
  return (q.options || []).map(stripMcqOptionLabel);
}

function correctOptionBody(q) {
  const letter = mcqCorrectLetter(q);
  if (!letter || !Array.isArray(q.options) || q.options.length !== 3) return null;
  const idx = letter.charCodeAt(0) - 97;
  return stripMcqOptionLabel(q.options[idx]);
}

/**
 * Writer contract for balanceMcq / antiRuns (checked BEFORE the caller persists):
 *  (a) option body multiset unchanged (labels may move);
 *  (b) the option body marked correct after rotate is the same body that was correct before;
 *  (c) every "Option X" reference in explanation matches the post-rotate correct letter.
 *
 * @throws {Error} on any violation
 */
export function assertBalanceMcqWriterContract(beforeQuestions, afterQuestions, opts = {}) {
  const label = opts.label || 'balanceMcq';
  const before = beforeQuestions || [];
  const after = afterQuestions || [];
  if (before.length !== after.length) {
    throw new Error(`[${label}:contract] question count changed ${before.length}→${after.length}`);
  }

  for (let i = 0; i < before.length; i++) {
    const b = before[i];
    const a = after[i];
    if (b?.type !== 'multiple_choice' || !Array.isArray(b.options) || b.options.length !== 3) {
      continue;
    }
    if (!Array.isArray(a?.options) || a.options.length !== 3) {
      throw new Error(`[${label}:contract:a] q[${i}] options length changed`);
    }

    // (a) option bodies — same multiset
    const beforeBodies = optionBodies(b).slice().sort();
    const afterBodies = optionBodies(a).slice().sort();
    if (beforeBodies.join('\u0001') !== afterBodies.join('\u0001')) {
      throw new Error(
        `[${label}:contract:a] q[${i}] option texts changed (only order/labels allowed)\n` +
          `  before: ${JSON.stringify(beforeBodies)}\n` +
          `  after:  ${JSON.stringify(afterBodies)}`,
      );
    }

    // (b) correct body identity
    const beforeCorrect = correctOptionBody(b);
    const afterCorrect = correctOptionBody(a);
    if (beforeCorrect == null || afterCorrect == null) {
      throw new Error(`[${label}:contract:b] q[${i}] missing correct letter`);
    }
    if (beforeCorrect !== afterCorrect) {
      throw new Error(
        `[${label}:contract:b] q[${i}] correct option body drifted\n` +
          `  before(${mcqCorrectLetter(b)}): ${JSON.stringify(beforeCorrect)}\n` +
          `  after(${mcqCorrectLetter(a)}):  ${JSON.stringify(afterCorrect)}`,
      );
    }

    // (c) explanation letter refs match new correct
    const want = mcqCorrectLetter(a);
    const hits = findExplanationOptionLetters(String(a.explanation || ''));
    const desync = hits.filter((h) => h.letter !== want);
    if (desync.length) {
      throw new Error(
        `[${label}:contract:c] q[${i}] explanation letter desync (want ${want}): ` +
          desync.map((h) => h.match).join(', '),
      );
    }
  }
  return true;
}

/**
 * Rotate a single 3-option MCQ question so the correct answer lands at
 * `targetLetter` (one of "a", "b", "c").  Only the order of options[] changes;
 * every text string is preserved verbatim (the "a) " label prefix is updated).
 * Also resyncs explanation letter refs ("Option a)" / "Option a" / …) when present.
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

  const explanation = resyncExplanationOptionLetter(
    question.explanation,
    correctLetter,
    targetLetter,
  );

  return {
    ...question,
    options: newOptions,
    correct: targetLetter,
    correctAnswer: targetLetter,
    ...(explanation !== question.explanation ? { explanation } : {}),
  };
}

/**
 * balanceMcqGroup(questions, opts?)
 *
 * Assigns shuffled-but-balanced target letters to 3-option MCQ items so that
 * no letter exceeds ⌈N/3⌉ and (when N ≥ 3) all three letters appear — without
 * a fixed positional pattern like a,b,c,a,b,c across parts.
 *
 * Always runs assertBalanceMcqWriterContract before returning (opts.skipContract
 * only for internal tests that inject violations).
 */
export function balanceMcqGroup(questions, opts = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const before = questions.map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? [...q.options] : q.options,
  }));
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

  if (!opts.skipContract) {
    assertBalanceMcqWriterContract(before, result, { label: 'balanceMcqGroup' });
  }
  return result;
}

/**
 * Shuffle question order within (type, passageId) groups for ja_nein only
 * so positional key patterns differ per part. richtig_falsch is intentionally
 * NOT shuffled — order must stay chronological by char evidence in
 * passages[0].text (Hören T3; see horenRfChronoEvidence.mjs).
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
export function antiRuns(questions, runThreshold = 4, opts = {}) {
  if (!Array.isArray(questions) || questions.length < runThreshold) return questions;

  const before = questions.map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? [...q.options] : q.options,
  }));
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

  if (!opts.skipContract) {
    assertBalanceMcqWriterContract(before, result, { label: 'antiRuns' });
  }
  return result;
}
