'use strict';

const { normalizeB1Topic } = require('../../../js/data/b1Topics.js');
const PersonalPoolVocabGate = require('../../../js/library/personalPoolVocabGate.js');
const {
  loadModuleSearchRows,
  filterRows,
  scoreRowsForVocab,
  resolveRowPart,
} = require('./poolSearchCache.js');
const {
  scorePersonalPartTextMatches,
} = require('./personalPartTextMatches.js');

const TOP_K = PersonalPoolVocabGate.TOP_K_CANDIDATES || 15;
const BRANCH = PersonalPoolVocabGate.PER_TEIL_SEARCH_BRANCH || 8;
const MIN_VISIBLE = PersonalPoolVocabGate.PERSONAL_VOCAB_MIN_VISIBLE || 3;

function moduleTeils(blueprint, module) {
  const mod = String(module || 'lesen').toLowerCase();
  const bp = blueprint?.modules?.[mod] || blueprint?.[mod];
  if (Array.isArray(bp?.teils) && bp.teils.length) {
    return bp.teils.map((t) => Number(t)).filter((n) => Number.isFinite(n));
  }
  if (mod === 'horen' || mod === 'listening') return [1, 2, 3, 4];
  if (mod === 'schreiben' || mod === 'writing') return [1, 2, 3];
  if (mod === 'sprechen' || mod === 'speaking') return [1, 2, 3];
  return [1, 2, 3, 4, 5];
}

async function listTeilCandidates(store, lang, level, module, teil, opts) {
  const {
    excludeIds = [],
    words = [],
    topicTag = null,
    assembleMode = 'practice',
    strictTopic = true,
    excludeTopics = [],
  } = opts;
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const normModule = String(module).toLowerCase();
  const wantTopic = topicTag ? normalizeB1Topic(topicTag) : null;

  const { rows } = await loadModuleSearchRows(store, normLang, normLevel, normModule);
  let available = filterRows(rows, { teil, excludeIds, assembleMode });
  let topicRelaxedPool = false;
  if (wantTopic && strictTopic && available.length) {
    const strict = available.filter((r) => normalizeB1Topic(r.topicTag) === wantTopic);
    if (strict.length) available = strict;
    else topicRelaxedPool = true;
  }

  const wantLemmas = (words || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  if (!available.length || !wantLemmas.length) return { candidates: [], topicRelaxedPool };

  const scored = scoreRowsForVocab(available, { words: wantLemmas, excludeTopics });
  const candidates = scored.slice(0, TOP_K).map((s) => {
    const row = s.row;
    const servedTopic = normalizeB1Topic(row.topicTag);
    let topicRelaxed = topicRelaxedPool;
    if (wantTopic && servedTopic && servedTopic !== wantTopic) topicRelaxed = true;
    return {
      id: row.id,
      teil,
      covered: s.covered,
      score: s.score,
      topicRelaxed,
      servedCount: row.servedCount || 0,
      topicSlug: row.topicSlug || null,
      topicTag: row.topicTag || null,
    };
  });
  return { candidates, topicRelaxedPool };
}

function searchBestCombination(teils, perTeilLists, minVisible) {
  let best = null;

  function better(next, prev) {
    if (!prev) return true;
    if (next.unionSize !== prev.unionSize) return next.unionSize > prev.unionSize;
    if (next.missingCount !== prev.missingCount) return next.missingCount < prev.missingCount;
    if (next.relaxedCount !== prev.relaxedCount) return next.relaxedCount < prev.relaxedCount;
    if (next.servedSum !== prev.servedSum) return next.servedSum < prev.servedSum;
    return false;
  }

  function dfs(index, picks, union, usedTopics, relaxedCount, servedSum, missingCount) {
    if (index >= teils.length) {
      if (union.size < minVisible) return;
      const candidate = {
        picks: picks.map((p) => ({ ...p })),
        unionSize: union.size,
        unionWords: [...union],
        relaxedCount,
        servedSum,
        missingCount,
      };
      if (better(candidate, best)) best = candidate;
      return;
    }
    const teil = teils[index];
    const list = perTeilLists.get(teil) || [];
    if (!list.length) {
      picks.push({ teil, missing: true });
      dfs(index + 1, picks, union, usedTopics, relaxedCount, servedSum, missingCount + 1);
      picks.pop();
      return;
    }
    const slice = list.slice(0, BRANCH);
    for (const c of slice) {
      const slug = c.topicSlug ? String(c.topicSlug).toLowerCase() : '';
      if (slug && usedTopics.has(slug)) continue;
      const nextUnion = new Set(union);
      for (const w of c.covered || []) nextUnion.add(String(w).toLowerCase());
      const nextTopics = new Set(usedTopics);
      if (slug) nextTopics.add(slug);
      picks.push({
        teil,
        id: c.id,
        covered: c.covered || [],
        topicRelaxed: !!c.topicRelaxed,
        topicTag: c.topicTag || null,
        topicSlug: c.topicSlug || null,
      });
      dfs(
        index + 1,
        picks,
        nextUnion,
        nextTopics,
        relaxedCount + (c.topicRelaxed ? 1 : 0),
        servedSum + (c.servedCount || 0),
        missingCount,
      );
      picks.pop();
    }
  }

  dfs(0, [], new Set(), new Set(), 0, 0, 0);
  return best;
}

async function verifyPlanPicksText(store, lang, level, picks, userWords) {
  const normLang = String(lang).toLowerCase();
  const normLevel = String(level).toUpperCase();
  const union = new Set();
  const enriched = [];
  for (const pick of picks || []) {
    if (!pick?.id) continue;
    const { rows } = await loadModuleSearchRows(store, normLang, normLevel, pick.module || 'lesen');
    let row = rows.find((r) => r.id === pick.id);
    if (!row) {
      enriched.push({ ...pick, textMatches: 0, textWords: [], textError: 'row_not_found' });
      continue;
    }
    const part = await resolveRowPart(store, row);
    if (!part) {
      enriched.push({ ...pick, textMatches: 0, textWords: [], textError: 'part_load_failed' });
      continue;
    }
    const textHit = scorePersonalPartTextMatches(part, userWords, { lang: normLang, level: normLevel });
    for (const w of textHit.words) union.add(String(w).toLowerCase());
    enriched.push({
      ...pick,
      textMatches: textHit.count,
      textWords: textHit.words,
      indexMatches: (pick.covered || []).length,
    });
  }
  return {
    textCoveredCount: union.size,
    textCoveredWords: [...union],
    picks: enriched,
  };
}

function planDecisionFromText(textCount, minVisible) {
  if (textCount <= 0) return 'reject';
  if (textCount >= minVisible) return 'serve_now';
  return 'serve_partial';
}

/**
 * Plan full module picks maximizing vocab union with constraint >= minVisible.
 */
async function planPersonalModuleAssembly(store, lang, level, module, opts = {}) {
  const {
    words = [],
    topicTag = null,
    excludeIds = [],
    assembleMode = 'practice',
    blueprint = null,
    minVisible = MIN_VISIBLE,
    verifyText = true,
    userWords = null,
  } = opts;

  const surfaces = (userWords || words || []).map((w) => String(w)).filter(Boolean);

  const wantLemmas = [...new Set((words || []).map((w) => String(w).toLowerCase()).filter(Boolean))];
  const teils = moduleTeils(blueprint, module);
  const telemetry = {
    requestedTopic: topicTag ? normalizeB1Topic(topicTag) : null,
    words: wantLemmas,
    module: String(module).toLowerCase(),
    lang: String(lang).toLowerCase(),
    level: String(level).toUpperCase(),
    teils,
  };

  if (!wantLemmas.length) {
    return { ok: false, reason: 'vocab_no_match', ...telemetry };
  }

  async function runPass(strictTopic) {
    const perTeil = new Map();
    for (const teil of teils) {
      const { candidates } = await listTeilCandidates(store, lang, level, module, teil, {
        excludeIds,
        words: wantLemmas,
        topicTag,
        assembleMode,
        strictTopic,
      });
      perTeil.set(teil, candidates);
    }
    return searchBestCombination(teils, perTeil, minVisible);
  }

  let best = await runPass(true);
  let topicPass = 'strict';
  if (!best) {
    best = await runPass(false);
    topicPass = 'relaxed';
  }

  if (!best) {
    return {
      ok: false,
      reason: 'vocab_insufficient_coverage',
      coveredCount: 0,
      minVisible,
      topicPass,
      ...telemetry,
    };
  }

  const missingTeile = best.picks.filter((p) => p.missing).map((p) => p.teil);
  const relaxedTeile = best.picks
    .filter((p) => !p.missing && p.topicRelaxed)
    .map((p) => ({ teil: p.teil, actualTopic: p.topicTag ? normalizeB1Topic(p.topicTag) : null }));

  const indexPicks = best.picks.filter((p) => !p.missing).map((p) => ({ ...p, module: String(module).toLowerCase() }));
  let textBlock = {
    textVerified: false,
    textCoveredCount: null,
    textCoveredWords: [],
    textMeetsMin: null,
    decision: null,
    indexCoveredCount: best.unionSize,
  };

  if (verifyText && indexPicks.length) {
    const tv = await verifyPlanPicksText(store, lang, level, indexPicks, surfaces);
    const textMeetsMin = tv.textCoveredCount >= minVisible;
    textBlock = {
      textVerified: true,
      textCoveredCount: tv.textCoveredCount,
      textCoveredWords: tv.textCoveredWords,
      textMeetsMin,
      decision: planDecisionFromText(tv.textCoveredCount, minVisible),
      indexCoveredCount: best.unionSize,
      picks: tv.picks,
    };
  }

  return {
    ok: true,
    picks: textBlock.picks || indexPicks,
    coveredWords: best.unionWords,
    coveredCount: best.unionSize,
    minVisible,
    topicPass,
    missingTeile,
    relaxedTeile,
    ...textBlock,
    ...telemetry,
  };
}

module.exports = {
  planPersonalModuleAssembly,
  listTeilCandidates,
  searchBestCombination,
  verifyPlanPicksText,
  planDecisionFromText,
  moduleTeils,
  MIN_VISIBLE,
  TOP_K,
};
