/**
 * Lesen delivery gate — shared terminal + web hybrid (post-factory generation).
 *
 * T3 incluido en SEM-1 (matching keys). SEM-2 sigue en publish/delivery (skipSem2:false).
 */
import { validatePart } from './partGate.mjs';
import { isPartPoolReady } from '../audit-pass-2.mjs';

export function lesenDeliveryGateOpts(teil) {
  const t = Number(teil);
  return {
    semantic: true,
    skipSem2: false,
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
    ? isPartPoolReady(gate.batch, { semantic: true, skipSem2: false })
    : false;

  return { gate, poolReady, batch: gate.batch };
}
