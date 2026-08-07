/**
 * Acumula moldes usados en la sesión pool-fill (evita clones T4/T5 intra-corrida).
 */
import { detectT4DebateTopic, detectT5Subtype } from './lesenSubtypeRotation.mjs';

function uniqPush(arr, value) {
  if (!value || arr.includes(value)) return;
  arr.push(value);
}

/**
 * Tras cada parte OK, excluir subtipo/debate/título en los siguientes intentos de la sesión.
 * @param {object} sessionArgs — args de createLesenFactorySession (mutado in-place)
 * @param {object} batch — batch generado OK
 */
export function pushSessionMoldExclude(sessionArgs, batch) {
  if (!sessionArgs || !batch) return;

  sessionArgs._excludeSubtypes = sessionArgs._excludeSubtypes || [];
  sessionArgs._excludeTitles = sessionArgs._excludeTitles || [];

  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil);

  if (teil === 5) {
    const st = batch._textSubtype || detectT5Subtype(batch);
    uniqPush(sessionArgs._excludeSubtypes, st);
    const profile = batch._t5VariantProfile || batch._variantProfile;
    if (st && profile) uniqPush(sessionArgs._excludeSubtypes, `${st}:${profile}`);
  }

  if (teil === 4) {
    const dt = batch._debateSeed || batch._debateTopic || detectT4DebateTopic(batch);
    uniqPush(sessionArgs._excludeSubtypes, dt);
  }

  const title = String(batch.passages?.[0]?.title || batch.passage?.title || '').trim();
  if (title) uniqPush(sessionArgs._excludeTitles, title);
}

/** Acumula batch OK en corpus estructural de sesión (CHK-29). */
export function pushSessionStructuralCorpus(sessionArgs, batch) {
  if (!sessionArgs || !batch) return;
  const teil = Number(batch.teil ?? batch.questions?.[0]?.teil);
  if (![4, 5].includes(teil)) return;
  sessionArgs.structuralCorpus = sessionArgs.structuralCorpus || [];
  sessionArgs.structuralCorpus.push({
    ...batch,
    id: batch.id || sessionArgs._lastBatchId || null,
  });
}

/** Restaura exclude lists desde checkpoint pool-fill-teil. */
export function restoreSessionMoldExclude(sessionArgs, checkpoint) {
  if (!sessionArgs || !checkpoint) return;
  sessionArgs._excludeSubtypes = [...(checkpoint.excludeSubtypes || [])];
  sessionArgs._excludeTitles = [...(checkpoint.excludeTitles || [])];
}

/** Serializa exclude lists para checkpoint. */
export function snapshotSessionMoldExclude(sessionArgs) {
  return {
    excludeSubtypes: [...(sessionArgs?._excludeSubtypes || [])],
    excludeTitles: [...(sessionArgs?._excludeTitles || [])],
  };
}
