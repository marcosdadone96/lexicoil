/** Client-side vocab quiz helpers (weakness weighting). */
const VocabQuizUtils = (function () {
  function weaknessScore(fc) {
    if (!fc) return 1;
    let s = 1 + (fc.missCount || 0) * 3;
    if (typeof isDue === 'function' && isDue(fc)) s += 2;
    if (!fc.interval || fc.interval <= 1) s += 1;
    return s;
  }

  function sortCardsByWeakness(cards) {
    return [...(cards || [])].sort((a, b) => {
      const d = weaknessScore(b) - weaknessScore(a);
      return d !== 0 ? d : String(a.word || '').localeCompare(String(b.word || ''));
    });
  }

  function buildWordMeta(pool, translationFn) {
    const trFn = translationFn || (typeof fcCardTranslation === 'function' ? fcCardTranslation : () => '');
    const norm = typeof normWordType === 'function' ? normWordType : (t) => t || 'other';
    return (pool || [])
      .map((fc) => ({
        word: String(fc.word || '').trim(),
        type: norm(fc.type || fc.pos),
        translation: trFn(fc),
        missCount: fc.missCount || 0,
        due: typeof isDue === 'function' ? isDue(fc) : false,
        interval: fc.interval,
      }))
      .filter((m) => m.word);
  }

  function weightedPickQuizTargets(pool, count) {
    const picked = [];
    const remaining = (pool || []).map((fc) => ({ fc, w: weaknessScore(fc) }));
    while (picked.length < count && remaining.length) {
      const total = remaining.reduce((s, r) => s + r.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < remaining.length; i++) {
        r -= remaining[i].w;
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      const [item] = remaining.splice(idx, 1);
      const word = String(item.fc.word || '').trim();
      if (word) picked.push(word);
    }
    return picked;
  }

  function normPos(type) {
    const t = String(type || 'other').toLowerCase().trim();
    if (['noun', 'verb', 'adjective', 'adverb'].includes(t)) return t;
    return 'other';
  }

  function finiteVerbStem(lemma) {
    const w = String(lemma || '').trim();
    if (!w || typeof VerbConjugation === 'undefined' || !VerbConjugation.getPresent) return null;
    const c = VerbConjugation.getPresent(w, 'de');
    if (!c?.forms?.er) return null;
    const er = String(c.forms.er).trim();
    return c.separable ? er.split(/\s+/)[0] : er;
  }

  function isSeparableLemma(word) {
    return (
      typeof SeparableResolve !== 'undefined' &&
      SeparableResolve.SEPARABLE_INFINITIVES &&
      SeparableResolve.SEPARABLE_INFINITIVES.has(String(word || '').trim().toLowerCase())
    );
  }

  function pickPhraseGapOptions(blankToken, targetWord, allMeta) {
    const blank = String(blankToken || '').trim();
    const target = String(targetWord || '').trim();
    if (!blank) return [];
    const targetPos = normPos((allMeta || []).find((m) => String(m.word || '').toLowerCase() === target.toLowerCase())?.type);
    const targetTr = String((allMeta || []).find((m) => String(m.word || '').toLowerCase() === target.toLowerCase())?.translation || '').trim().toLowerCase();
    const exclude = new Set([blank.toLowerCase(), target.toLowerCase()]);

    const separableGap = isSeparableLemma(target) && blank.toLowerCase() !== target.toLowerCase();
    if (separableGap) {
      const stems = new Set();
      for (const m of [...(allMeta || [])].sort(() => Math.random() - 0.5)) {
        if (normPos(m.type) !== 'verb') continue;
        const w = String(m.word || '').trim();
        if (!w || exclude.has(w.toLowerCase())) continue;
        const tr = String(m.translation || '').trim().toLowerCase();
        if (targetTr && tr && tr === targetTr) continue;
        const s = finiteVerbStem(w);
        if (!s || exclude.has(s.toLowerCase()) || s.toLowerCase() === blank.toLowerCase()) continue;
        stems.add(s);
        if (stems.size >= 3) break;
      }
      const opts = [blank, ...stems];
      return [...new Set(opts.map((o) => String(o).trim()).filter(Boolean))]
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);
    }

    let candidates = (allMeta || []).filter((m) => {
      const w = String(m.word || '').trim().toLowerCase();
      if (!w || exclude.has(w)) return false;
      if (targetPos !== 'other' && normPos(m.type) !== targetPos) return false;
      const tr = String(m.translation || '').trim().toLowerCase();
      if (targetTr && tr && tr === targetTr) return false;
      return true;
    });
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const distractors = shuffled.slice(0, 3).map((m) => m.word);
    let opts = [blank, ...distractors];
    opts = [...new Set(opts.map((o) => String(o).trim()).filter(Boolean))];
    while (opts.length < 4 && candidates.length > distractors.length) {
      const extra = candidates.find((m) => !opts.some((o) => o.toLowerCase() === String(m.word).toLowerCase()));
      if (!extra) break;
      opts.push(extra.word);
    }
    return opts.sort(() => Math.random() - 0.5).slice(0, 4);
  }

  return { weaknessScore, sortCardsByWeakness, buildWordMeta, weightedPickQuizTargets, normPos, pickPhraseGapOptions };
})();
