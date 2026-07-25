/**
 * Lesen delivery gate — shared terminal + web hybrid (post-factory generation).
 *
 * T3: semantic false (CHK-7/8 structural). T4/T5: semantic true (SEM-1).
 */
import { validatePart } from './partGate.mjs';
import { isPartPoolReady } from '../audit-pass-2.mjs';

export function lesenDeliveryGateOpts(teil) {
  const t = Number(teil);
  return {
    semantic: t !== 3,
    skipNormalize: false,
    module: 'lesen',
    teil: t,
  };
}

/**
 * @param {object} batch
 * @param {object} opts
 * @param {number} opts.teil
 * @param {string} [opts.lang='de']
 * @param {string} [opts.level='B1']
 * @param {Array|null} [opts.dedupCorpus]
 * @param {boolean} [opts.skipDedup]
 * @param {number} [opts.dedupThreshold=0.55]
 */
export async function validateLesenDelivery(batch, opts = {}) {
  const teil = Number(opts.teil ?? batch.teil ?? 1);
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const dedupCorpus = opts.dedupCorpus ?? null;
  const skipDedup = opts.skipDedup ?? !dedupCorpus?.length;

  const gate = await validatePart(batch, {
    ...lesenDeliveryGateOpts(teil),
    lang,
    level,
    dedupCorpus: skipDedup ? null : dedupCorpus,
    skipDedup,
    dedupThreshold: opts.dedupThreshold ?? 0.55,
  });

  const poolReady = gate.ok
    ? isPartPoolReady(gate.batch, { semantic: teil !== 3 })
    : false;

  return { gate, poolReady, batch: gate.batch };
}
