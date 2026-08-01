/**
 * Lesen T4 — stock de semillas de debate por topicTag (análogo a lesenT3BlueprintStock).
 */
import { normalizeB1Topic } from './b1Topics.mjs';
import {
  checkT4DebateSeedPreflight,
  getSeedsForTopic,
  pickNextT4DebateSeed,
} from './t4DebateSeeds.mjs';
import { loadPersistedCellMolds } from './persistedCellPool.mjs';
import {
  a2LesenGeminiStockStub,
  skipB1LesenT4SeedStock,
} from './a2LesenGeneration.mjs';

/**
 * @param {string} topicTag
 * @param {{ lang?: string, level?: string, poolFile?: string, sessionExcludeSeeds?: string[], extraExcludeSeeds?: string[] }} [opts]
 */
export function listT4SeedStockForTopic(topicTag, opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topic = normalizeB1Topic(topicTag);
  const seeds = getSeedsForTopic(topic);
  const persisted = loadPersistedCellMolds({ lang, level, topicTag: topic, teil: 4, poolFile: opts.poolFile });
  const poolSeeds = persisted.subtypes;
  const excludeSet = new Set([
    ...poolSeeds,
    ...(opts.sessionExcludeSeeds || []),
    ...(opts.extraExcludeSeeds || []),
  ]);

  const rows = seeds.map((seed) => {
    const pf = checkT4DebateSeedPreflight(seed, topic);
    const inPool = excludeSet.has(seed);
    return {
      seed,
      preflightOk: pf.ok,
      preflightReason: pf.reason || null,
      inPool,
      fresh: pf.ok && !inPool,
    };
  });

  const preflightOk = rows.filter((r) => r.preflightOk);
  const fresh = rows.filter((r) => r.fresh);
  const pick = pickNextT4DebateSeed([...excludeSet], persisted.cellCount, topic);

  return {
    topic,
    cellCount: persisted.cellCount,
    totalSeeds: seeds.length,
    preflightOkCount: preflightOk.length,
    freshCount: fresh.length,
    poolUsableSeedCount: preflightOk.filter((r) => r.inPool).length,
    pickTier: pick.tier,
    pickSeed: pick.seed,
    /** Solo semillas preflight-OK aún no usadas en banco — saturated reutiliza molde ya bloqueado por CHK-29. */
    generatable: fresh.length > 0,
    rows,
  };
}

export const T4_SEED_EXHAUSTED_RE =
  /(?:sin semilla usable|tier=exhausted|T4\s+\S+\s*:\s*sin semilla|semillas?\s+T4\s+agotad)/i;

/** @param {string|null|undefined} reason */
export function isT4SeedExhaustedReason(reason) {
  return T4_SEED_EXHAUSTED_RE.test(String(reason || ''));
}

function sessionT4ExcludeSeeds(sessionLesen) {
  const raw = sessionLesen?.args?._excludeSubtypes;
  if (!raw) return [];
  const list = raw instanceof Set ? [...raw] : raw;
  return list.filter((s) => typeof s === 'string' && s.length > 24);
}

/**
 * Lesen T4: saltar tema si no queda semilla fresca (mismo criterio operativo que T3 agotado).
 * @param {string} module
 * @param {number} teil
 * @param {string} topic
 * @param {string|null|undefined} reason
 * @param {object|null|undefined} sessionLesen
 */
export function shouldSkipLesenT4Topic(module, teil, topic, reason, sessionLesen, levelFallback = null) {
  if (String(module).toLowerCase() !== 'lesen' || Number(teil) !== 4 || !topic) return false;
  const level = sessionLesen?.args?.level || levelFallback || 'B1';
  if (skipB1LesenT4SeedStock(level, teil)) return false;
  if (isT4SeedExhaustedReason(reason)) return true;

  const stock = listT4SeedStockForTopic(topic, {
    lang: sessionLesen?.args?.lang || 'de',
    level: sessionLesen?.args?.level || 'B1',
    sessionExcludeSeeds: sessionT4ExcludeSeeds(sessionLesen),
  });
  if (!stock.generatable) return true;
  return false;
}

export function preflightLesenT4Topic(topic, sessionLesen, levelFallback = null) {
  const level = sessionLesen?.args?.level || levelFallback || 'B1';
  if (skipB1LesenT4SeedStock(level, 4)) return a2LesenGeminiStockStub();
  return listT4SeedStockForTopic(topic, {
    lang: sessionLesen?.args?.lang || 'de',
    level: sessionLesen?.args?.level || 'B1',
    sessionExcludeSeeds: sessionT4ExcludeSeeds(sessionLesen),
  });
}
