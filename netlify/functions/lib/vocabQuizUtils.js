'use strict';

const {
  isSeparableTarget,
  separablePresentRoot,
  pickSeparableStemDistractors,
} = require('./vocabPhrasesUtils.js');

/** Weight for prioritizing struggling vocabulary in quiz targets. */
function weaknessScore(meta) {
  if (!meta) return 1;
  let s = 1 + (meta.missCount || 0) * 3;
  if (meta.due) s += 2;
  if (!meta.interval || meta.interval <= 1) s += 1;
  return s;
}

function normPos(type) {
  const t = String(type || 'other').toLowerCase().trim();
  if (['noun', 'verb', 'adjective', 'adverb'].includes(t)) return t;
  return 'other';
}

function metaByWord(allMeta) {
  const map = new Map();
  (allMeta || []).forEach((m) => {
    const w = String(m.word || '').trim().toLowerCase();
    if (w) map.set(w, m);
  });
  return map;
}

/** Reject sets where guessing is trivial (POS mismatch or duplicate translations). */
function validateQuizOptionsQuality(targetWord, options, allMeta) {
  const target = String(targetWord || '').trim().toLowerCase();
  const opts = [...new Set((options || []).map((o) => String(o || '').trim()).filter(Boolean))];
  if (opts.length < 4 || !target) return false;
  const byWord = metaByWord(allMeta);
  const metas = opts.map((w) => byWord.get(w.toLowerCase())).filter(Boolean);
  if (metas.length < 4) return true;

  const trs = metas
    .map((m) => String(m.translation || '').trim().toLowerCase())
    .filter((t) => t && t !== '—');
  if (trs.length >= 2 && new Set(trs).size < trs.length) return false;

  const targetMeta = byWord.get(target);
  const targetPos = normPos(targetMeta?.type);
  if (targetPos !== 'other') {
    const samePos = metas.filter((m) => normPos(m.type) === targetPos).length;
    if (samePos < 3) return false;
  }
  return true;
}

function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick distractors: same POS when possible, distinct translations from target. */
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
  const shuffled = shuffleInPlace([...pool], rng);
  return shuffled.slice(0, needCount).map((m) => m.word);
}

function repairQuizOptions(targetWord, options, allMeta, rng = Math.random) {
  const target = String(targetWord || '').trim();
  const byWord = metaByWord(allMeta);
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
  opts = opts.slice(0, 4);
  if (!validateQuizOptionsQuality(target, opts, allMeta)) {
    const distractors = pickBalancedDistractors(target, allMeta, 3, [], rng);
    opts = [target, ...distractors].filter(Boolean);
    opts = [...new Set(opts)].slice(0, 4);
    while (opts.length < 4) {
      const extra = pickBalancedDistractors(target, allMeta, 1, opts, rng)[0];
      if (!extra) break;
      opts.push(extra);
      opts = [...new Set(opts)];
    }
  }
  shuffleInPlace(opts, rng);
  return opts.slice(0, 4);
}

function weightedPickQuizTargets(allMeta, count, preferTargets = [], rng = Math.random) {
  const prefer = [...new Set((preferTargets || []).map((w) => String(w || '').trim()).filter(Boolean))];
  const picked = [];
  const used = new Set();
  for (const w of prefer) {
    if (picked.length >= count) break;
    const key = w.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    picked.push(w);
  }
  const remaining = (allMeta || []).filter((m) => !used.has(String(m.word || '').trim().toLowerCase()));
  while (picked.length < count && remaining.length) {
    const weights = remaining.map((m) => ({ m, w: weaknessScore(m) }));
    const total = weights.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    const [item] = remaining.splice(idx, 1);
    const word = String(item.word || '').trim();
    if (word) picked.push(word);
  }
  return picked.slice(0, count);
}

function finiteVerbStem(lemma) {
  const w = String(lemma || '').trim();
  if (!w) return null;
  const sepStem = separablePresentRoot(w);
  if (sepStem) return sepStem;
  try {
    const path = require('path');
    if (!global.Lemmatizer) {
      global.Lemmatizer = require(path.join(__dirname, '../../../js/engine/validation/lemmatizer.js'));
    }
    const VC = require(path.join(__dirname, '../../../js/data/verbConjugation.js'));
    const c = VC.getPresent ? VC.getPresent(w, 'de') : null;
    if (c?.forms?.er) {
      const er = String(c.forms.er).trim();
      return c.separable ? er.split(/\s+/)[0] : er;
    }
  } catch (_) {}
  return null;
}

function pickPhraseGapOptions(blankToken, targetWord, allMeta, rng = Math.random) {
  const blank = String(blankToken || '').trim();
  const target = String(targetWord || '').trim();
  if (!blank) return [];
  const byWord = metaByWord(allMeta);
  const targetMeta = byWord.get(target.toLowerCase());
  const targetPos = normPos(targetMeta?.type);
  const targetTr = String(targetMeta?.translation || '').trim().toLowerCase();
  const exclude = new Set([blank.toLowerCase(), target.toLowerCase()]);

  const separableGap = isSeparableTarget(target) && blank.toLowerCase() !== target.toLowerCase();

  if (separableGap) {
    const stems = new Set(pickSeparableStemDistractors(blank, target, allMeta, 3, rng));
    for (const m of shuffleInPlace([...(allMeta || [])], rng)) {
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
    let opts = [blank, ...stems];
    opts = [...new Set(opts.map((o) => String(o).trim()).filter(Boolean))];
    shuffleInPlace(opts, rng);
    return opts.slice(0, 4);
  }

  let candidates = (allMeta || []).filter((m) => {
    const w = String(m.word || '').trim().toLowerCase();
    if (!w || exclude.has(w)) return false;
    if (targetPos !== 'other' && normPos(m.type) !== targetPos) return false;
    const tr = String(m.translation || '').trim().toLowerCase();
    if (targetTr && tr && tr === targetTr) return false;
    return true;
  });

  const shuffled = shuffleInPlace([...candidates], rng);
  const distractors = shuffled.slice(0, 3).map((m) => m.word);
  let opts = [blank, ...distractors];
  opts = [...new Set(opts.map((o) => String(o).trim()).filter(Boolean))];
  while (opts.length < 4) {
    const fillers = pickBalancedDistractors(target, allMeta, 4 - opts.length, opts, rng);
    for (const f of fillers) {
      if (targetPos !== 'other' && normPos(byWord.get(f.toLowerCase())?.type) !== targetPos) continue;
      if (!opts.some((o) => o.toLowerCase() === f.toLowerCase())) opts.push(f);
    }
    if (opts.length < 4) break;
  }
  shuffleInPlace(opts, rng);
  return opts.slice(0, 4);
}

function phraseGapOptionsSamePos(blankToken, targetWord, options, allMeta) {
  const target = String(targetWord || '').trim().toLowerCase();
  const byWord = metaByWord(allMeta);
  const targetPos = normPos(byWord.get(target)?.type);
  if (targetPos === 'other') return true;
  const blank = String(blankToken || '').trim().toLowerCase();

  if (isSeparableTarget(target) && blank !== target) {
    return (options || []).every((o) => {
      const low = String(o || '').trim().toLowerCase();
      if (!low || low === blank) return true;
      const m = byWord.get(low);
      if (!m) return true;
      return normPos(m.type) === targetPos;
    });
  }

  return (options || []).every((o) => {
    const low = String(o || '').trim().toLowerCase();
    if (!low || low === blank) return true;
    const m = byWord.get(low);
    return m && normPos(m.type) === targetPos;
  });
}

module.exports = {
  weaknessScore,
  normPos,
  validateQuizOptionsQuality,
  pickBalancedDistractors,
  repairQuizOptions,
  weightedPickQuizTargets,
  pickPhraseGapOptions,
  phraseGapOptionsSamePos,
  shuffleInPlace,
};
