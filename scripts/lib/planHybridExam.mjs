/**
 * planHybridExam — terminal adapter: DECISION (hybridExamPlan) + legacy plan shape.
 *
 * Execution (spawn, gate, ingest) lives in hybridLesenAssembly.mjs — not here.
 */
import {
  computeHybridPlan,
  DEFAULT_TEIL_LIST,
  HYBRID_PLAN_DEFAULTS,
  buscar,
} from './hybridExamPlan.mjs';

export { DEFAULT_TEIL_LIST, buscar };

export const HYBRID_DEFAULTS = {
  poolThreshold: HYBRID_PLAN_DEFAULTS.poolThreshold,
  poolMaxSoft: 3,
  liveMaxSoft: 3,
};

/**
 * Legacy plan shape for hybridLesenAssembly / E2E (backward compatible).
 */
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
  const full = computeHybridPlan({
    module,
    teils: teilList,
    topic: topicTag,
    vocab: words,
    poolIndex: poolRecords,
    lang,
    level,
    poolThreshold,
  });

  const pool = full.fromPoolRows.map((row) => ({
    teil: row.teil,
    id: row.partId,
    score: row.score,
    coveredWords: row.coveredWords,
    topicTag: row.topicTag,
    part: row.part,
  }));

  const live = full.toGenerateRows.map((row) => row.teil);

  return {
    module: full.module,
    topicTag: full.topicTag,
    teilList: full.teils,
    pool,
    live,
    vocab: {
      requested: full.vocab.requested,
      prompted: full.vocab.prompted,
      excluded: full.vocab.excluded,
      coveredByPool: full.vocab.covered,
      remaining: full.vocab.pending,
    },
    stats: full.stats,
  };
}
