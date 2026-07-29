'use strict';

const { resolveFromRoot } = require('./projectRoot.js');

let SeparableResolve;
let Lemmatizer;
let VerbConjugation;

function loadDeps() {
  if (!SeparableResolve) {
    SeparableResolve = require(resolveFromRoot('js', 'engine', 'separableResolve.js'));
  }
  try {
    if (!Lemmatizer) {
      Lemmatizer = require(resolveFromRoot('js', 'engine', 'lemmatizer.js'));
    }
  } catch (_) {
    Lemmatizer = null;
  }
  try {
    if (!VerbConjugation) {
      global.SeparableResolve = SeparableResolve;
      VerbConjugation = require(resolveFromRoot('js', 'data', 'verbConjugation.js'));
    }
  } catch (_) {
    VerbConjugation = null;
  }
}

function normLemma(word, lang) {
  loadDeps();
  const low = String(word || '').toLowerCase().trim();
  if (!low) return '';
  if (lang === 'de') {
    const sep = SeparableResolve.resolveSeparableFiniteToInfinitive(low);
    if (sep) return sep;
    if (VerbConjugation && VerbConjugation.toLemma) {
      const v = VerbConjugation.toLemma(low, 'de');
      if (v) return String(v).toLowerCase();
    }
    if (Lemmatizer && Lemmatizer.normalizeLemma) {
      const l = Lemmatizer.normalizeLemma(low, 'de');
      if (l) return String(l).toLowerCase();
    }
  }
  return low;
}

function collectPassageLemmas(passage, lang) {
  loadDeps();
  const tokens = SeparableResolve.tokenize(passage);
  const lemmas = new Set();
  for (const pair of SeparableResolve.findSplitPairs(tokens)) {
    if (pair.lemma) lemmas.add(String(pair.lemma).toLowerCase());
  }
  for (const t of tokens) {
    if (SeparableResolve.isBreakToken(t)) continue;
    const sep = SeparableResolve.resolveSeparableFiniteToInfinitive(t);
    if (sep) lemmas.add(sep);
    lemmas.add(normLemma(t, lang));
    lemmas.add(String(t).toLowerCase());
  }
  return lemmas;
}

function targetAppearsInPassage(targetWord, passage, lang) {
  const target = normLemma(targetWord, lang);
  const raw = String(targetWord || '').toLowerCase().trim();
  if (!target && !raw) return false;
  const lemmas = collectPassageLemmas(passage, lang);
  if (lemmas.has(target) || lemmas.has(raw)) return true;
  return false;
}

function detectAppearedWords(targetWords, passage, lang) {
  const uniq = [...new Set((targetWords || []).map((w) => String(w || '').trim()).filter(Boolean))];
  const appeared = [];
  const absent = [];
  for (const w of uniq) {
    if (targetAppearsInPassage(w, passage, lang)) appeared.push(w);
    else absent.push(w);
  }
  return { appeared, absent, all: uniq };
}

function scoreListeningRound(round, selected) {
  const sel = new Set(
    (selected || []).map((w) => String(w || '').trim()).filter(Boolean),
  );
  const appearedSet = new Set(round.appeared || []);
  const detail = (round.displayWords || round.all || []).map((w) => {
    const wasPlayed = appearedSet.has(w);
    const marked = sel.has(w);
    let kind;
    if (wasPlayed && marked) kind = 'hit';
    else if (wasPlayed && !marked) kind = 'missed';
    else if (!wasPlayed && marked) kind = 'falseAlarm';
    else kind = 'correctReject';
    return { word: w, wasPlayed, marked, correct: wasPlayed === marked, kind };
  });
  const correct = detail.filter((d) => d.correct).length;
  return {
    total: detail.length,
    correct,
    ratio: detail.length ? correct / detail.length : 0,
    heard: round.appeared || [],
    missing: round.absent || [],
    missedByUser: detail.filter((d) => d.kind === 'missed').map((d) => d.word),
    falseAlarms: detail.filter((d) => d.kind === 'falseAlarm').map((d) => d.word),
    detail,
  };
}

function pickWordsForPassage(words, opts = {}) {
  const uniq = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
  const ratio = typeof opts.ratio === 'number' ? opts.ratio : 0.65;
  const rng = opts.rng || Math.random;
  const shuffled = [...uniq].sort(() => rng() - 0.5);
  if (shuffled.length <= 2) return shuffled;
  let k = Math.max(2, Math.min(shuffled.length - 1, Math.round(ratio * shuffled.length)));
  return shuffled.slice(0, k);
}

/** AI listening session — keep in sync with product copy (2 credits / session). */
const LISTENING_AI_ROUND_COUNT = 3;
const LISTENING_POOL_MAX = 6;
const LISTENING_PASSAGE_MIN_CHARS = 40;
const LISTENING_PASSAGE_MAX_CHARS = 520;
const LISTENING_MIN_APPEARED = 2;

function wordCount(passage) {
  return String(passage || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Quality gate before a round counts toward billing (exam-adjacent content). */
function validateListeningPassage(passage, targetWords, lang, level) {
  const text = String(passage || '').trim();
  if (!text || text.length < LISTENING_PASSAGE_MIN_CHARS) {
    return { ok: false, reason: 'passage_too_short' };
  }
  if (text.length > LISTENING_PASSAGE_MAX_CHARS) {
    return { ok: false, reason: 'passage_too_long' };
  }
  const wc = wordCount(text);
  if (wc < 18 || wc > 90) {
    return { ok: false, reason: 'passage_word_count' };
  }
  if (/[<>{}\[\]]/.test(text)) {
    return { ok: false, reason: 'passage_markup' };
  }
  const pool = [...new Set((targetWords || []).map((w) => String(w || '').trim()).filter(Boolean))].slice(
    0,
    LISTENING_POOL_MAX,
  );
  if (pool.length < 2) {
    return { ok: false, reason: 'pool_too_small' };
  }
  const detected = detectAppearedWords(pool, text, lang);
  if (detected.appeared.length < LISTENING_MIN_APPEARED) {
    return { ok: false, reason: 'passage_missing_words' };
  }
  const lv = String(level || 'B1').toUpperCase();
  if (lang === 'de' && lv === 'A2' && wc > 70) {
    return { ok: false, reason: 'level_too_advanced' };
  }
  return { ok: true, detected };
}

/** Bill only when every planned AI round passed validation (deferred billing). */
function shouldBillListeningAiSession(generatedRounds, expectedCount = LISTENING_AI_ROUND_COUNT) {
  const n = Number(expectedCount) || LISTENING_AI_ROUND_COUNT;
  return (
    Array.isArray(generatedRounds) &&
    generatedRounds.length === n &&
    generatedRounds.every((r) => r && r.valid === true)
  );
}

function pickWeaveForRound(words, roundIndex, roundCount, rng) {
  const uniq = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))].slice(
    0,
    LISTENING_POOL_MAX,
  );
  const seed = typeof rng === 'function' ? rng : Math.random;
  const shuffled = [...uniq].sort(() => seed() - 0.5 + roundIndex * 0.01);
  const ratio = roundCount <= 2 ? 0.55 : 0.5;
  return pickWordsForPassage(shuffled, { ratio, rng: seed });
}

/** Dev-only passages when ALLOW_LISTENING_E2E + LISTENING_E2E_FIXTURE (real TTS + billing). */
function listeningE2ePassageForRound(words, roundIndex) {
  const w = [...new Set((words || []).map((x) => String(x || '').trim()).filter(Boolean))].slice(
    0,
    LISTENING_POOL_MAX,
  );
  const pick = (i) => w[i % w.length] || 'Alltag';
  const r = Number(roundIndex) || 0;
  const blocks = [
    `Gestern im ${pick(1)} war viel los. Wir sprechen über ${pick(0)} und ${pick(2)}. Am Nachmittag planen wir etwas Neues, essen zusammen und gehen spazieren. Das Wetter war ruhig und angenehm.`,
    `Heute früh stehe ich auf und denke an ${pick(3)}. Meine Freundin schlägt vor, dass wir ${pick(4)} üben. Im ${pick(1)} arbeiten wir bis zum Abend und trinken Kaffee.`,
    `Am Wochenende ist das ${pick(0)} wichtig. Wir lernen über ${pick(2)} und ${pick(5)}. Danach essen wir zu Mittag, telefonieren kurz und machen einen Spaziergang in der Stadt.`,
  ];
  return blocks[r % blocks.length];
}

module.exports = {
  normLemma,
  collectPassageLemmas,
  targetAppearsInPassage,
  detectAppearedWords,
  scoreListeningRound,
  pickWordsForPassage,
  LISTENING_AI_ROUND_COUNT,
  LISTENING_POOL_MAX,
  validateListeningPassage,
  shouldBillListeningAiSession,
  pickWeaveForRound,
  listeningE2ePassageForRound,
};
