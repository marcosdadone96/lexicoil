/**
 * Circuit breaker de coste para celdas tema×formato con moldes.
 * Si los últimos 2 intentos consecutivos tienen ajuste vocab < 40% Y el pool
 * de moldes sin usar está casi agotado → parar reintentos y marcar revisión manual.
 */
import { normalizeB1Topic } from './b1Topics.mjs';
import { countRemainingMolds } from './topicMoldCompatibility.mjs';
import { checkT5VocabIntegration } from './lesenT5SubtypeVocab.mjs';

export const VOCAB_FIT_TRIP_THRESHOLD = 0.4;
export const REMAINING_MOLDS_EXHAUSTED = 1;

export class TopicMoldCircuitBreakerError extends Error {
  /** @param {{ topic: string, teil: number, attempts: object[], message: string }} meta */
  constructor(meta) {
    super(meta.message);
    this.name = 'TopicMoldCircuitBreakerError';
    this.topic = meta.topic;
    this.teil = meta.teil;
    this.attempts = meta.attempts;
  }
}

function cellKey(topic, teil) {
  return `${normalizeB1Topic(topic)}|lesen-t${teil}`;
}

function getStore(session) {
  if (!session) return null;
  if (!session._topicMoldCircuit) session._topicMoldCircuit = {};
  return session._topicMoldCircuit;
}

/**
 * Registra un intento de generación para la celda (ok o fail).
 * @param {object} session
 * @param {{ topic: string, teil: number, vocabRatio?: number|null, remainingMolds?: number|null, moldGateFailure?: boolean, ok?: boolean }} entry
 */
export function recordTopicMoldAttempt(session, entry) {
  const store = getStore(session);
  if (!store) return;
  const key = cellKey(entry.topic, entry.teil);
  if (!store[key]) store[key] = { attempts: [] };
  store[key].attempts.push({
    ts: new Date().toISOString(),
    vocabRatio: entry.vocabRatio ?? null,
    remainingMolds: entry.remainingMolds ?? null,
    moldGateFailure: !!entry.moldGateFailure,
    ok: entry.ok === true,
  });
  // Keep last 4 for diagnostics
  if (store[key].attempts.length > 4) store[key].attempts = store[key].attempts.slice(-4);
}

/**
 * @returns {{ trip: boolean, reason?: string, attempts?: object[] }}
 */
export function assessTopicMoldCircuitBreaker(session, topic, teil, opts = {}) {
  const store = getStore(session);
  const key = cellKey(topic, teil);
  const attempts = store?.[key]?.attempts || [];
  if (attempts.length < 2) return { trip: false, attempts };

  const last2 = attempts.slice(-2);
  const lowVocab = last2.every(
    (a) => a.vocabRatio != null && a.vocabRatio < VOCAB_FIT_TRIP_THRESHOLD,
  );
  if (!lowVocab) return { trip: false, attempts: last2 };

  const remaining =
    opts.remainingMolds ??
    last2[last2.length - 1]?.remainingMolds ??
    countRemainingMolds(teil, topic, opts);

  const nearlyExhausted = remaining <= REMAINING_MOLDS_EXHAUSTED;
  const bothMoldFails = last2.every((a) => a.moldGateFailure);

  if (nearlyExhausted || bothMoldFails) {
    return {
      trip: true,
      attempts: last2,
      remainingMolds: remaining,
      reason:
        `Circuit breaker: vocab <${VOCAB_FIT_TRIP_THRESHOLD * 100}% en 2 intentos consecutivos ` +
        `(ratios: ${last2.map((a) => (a.vocabRatio != null ? `${Math.round(a.vocabRatio * 100)}%` : '?')).join(', ')}) ` +
        `y pool casi agotado (${remaining} molde(s) restante(s)) — revisión manual`,
    };
  }

  return { trip: false, attempts: last2, remainingMolds: remaining };
}

/** Lanza TopicMoldCircuitBreakerError si el breaker está abierto. */
export function assertTopicMoldCircuitClosed(session, topic, teil, opts = {}) {
  const assessment = assessTopicMoldCircuitBreaker(session, topic, teil, opts);
  if (!assessment.trip) return assessment;
  throw new TopicMoldCircuitBreakerError({
    topic: normalizeB1Topic(topic),
    teil: Number(teil),
    attempts: assessment.attempts,
    message: assessment.reason,
  });
}

export function vocabRatioFromBatch(batch, opts = {}) {
  const fb = batch?.userVocabFeedback;
  if (!fb?.requested?.length) return null;
  const teil = Number(opts.teil ?? batch?.teil ?? batch?.passages?.[0]?.teil);
  if (teil === 5) {
    const gate = checkT5VocabIntegration(batch);
    if (gate.ok) return Math.max(VOCAB_FIT_TRIP_THRESHOLD, typeof fb.ratio === 'number' ? fb.ratio : 1);
    if (typeof fb.ratio === 'number') return fb.ratio;
    return gate.requested ? gate.count / gate.requested : 0;
  }
  if (typeof fb.ratio === 'number') return fb.ratio;
  return (fb.used?.length || 0) / fb.requested.length;
}

/** True when generation stopped on topic×mold circuit / manual review (no API spend). */
export function isTopicMoldSessionBlockReason({ reason, gate } = {}) {
  const g = String(gate || '');
  if (g === 'topic-mold-block' || g === 'topic-mold-circuit') return true;
  const r = String(reason || '');
  if (/Circuit breaker:/i.test(r)) return true;
  if (/topic-mold-circuit/i.test(r)) return true;
  if (/Celda marcada para revisión manual/i.test(r)) return true;
  return false;
}

/** Exclude topic×teil for the rest of this factory session (diagnostics). */
export function excludeTopicMoldForSession(session, topic, teil) {
  const store = getStore(session);
  if (!store) return;
  if (!session._topicMoldExcludedTopics) session._topicMoldExcludedTopics = new Set();
  session._topicMoldExcludedTopics.add(cellKey(topic, teil));
}
