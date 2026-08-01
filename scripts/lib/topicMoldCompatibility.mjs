/**
 * Matriz de compatibilidad permanente tema ↔ molde (Lesen T3/T4/T5).
 * Bloquea generación cuando no hay molde compatible en el pool actual.
 */
import { B1_TOPICS, normalizeB1Topic } from './b1Topics.mjs';
import {
  LESEN_T5_SUBTYPES,
  LESEN_T4_DEBATE_TOPICS,
  loadPoolRecords,
  filterCellRecords,
  collectCellMolds,
  buildT5SubtypeCandidateOrder,
  countAvailableT5Subtypes,
} from './lesenSubtypeRotation.mjs';
import { filterT5SubtypeOrder } from './lesenT5TopicFilter.mjs';
import { isT4DebateMoldCompatible } from './t4TopicAlign.mjs';
import { listT3BlueprintStockForTopic } from './lesenT3BlueprintStock.mjs';
import { isA2Level } from './a2LesenGeneration.mjs';

export const MOLD_FORMATS = Object.freeze([
  { module: 'lesen', teil: 3, label: 'Lesen T3', gate: 'CHK-26 / t3_shared_mold_*' },
  { module: 'lesen', teil: 4, label: 'Lesen T4', gate: 'CHK-27 / CHK-29' },
  { module: 'lesen', teil: 5, label: 'Lesen T5', gate: 'CHK-29 / content_topic' },
]);

export class TopicMoldIncompatibleError extends Error {
  /** @param {{ topic: string, teil: number, compatible: number, message: string }} meta */
  constructor(meta) {
    super(meta.message);
    this.name = 'TopicMoldIncompatibleError';
    this.topic = meta.topic;
    this.teil = meta.teil;
    this.compatible = meta.compatible;
  }
}

export function listCompatibleT5Subtypes(topicTag) {
  const all = LESEN_T5_SUBTYPES.map((s) => s.id);
  return filterT5SubtypeOrder(all, topicTag);
}

export function listCompatibleT4Debates(topicTag) {
  return LESEN_T4_DEBATE_TOPICS.filter((d) => isT4DebateMoldCompatible(topicTag, d.id)).map(
    (d) => d.id,
  );
}

export function countCompatibleMolds(teil, topicTag, opts = {}) {
  const topic = normalizeB1Topic(topicTag);
  if (!topic) return 0;
  const t = Number(teil);
  const lv = String(opts.level || 'B1').toUpperCase();
  if (isA2Level(lv) && (t === 3 || t === 4)) return 1;
  if (lv === 'B2' && (t === 3 || t === 4 || t === 5)) return 1;
  if (t === 5) return listCompatibleT5Subtypes(topic).length;
  if (t === 4) return listCompatibleT4Debates(topic).length;
  if (t === 3) {
    const stock = listT3BlueprintStockForTopic(topic, opts.exclude || new Set(), {
      reloadPool: opts.reloadPool !== false,
      level: opts.level || 'B1',
    });
    return stock.compatibleTotal;
  }
  return 0;
}

/** Moldes compatibles aún no saturados en la celda pool + sesión. */
export function countRemainingMolds(teil, topicTag, opts = {}) {
  const topic = normalizeB1Topic(topicTag);
  const t = Number(teil);
  const lv = String(opts.level || 'B1').toUpperCase();
  if (isA2Level(lv) && (t === 3 || t === 4)) return Number.POSITIVE_INFINITY;
  if (lv === 'B2' && (t === 3 || t === 4 || t === 5)) return Number.POSITIVE_INFINITY;
  // T1/T2 (y módulos sin matriz de moldes) — no aplicar "pool agotado" al circuit breaker.
  if (!topic || ![3, 4, 5].includes(t)) return Number.POSITIVE_INFINITY;

  if (t === 5) {
    const records = loadPoolRecords({ lang: opts.lang || 'de', level: opts.level || 'B1' });
    const cell = filterCellRecords(records, { lang: opts.lang, level: opts.level, teil: 5, topicTag: topic });
    const { moldKeys } = collectCellMolds(cell, { teil: 5 });
    const usedKeys = [...moldKeys, ...(opts.usedMoldKeys || [])];
    return countAvailableT5Subtypes(
      topic,
      usedKeys,
      opts.extraExcludeSubtypes || [],
    );
  }

  if (t === 4) {
    const compatible = listCompatibleT4Debates(topic);
    const records = loadPoolRecords({ lang: opts.lang || 'de', level: opts.level || 'B1' });
    const cell = filterCellRecords(records, { lang: opts.lang, level: opts.level, teil: 4, topicTag: topic });
    const { subtypes } = collectCellMolds(cell, { teil: 4 });
    const used = new Set([...subtypes, ...(opts.usedMoldKeys || []), ...(opts.extraExcludeSubtypes || [])]);
    return compatible.filter((id) => !used.has(id)).length;
  }

  if (t === 3) {
    const stock = listT3BlueprintStockForTopic(topic, opts.exclude || new Set(), {
      reloadPool: opts.reloadPool !== false,
      level: opts.level || 'B1',
    });
    return stock.availableTotal;
  }

  return 0;
}

/**
 * Preflight antes de generar: lanza TopicMoldIncompatibleError si compatible === 0.
 * @returns {{ ok: true, compatible: number, remaining: number, topic: string, teil: number }}
 */
export function preflightTopicMoldGeneration(teil, topicTag, opts = {}) {
  const topic = normalizeB1Topic(topicTag);
  const t = Number(teil);
  const compatible = countCompatibleMolds(t, topic, opts);
  const remaining = countRemainingMolds(t, topic, opts);

  if (compatible === 0) {
    const msg =
      `sin subtipo/molde compatible con tema «${topic}» en Lesen T${t} ` +
      `(0 moldes en pool actual — revisión manual requerida)`;
    throw new TopicMoldIncompatibleError({ topic, teil: t, compatible, message: msg });
  }

  return { ok: true, compatible, remaining, topic, teil: t };
}

/** Matriz completa 16×3 para auditorías y docs. */
export function buildTopicMoldCompatibilityMatrix(opts = {}) {
  return B1_TOPICS.map((topic) => {
    const cells = {};
    for (const fmt of MOLD_FORMATS) {
      const compatible = countCompatibleMolds(fmt.teil, topic, opts);
      const remaining = countRemainingMolds(fmt.teil, topic, opts);
      cells[`lesen-t${fmt.teil}`] = {
        compatibleMolds: compatible,
        remainingMolds: remaining,
        t5Subtypes: fmt.teil === 5 ? listCompatibleT5Subtypes(topic) : undefined,
        t4Debates: fmt.teil === 4 ? listCompatibleT4Debates(topic) : undefined,
      };
    }
    return { topic, cells };
  });
}
