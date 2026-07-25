/**
 * hybridExamPlan — pure DECISION layer for hybrid personal exams.
 *
 * Dynamic pool/live split: maximize vocab-qualified pool, generate the rest
 * prioritizing low stock (feed empty teils). Time rule: max one slow (T1/T2)
 * live unless pool is empty for that cell (exception).
 */
import { createRequire } from 'node:module';
import { buscar } from '../../netlify/functions/lib/partIndex.js';
import { classifyUserVocab } from './vocabPrefilter.mjs';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require('../../js/data/b1Topics.js');

export const DEFAULT_TEIL_LIST = [1, 2, 3, 4, 5];
export const SLOW_TEILS = Object.freeze([1, 2]);
export const FAST_TEILS = Object.freeze([3, 4, 5]);

export const HYBRID_PLAN_DEFAULTS = {
  poolThreshold: 1,
  lang: 'de',
  level: 'B1',
};

function normCtx(lang, level, module) {
  return {
    lang: String(lang || 'de').toLowerCase(),
    level: String(level || 'B1').toUpperCase(),
    module: String(module || 'lesen').toLowerCase(),
  };
}

function isVerifiedPart(r, { lang, level, module }) {
  return (
    String(r.lang || '').toLowerCase() === lang &&
    String(r.level || '').toUpperCase() === level &&
    String(r.module || '').toLowerCase() === module &&
    r.disabled !== true &&
    r.complete === true &&
    r.verified === true
  );
}

/** Total verified parts for teil; topic-first count, fallback any topic. */
export function countTeilInventory(records, { lang, level, module, teil, topicTag }) {
  const { lang: L, level: Lev, module: Mod } = normCtx(lang, level, module);
  const teilNum = Number(teil);
  const wantTopic = topicTag != null ? normalizeB1Topic(topicTag) : null;
  let candidates = (records || []).filter(
    (r) => isVerifiedPart(r, { lang: L, level: Lev, module: Mod }) && Number(r.teil) === teilNum,
  );
  if (wantTopic) {
    const topicMatches = candidates.filter((r) => normalizeB1Topic(r.topicTag) === wantTopic);
    if (topicMatches.length) return topicMatches.length;
  }
  return candidates.length;
}

/**
 * Pick any verified pool part for a teil (topic-first, then any teil match).
 */
export function pickForcedPoolPart(records, { lang, level, module, teil, topicTag }) {
  const { lang: L, level: Lev, module: Mod } = normCtx(lang, level, module);
  const teilNum = Number(teil);
  const wantTopic = topicTag != null ? normalizeB1Topic(topicTag) : null;

  let candidates = (records || []).filter(
    (r) => isVerifiedPart(r, { lang: L, level: Lev, module: Mod }) && Number(r.teil) === teilNum,
  );
  if (wantTopic) {
    const topicMatches = candidates.filter((r) => normalizeB1Topic(r.topicTag) === wantTopic);
    if (topicMatches.length) candidates = topicMatches;
  }
  if (!candidates.length) return null;

  candidates.sort(
    (a, b) =>
      (a.servedCount || 0) - (b.servedCount || 0) ||
      (b.vocabIndex?.length || 0) - (a.vocabIndex?.length || 0),
  );
  const part = candidates[0];
  return {
    id: part.id,
    partId: part.id,
    teil: teilNum,
    score: 0,
    coveredWords: [],
    topicTag: part.topicTag || null,
    part,
    forced: true,
  };
}

function poolRowFromHit(hit, forced = false) {
  return {
    teil: Number(hit.teil),
    partId: hit.id,
    score: hit.score,
    coveredWords: [...(hit.coveredWords || [])],
    topicTag: hit.topicTag || null,
    part: hit.part,
    forced,
  };
}

function bestVocabHit(records, { lang, level, module, teil, topicTag, words }) {
  const hits = buscar(records, {
    lang,
    level,
    module,
    teil,
    topicTag,
    words,
    literal: true,
  });
  return hits[0] || null;
}

/** Greedy: maximize pool cells with vocab score >= threshold. */
function greedyPoolAssignment(records, teils, topicTag, vocabRemaining, poolThreshold, ctx) {
  const assigned = new Map();
  let remaining = [...vocabRemaining];

  const candidates = [];
  for (const teil of teils) {
    const hit = bestVocabHit(records, {
      ...ctx,
      teil,
      topicTag,
      words: remaining,
    });
    if (hit && hit.score >= poolThreshold) {
      candidates.push({ teil: Number(teil), hit });
    }
  }
  candidates.sort((a, b) => b.hit.score - a.hit.score || Number(a.teil) - Number(b.teil));

  for (const { teil, hit } of candidates) {
    if (assigned.has(teil)) continue;
    const recheck = bestVocabHit(records, {
      ...ctx,
      teil,
      topicTag,
      words: remaining,
    });
    if (!recheck || recheck.score < poolThreshold) continue;
    assigned.set(teil, poolRowFromHit(recheck));
    const coveredLower = new Set((recheck.coveredWords || []).map((w) => String(w).toLowerCase()));
    remaining = remaining.filter((w) => !coveredLower.has(String(w).toLowerCase()));
  }

  return { assigned, vocabRemaining: remaining };
}

function tryAssignForced(assigned, records, teil, topicTag, ctx) {
  if (assigned.has(Number(teil))) return true;
  const forced = pickForcedPoolPart(records, { ...ctx, teil, topicTag });
  if (!forced) return false;
  assigned.set(Number(teil), poolRowFromHit(forced, true));
  return true;
}

/** Other four cells must be pool (vocab or forced). Returns false if forced impossible. */
function canCoverExcept(excludedTeil, teils, assigned, records, topicTag, ctx) {
  const scratch = new Map(assigned);
  for (const t of teils) {
    const teilNum = Number(t);
    if (teilNum === Number(excludedTeil)) continue;
    if (!tryAssignForced(scratch, records, teilNum, topicTag, ctx)) return false;
  }
  return true;
}

function liveSortKey(teil, stock) {
  const t = Number(teil);
  const slowRank = SLOW_TEILS.includes(t) ? 1 : 0;
  return [stock[t] ?? 0, slowRank, t];
}

function compareLiveOrder(a, b, stock) {
  const ka = liveSortKey(a, stock);
  const kb = liveSortKey(b, stock);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/**
 * Decide live teils from still-missing cells applying slow/time rules + empty-pool exception.
 */
function decideLiveTeils(stillMissing, assigned, records, teils, topicTag, stock, ctx) {
  const liveSet = new Set();
  const missing = stillMissing.map(Number);

  // Exception: pool totally empty for cell → must live (even T1/T2).
  for (const teil of missing) {
    if (assigned.has(teil)) continue;
    if (countTeilInventory(records, { ...ctx, teil, topicTag }) === 0) {
      liveSet.add(teil);
    }
  }

  const slowMissing = missing.filter((t) => SLOW_TEILS.includes(t) && !liveSet.has(t));
  const fastMissing = missing.filter((t) => FAST_TEILS.includes(t) && !liveSet.has(t));

  let slowLive = null;
  const slowSorted = [...slowMissing].sort((a, b) => compareLiveOrder(a, b, stock));
  for (const candidate of slowSorted) {
    if (canCoverExcept(candidate, teils, assigned, records, topicTag, ctx)) {
      slowLive = candidate;
      break;
    }
  }

  if (slowLive != null) {
    liveSet.add(slowLive);
    const otherSlow = SLOW_TEILS.find((t) => t !== slowLive);
    if (missing.includes(otherSlow) && !assigned.has(otherSlow)) {
      if (!tryAssignForced(assigned, records, otherSlow, topicTag, ctx)) {
        liveSet.add(otherSlow);
      }
    }
  } else if (slowMissing.length) {
    for (const t of SLOW_TEILS) {
      if (!missing.includes(t) || assigned.has(t) || liveSet.has(t)) continue;
      if (!tryAssignForced(assigned, records, t, topicTag, ctx)) {
        liveSet.add(t);
      }
    }
  }

  for (const teil of fastMissing) {
    if (!assigned.has(teil) && !liveSet.has(teil)) {
      liveSet.add(teil);
    }
  }

  for (const teil of missing) {
    if (!assigned.has(teil) && !liveSet.has(teil)) {
      if (!tryAssignForced(assigned, records, teil, topicTag, ctx)) {
        liveSet.add(teil);
      }
    }
  }

  return [...liveSet].sort((a, b) => compareLiveOrder(a, b, stock));
}

export function computeHybridPlan({
  module,
  teils = DEFAULT_TEIL_LIST,
  topic,
  vocab,
  poolIndex,
  lang = HYBRID_PLAN_DEFAULTS.lang,
  level = HYBRID_PLAN_DEFAULTS.level,
  poolThreshold = HYBRID_PLAN_DEFAULTS.poolThreshold,
  classify = true,
  promptedWords = null,
  excluded = [],
} = {}) {
  const ctx = normCtx(lang, level, module);
  const topicTag = topic != null ? String(topic).trim() : null;
  const records = Array.isArray(poolIndex) ? poolIndex : [];
  const teilList = [...teils].map(Number).filter(Number.isFinite);

  let prompted;
  let excludedMeta = excluded;
  if (classify && Array.isArray(vocab) && !promptedWords) {
    const userVocab = classifyUserVocab(vocab, { lang, level });
    prompted = [...userVocab.prompted];
    excludedMeta = userVocab.excluded || [];
  } else {
    prompted = [...(promptedWords || vocab || [])].map(String).filter(Boolean);
  }

  const stock = Object.fromEntries(
    teilList.map((t) => [t, countTeilInventory(records, { ...ctx, teil: t, topicTag })]),
  );

  const matchCount = Object.fromEntries(
    teilList.map((t) => {
      const hits = buscar(records, {
        ...ctx,
        teil: t,
        topicTag,
        words: prompted,
        literal: true,
      }).filter((h) => h.score >= poolThreshold);
      return [t, hits.length];
    }),
  );

  const { assigned, vocabRemaining } = greedyPoolAssignment(
    records,
    teilList,
    topicTag,
    prompted,
    poolThreshold,
    ctx,
  );

  const stillMissing = teilList.filter((t) => !assigned.has(t));
  const liveTeils = decideLiveTeils(stillMissing, assigned, records, teilList, topicTag, stock, ctx);

  const liveSet = new Set(liveTeils);
  const fromPoolRows = teilList
    .filter((t) => !liveSet.has(t) && assigned.has(t))
    .map((t) => assigned.get(t));

  const covered = prompted.filter(
    (w) => !vocabRemaining.some((r) => String(r).toLowerCase() === String(w).toLowerCase()),
  );
  const pending = [...vocabRemaining];

  const toGenerateRows = liveTeils.map((teil) => ({
    teil,
    vocabForCell: [...pending],
  }));

  const slowLive = liveTeils.find((t) => SLOW_TEILS.includes(Number(t))) ?? null;

  return {
    module: ctx.module,
    topicTag,
    teils: teilList,
    lang: ctx.lang,
    level: ctx.level,
    poolThreshold,
    fromPoolRows,
    toGenerateRows,
    vocab: {
      requested: Array.isArray(vocab) ? [...vocab] : prompted,
      prompted: [...prompted],
      excluded: excludedMeta,
      covered: [...covered],
      pending: [...pending],
    },
    stats: {
      poolCount: fromPoolRows.length,
      liveCount: toGenerateRows.length,
    },
    decision: {
      stock,
      matchCount,
      slowLive,
      poolForced: fromPoolRows.filter((r) => r.forced).map((r) => r.teil),
    },
  };
}

export function planHybridDecision(opts) {
  const full = computeHybridPlan(opts);
  return {
    fromPool: full.fromPoolRows.map(({ teil, partId }) => ({ teil, partId })),
    toGenerate: full.toGenerateRows.map(({ teil, vocabForCell }) => ({
      teil,
      vocabForCell: [...vocabForCell],
    })),
    vocabCoverage: {
      covered: [...full.vocab.covered],
      pending: [...full.vocab.pending],
    },
    decision: full.decision,
  };
}

export { buscar };
