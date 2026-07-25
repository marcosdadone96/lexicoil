import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TargetUsage = require(path.join(ROOT, 'js', 'engine', 'targetUsage.js'));

function examShellFromBatch(batch) {
  const module = String(batch.module || batch.passages?.[0]?.module || 'lesen').toLowerCase();
  const key = module === 'horen' ? 'horenParts' : 'lesenParts';
  const part = {
    text: batch.passages?.[0]?.text || '',
    textTitle: batch.passages?.[0]?.title || '',
    transcript: batch.passages?.[0]?.transcript || batch.passages?.[0]?.text || '',
    questions: batch.questions || [],
    teil: batch.teil ?? batch.passages?.[0]?.teil,
  };
  return { [key]: [part] };
}

/**
 * Compute which user-requested words appear naturally in generated content.
 * @param {object} batch
 * @param {string[]} requestedWords — original user list (before CEFR exclusion)
 * @param {{ topic?: string, prompted?: string[], excluded?: object[] }} meta
 */
export function computeVocabFeedback(batch, requestedWords, meta = {}) {
  const requested = (requestedWords || []).map(String).filter(Boolean);
  const shell = examShellFromBatch(batch);
  const derived = TargetUsage.deriveTargetUsage(shell, requested);
  const used = derived.map((u) => u.word);
  const usedSet = new Set(used.map((w) => w.toLowerCase()));
  const notUsed = requested.filter((w) => !usedSet.has(String(w).toLowerCase()));
  const excluded = meta.excluded || [];

  return {
    topic: meta.topic || batch.topicTag || batch.topic || null,
    requested,
    prompted: meta.prompted || requested,
    used,
    notUsed,
    excluded: excluded.map((e) => ({
      word: e.word,
      band: e.band,
      reason: e.reason,
    })),
    ratio: requested.length ? used.length / requested.length : 0,
    targetUsage: derived,
  };
}

export function attachVocabFeedback(batch, requestedWords, meta = {}) {
  const feedback = computeVocabFeedback(batch, requestedWords, meta);
  return {
    ...batch,
    topicTag: meta.topic || batch.topicTag,
    userVocabFeedback: feedback,
    targetUsage: feedback.targetUsage,
  };
}

export function formatVocabFeedbackSummary(feedback) {
  if (!feedback?.requested?.length) return 'Sin vocabulario sugerido.';
  const { used = [], notUsed = [], requested = [], topic } = feedback;
  const topicBit = topic ? ` (tema: ${topic})` : '';
  let msg = `Vocabulario: ${used.length} de ${requested.length} palabras usadas${topicBit}.`;
  if (used.length) msg += ` Integradas: ${used.join(', ')}.`;
  if (notUsed.length) {
    msg += ` No encajaron de forma natural: ${notUsed.join(', ')}.`;
  }
  if (feedback.excluded?.length) {
    msg += ` Excluidas antes de generar (nivel): ${feedback.excluded.map((e) => e.word).join(', ')}.`;
  }
  return msg;
}
