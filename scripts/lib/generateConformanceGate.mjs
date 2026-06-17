import { checkBatchConformance } from './blueprintConformance.mjs';

export function buildConformanceRetryNote(failItems) {
  const lines = failItems
    .filter((i) => !i.ok)
    .flatMap((i) => i.reasons.map((r) => `${i.id}: ${r}`));
  return (
    '\n\nCORRECCIÓN OBLIGATORIA: El intento anterior falló por:\n' +
    `${lines.join('\n')}\n` +
    'Devuelve EXACTAMENTE el formato del slot del blueprint.'
  );
}

export function gateBatchBeforeWrite(batch, blueprint) {
  return checkBatchConformance(batch, blueprint);
}
