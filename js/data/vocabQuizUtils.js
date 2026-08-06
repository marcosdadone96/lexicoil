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

  function metaByWord(allMeta) {
    const map = new Map();
    (allMeta || []).forEach((m) => {
      const w = String(m.word || '').trim().toLowerCase();
      if (w) map.set(w, m);
    });
    return map;
  }

  function shuffleInPlace(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickBalancedDistractors(targetWord, allMeta, needCount, excludeWords = [], rng = Math.random) {
    const target = String(targetWord || '').trim().toLowerCase();
    const byWord = metaByWord(allMeta);
    const targetMeta = byWord.get(target);
    const targetTr = String(targetMeta?.translation || '').trim().toLowerCase();
    const targetPos = normPos(targetMeta?.type);
    const exclude = new Set(excludeWords.map((w) => String(w || '').trim().toLowerCase()));
    exclude.add(target);
    let candidates = (allMeta || []).filter((m) => {
      const w = String(m.word || '').trim().toLowerCase();
      if (!w || exclude.has(w)) return false;
      const tr = String(m.translation || '').trim().toLowerCase();
      if (targetTr && tr && tr === targetTr) return false;
      return true;
    });
    const samePos = candidates.filter((m) => normPos(m.type) === targetPos && targetPos !== 'other');
    const pool = samePos.length >= needCount ? samePos : candidates;
    return shuffleInPlace([...pool], rng).slice(0, needCount).map((m) => m.word);
  }

  function repairQuizOptions(targetWord, options, allMeta, rng = Math.random) {
    const target = String(targetWord || '').trim();
    const wordSet = new Set((allMeta || []).map((m) => String(m.word || '').trim().toLowerCase()));
    let opts = [...new Set((options || []).map((o) => String(o || '').trim()).filter(Boolean))];
    opts = opts.filter((o) => wordSet.has(o.toLowerCase()));
    if (!opts.some((o) => o.toLowerCase() === target.toLowerCase())) opts.unshift(target);
    opts = [...new Set(opts)];
    while (opts.length < 4) {
      const fillers = pickBalancedDistractors(target, allMeta, 4 - opts.length, opts, rng);
      for (const f of fillers) {
        if (!opts.some((o) => o.toLowerCase() === f.toLowerCase())) opts.push(f);
      }
      if (opts.length < 4) break;
    }
    shuffleInPlace(opts, rng);
    return opts.slice(0, 4);
  }

  function buildFallbackVocabQuiz(words, opts = {}) {
    const list = [...new Set((words || []).map((w) => String(w || '').trim()).filter(Boolean))];
    const count = Math.min(Math.max(Number(opts.count) || 10, 1), 10, list.length);
    const allMeta =
      opts.wordMeta && opts.wordMeta.length
        ? opts.wordMeta
        : list.map((w) => ({ word: w, type: 'other', translation: '' }));
    const prefer = (opts.preferTargets || []).filter((w) => list.some((x) => x.toLowerCase() === w.toLowerCase()));
    const targets = [];
    const used = new Set();
    for (const w of prefer) {
      if (targets.length >= count) break;
      const k = w.toLowerCase();
      if (used.has(k)) continue;
      used.add(k);
      targets.push(w);
    }
    for (const w of list) {
      if (targets.length >= count) break;
      const k = w.toLowerCase();
      if (used.has(k)) continue;
      used.add(k);
      targets.push(w);
    }
    const hintLang = String(opts.hintLang || 'en').slice(0, 2);
    const lang = String(opts.lang || 'de').slice(0, 2);
    const hintMode = opts.hintLanguageMode === 'immersion' ? 'immersion' : 'interface';
    const byWord = metaByWord(allMeta);
    const questions = [];
    for (const word of targets) {
      const meta = byWord.get(word.toLowerCase());
      let tr = String(meta?.translation || '').trim();
      if (!tr || tr === '—') tr = '';
      let hint;
      if (tr) {
        hint =
          hintLang === 'es'
            ? `Significa: ${tr}`
            : hintLang === 'de'
              ? `Bedeutung: ${tr}`
              : hintLang === 'fr'
                ? `Signifie : ${tr}`
                : hintLang === 'it'
                  ? `Significa: ${tr}`
                  : `Means: ${tr}`;
      } else {
        const src = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';
        hint =
          hintLang === 'es'
            ? `Una palabra en ${src} de tu lista.`
            : `A ${src} word from your vocabulary list.`;
      }
      const options = repairQuizOptions(word, [], allMeta);
      if (options.length < 4) continue;
      questions.push({
        word,
        hintType: tr ? 'explanation' : 'explanation',
        hint,
        hintLanguage: hintMode === 'immersion' ? lang : hintLang,
        options,
        fallback: true,
      });
    }
    return questions;
  }

  return {
    weaknessScore,
    sortCardsByWeakness,
    buildWordMeta,
    weightedPickQuizTargets,
    normPos,
    pickPhraseGapOptions,
    repairQuizOptions,
    buildFallbackVocabQuiz,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.VocabQuizUtils = VocabQuizUtils;
