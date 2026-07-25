/**
 * planHybridExam — PRE-REFACTOR inline version (for A/B regression).
 */
import { buscar } from '../../netlify/functions/lib/partIndex.js';
import { classifyUserVocab } from './vocabPrefilter.mjs';

export const DEFAULT_TEIL_LIST = [1, 2, 3, 4, 5];

export const HYBRID_DEFAULTS = {
  poolThreshold: 1,
  poolMaxSoft: 3,
  liveMaxSoft: 3,
};

export function planHybridExam({
  poolRecords,
  module,
  teilList = DEFAULT_TEIL_LIST,
  topicTag,
  words,
  lang = 'de',
  level = 'B1',
  poolThreshold = HYBRID_DEFAULTS.poolThreshold,
}) {
  const userVocab = classifyUserVocab(words, { lang, level });
  let vocabRemaining = [...userVocab.prompted];
  const pool = [];
  const live = [];

  for (const teil of teilList) {
    const hits = buscar(poolRecords, {
      lang,
      level,
      module,
      teil,
      topicTag,
      words: vocabRemaining,
      literal: true,
    });
    const best = hits[0];
    if (best && best.score >= poolThreshold) {
      pool.push({
        teil,
        id: best.id,
        score: best.score,
        coveredWords: best.coveredWords,
        topicTag: best.topicTag,
        part: best.part,
      });
      const coveredLower = new Set((best.coveredWords || []).map((w) => String(w).toLowerCase()));
      vocabRemaining = vocabRemaining.filter((w) => !coveredLower.has(String(w).toLowerCase()));
    } else {
      live.push(teil);
    }
  }

  const coveredByPool = userVocab.prompted.filter(
    (w) => !vocabRemaining.some((r) => String(r).toLowerCase() === String(w).toLowerCase()),
  );

  return {
    module,
    topicTag,
    teilList,
    pool,
    live,
    vocab: {
      requested: userVocab.requested,
      prompted: userVocab.prompted,
      excluded: userVocab.excluded,
      coveredByPool,
      remaining: vocabRemaining,
    },
    stats: {
      poolCount: pool.length,
      liveCount: live.length,
    },
  };
}

export { buscar };
