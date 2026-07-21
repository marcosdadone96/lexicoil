/**
 * l2McqDistinctRepair.mjs — Reparación localizada L2 (solo opciones + explanation).
 */
import { buildL2McqDistinctRepairPrompt } from './lesenTemplatePrompt.mjs';
import { extractJson } from './extractJson.mjs';

function passageForQuestion(batch, question) {
  const pid = question.passageId;
  return (batch.passages || []).find((p) => p.id === pid) || batch.passages?.[0] || null;
}

function mergeQuestionPatch(question, patch) {
  if (!patch || typeof patch !== 'object') return question;
  const out = { ...question };
  if (Array.isArray(patch.options) && patch.options.length >= 3) {
    out.options = patch.options.slice(0, 3).map(String);
  }
  if (typeof patch.explanation === 'string' && patch.explanation.trim()) {
    out.explanation = patch.explanation.trim();
  }
  if (patch.correct != null) out.correct = patch.correct;
  if (patch.correctAnswer != null) out.correctAnswer = patch.correctAnswer;
  return out;
}

/**
 * Repara 1+ preguntas señaladas por SEM-MCQ-DISTINCT sin regenerar pasajes.
 *
 * @param {object} batch
 * @param {Array<{ itemId: string, detail?: string }>} findings
 * @param {Function} callLlm - async ({ prompt, maxTokens }) => { text }
 * @returns {Promise<object|null>} batch actualizado o null si falla
 */
export async function repairL2McqDistinctBatch(batch, findings, callLlm) {
  if (!batch?.questions?.length || !findings?.length) return null;

  const byItem = new Map();
  for (const f of findings) {
    const id = f.itemId;
    if (!id || id === 'part') continue;
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(f);
  }
  if (!byItem.size) return null;

  let questions = [...batch.questions];
  let repairedAny = false;

  for (const [itemId, itemFindings] of byItem) {
    const qIdx = questions.findIndex((q) => q.id === itemId);
    if (qIdx < 0) continue;
    const question = questions[qIdx];
    const passage = passageForQuestion(batch, question);
    if (!passage?.text) continue;

    const prompt = buildL2McqDistinctRepairPrompt({
      passage,
      question,
      findings: itemFindings,
    });

    let raw;
    try {
      raw = await callLlm({ prompt, maxTokens: 2048 });
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = extractJson(raw.text ?? raw);
    } catch {
      continue;
    }

    const patch = parsed?.question || parsed;
    if (!patch?.options?.length) continue;

    questions[qIdx] = mergeQuestionPatch(question, patch);
    repairedAny = true;
  }

  return repairedAny ? { ...batch, questions } : null;
}
