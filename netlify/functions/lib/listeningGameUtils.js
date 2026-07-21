'use strict';

const path = require('path');

let SeparableResolve;
let Lemmatizer;
let VerbConjugation;

function loadDeps() {
  if (!SeparableResolve) {
    const sepPath = path.join(__dirname, '../../../js/engine/separableResolve.js');
    SeparableResolve = require(sepPath);
  }
  try {
    if (!Lemmatizer) {
      Lemmatizer = require(path.join(__dirname, '../../../js/engine/lemmatizer.js'));
    }
  } catch (_) {
    Lemmatizer = null;
  }
  try {
    if (!VerbConjugation) {
      global.SeparableResolve = SeparableResolve;
      VerbConjugation = require(path.join(__dirname, '../../../js/data/verbConjugation.js'));
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

module.exports = {
  normLemma,
  collectPassageLemmas,
  targetAppearsInPassage,
  detectAppearedWords,
  scoreListeningRound,
  pickWordsForPassage,
};
