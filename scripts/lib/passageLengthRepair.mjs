/**
 * passageLengthRepair.mjs — Reparación localizada CEFR longitud Lesen T2 (1 llamada LLM).
 * El gate CEFR cuenta la SUMA de ambos pasajes (máx 400); no regenerar desde cero.
 */
import { extractJson } from './extractJson.mjs';
import { buildT2PassageLengthRepairPrompt } from './lesenTemplatePrompt.mjs';
import { checkLesenBatchIngest } from './lesenBatchIngestCheck.mjs';

export const CEFR_T2_COMBINED_MAX = 400;
export const CEFR_T2_COMBINED_TARGET = 395;

const CEFR_LENGTH_RE = /cefr_gate:length_above_max|length_above_max:wordCount/i;

export function passageWordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function combinedPassageWordCount(batch) {
  return (batch.passages || []).reduce((sum, p) => sum + passageWordCount(p.text), 0);
}

export function isOnlyCefrLengthAboveMax(errors) {
  const list = (errors || []).filter(Boolean).map(String);
  return list.length > 0 && list.every((e) => CEFR_LENGTH_RE.test(e));
}

export function parseCefrLengthMax(errors, fallback = CEFR_T2_COMBINED_MAX) {
  for (const e of errors || []) {
    const m = String(e).match(/max=(\d+)/);
    if (m) return Number(m[1]);
  }
  return fallback;
}

export function isLesenT2Batch(batch) {
  const qs = batch?.questions || [];
  return qs.some((q) => String(q.module || '').toLowerCase() === 'lesen' && Number(q.teil) === 2);
}

/**
 * @param {object} batch
 * @param {(opts: object) => Promise<{ text: string }>} callLlm
 * @param {{ lang?: string, level?: string, maxTokens?: number, targetMax?: number }} opts
 */
export async function repairT2PassageLengthBatch(batch, callLlm, opts = {}) {
  if (!isLesenT2Batch(batch)) return null;
  const passages = batch.passages || [];
  if (passages.length < 2) return null;

  const combinedBefore = combinedPassageWordCount(batch);
  const targetMax = opts.targetMax ?? CEFR_T2_COMBINED_TARGET;
  if (combinedBefore <= targetMax) return batch;

  const vocabWords = (batch.targetUsage || batch.userVocabFeedback?.used || [])
    .map((v) => v.word || v)
    .filter(Boolean);

  const prompt = buildT2PassageLengthRepairPrompt({
    passages,
    questions: batch.questions || [],
    combinedBefore,
    targetMax,
    maxAllowed: CEFR_T2_COMBINED_MAX,
    vocabWords,
    topicTag: batch.passages?.[0]?.topicTag || batch._requestedTopic || null,
  });

  console.log(
    `T2: reparando longitud CEFR (${combinedBefore} → ≤${targetMax} palabras, 1 llamada LLM, preguntas fijas)…`,
  );

  const { text } = await callLlm({ prompt, maxTokens: opts.maxTokens ?? 4096 });
  const parsed = extractJson(text);
  const repairedPassages = Array.isArray(parsed?.passages) ? parsed.passages : null;
  if (!repairedPassages?.length) {
    console.log('  passage-length repair: JSON sin passages');
    return null;
  }

  const byId = Object.fromEntries(repairedPassages.map((p) => [p.id, p]));
  const merged = passages.map((p) => {
    const hit = byId[p.id];
    if (!hit?.text) return p;
    return { ...p, text: String(hit.text).trim(), title: hit.title || p.title };
  });

  const out = { ...batch, passages: merged };
  const combinedAfter = combinedPassageWordCount(out);
  if (combinedAfter > CEFR_T2_COMBINED_MAX) {
    console.log(`  passage-length repair: aún ${combinedAfter} palabras (máx ${CEFR_T2_COMBINED_MAX})`);
    return null;
  }

  console.log(`  passage-length repair: ${combinedBefore} → ${combinedAfter} palabras`);
  return out;
}

/** Lesen T2 anti-longitud hint for fix retries (mismo patrón Hören T4). */
export const LESEN_T2_ANTI_LENGTH =
  '\nANTI-LONGITUD T2: son 2 textos de prensa — el gate CEFR cuenta la SUMA (máx 400 palabras total). ' +
  'Cada pasaje ideal 165-195 palabras; NUNCA superes 400 en conjunto. ' +
  'Cuenta palabras de ambos textos antes de responder.';

export function buildLesenT2LengthFixHint(combinedWc = null) {
  const wc = combinedWc != null ? ` (ahora ~${combinedWc})` : '';
  return (
    LESEN_T2_ANTI_LENGTH +
    `\nRecorta${wc} parafraseando: elimina frases de relleno, no repitas ideas, mantén hechos clave para las MCQ.`
  );
}

export function ingestErrorsFromResult(result) {
  if (Array.isArray(result?.issues) && result.issues.length) return result.issues;
  if (result?.ingest?.results) {
    return result.ingest.results.flatMap((r) => r.errors || []);
  }
  return [result?.issue || result?.reason].filter(Boolean);
}

export function shouldRepairT2PassageLength(result, teil) {
  if (Number(teil) !== 2) return false;
  const errors = ingestErrorsFromResult(result);
  return (
    (result?.reason === 'pre-ingest' || result?.gate === 'cefr') &&
    isOnlyCefrLengthAboveMax(errors)
  );
}

export function verifyT2IngestOk(batch, { lang = 'de', level = 'B1', batchId = 'batch' } = {}) {
  return checkLesenBatchIngest(batch, { lang, level, batchId });
}
