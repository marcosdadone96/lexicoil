/**
 * Browser listening-game helpers — morphological word-in-passage detection.
 */
const ListeningGameUtils = (function () {
  function normLemma(word, lang) {
    const low = String(word || '').toLowerCase().trim();
    if (!low) return '';
    const lg = String(lang || 'de').slice(0, 2);
    if (lg === 'de' && typeof SeparableResolve !== 'undefined') {
      const sep = SeparableResolve.resolveSeparableFiniteToInfinitive(low);
      if (sep) return sep;
    }
    if (typeof VerbConjugation !== 'undefined' && VerbConjugation.toLemma) {
      const v = VerbConjugation.toLemma(low, lg);
      if (v) return String(v).toLowerCase();
    }
    if (typeof Lemmatizer !== 'undefined' && Lemmatizer.normalizeLemma) {
      const l = Lemmatizer.normalizeLemma(low, lg);
      if (l) return String(l).toLowerCase();
    }
    return low;
  }

  function collectPassageLemmas(passage, lang) {
    if (typeof SeparableResolve === 'undefined') {
      return new Set(String(passage || '').toLowerCase().split(/\s+/));
    }
    const tokens = SeparableResolve.tokenize(passage);
    const lemmas = new Set();
    if (SeparableResolve.findSplitPairs) {
      for (const pair of SeparableResolve.findSplitPairs(tokens)) {
        if (pair.lemma) lemmas.add(String(pair.lemma).toLowerCase());
      }
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
    const lemmas = collectPassageLemmas(passage, lang);
    return lemmas.has(target) || lemmas.has(raw);
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
    const sel = new Set((selected || []).map((w) => String(w || '').trim()).filter(Boolean));
    const appearedSet = new Set(round.appeared || []);
    const display = round.displayWords || round.all || [];
    const detail = display.map((w) => {
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

  return {
    normLemma,
    targetAppearsInPassage,
    detectAppearedWords,
    scoreListeningRound,
  };
})();
