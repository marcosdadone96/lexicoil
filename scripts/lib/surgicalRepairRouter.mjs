/**
 * surgicalRepairRouter.mjs — Single entry point for localized (1-call) repairs.
 *
 * passage_length (repairT2PassageLengthBatch):
 *   Solo aplica a B1 Lesen T2 — 2 pasajes de prensa con techo CEFR combinado 400 palabras.
 *   Goethe A2: todos los Teile Lesen usan passagesPerPart=1 (T4 = 6 anuncios cortos, exempt).
 *   No hay equivalente A2 → classifyAndRepair.isLesenT2LengthBatch nunca dispara en A2.
 */
import { repairWordMatchBatch } from './wordMatchRepair.mjs';
import { repairL2McqDistinctBatch } from './l2McqDistinctRepair.mjs';
import { repairExplanationBatch } from './explanationRepair.mjs';
import { repairT2PassageLengthBatch } from './passageLengthRepair.mjs';
import { repairMcqLengthBiasBatch } from './mcqLengthBiasRepair.mjs';
import { repairLexicoBatch } from './lexicoRepair.mjs';
import { assertBatchGermanExamContent } from './qualityGates/germanContentLanguageGate.mjs';

/** Gemini 2.5 Flash: disable thinking for 1-call surgical repairs (cost + JSON reliability). */
export const SURGICAL_THINKING_CONFIG = Object.freeze({ thinkingBudget: 0 });

/** Wrap callLlm so every surgical repair disables thinking tokens. */
export function wrapSurgicalCallLlm(callLlm) {
  if (typeof callLlm !== 'function') return callLlm;
  return (opts) =>
    callLlm({
      ...opts,
      thinkingConfig: SURGICAL_THINKING_CONFIG,
    });
}

/** Repair kinds with surgical LLM path (1 targeted call). */
export const SURGICAL_REPAIR_KINDS = new Set([
  'word_match',
  'mcq_distinct',
  'explanation',
  'passage_length',
  'mcq_length_bias',
  'lexico',
]);

/**
 * Run one surgical repair pass. Returns updated batch or null.
 *
 * @param {object} triage - classifyAndRepair result with repairKind
 * @param {object} batch
 * @param {object} ctx - { teil, module, callLlm, maxTokens, lang, level, issues }
 */
export async function runSurgicalRepair(triage, batch, ctx) {
  if (!triage || triage.repaired !== 'targeted' || !triage.repairKind) return null;
  const { repairKind } = triage;
  const { teil, module, callLlm, maxTokens, lang, level, issues } = ctx;
  const surgicalCallLlm = wrapSurgicalCallLlm(callLlm);
  const opts = { maxTokens, lang, level, module: module || batch.questions?.[0]?.module };

  let repaired = null;
  switch (repairKind) {
    case 'word_match':
      repaired = await repairWordMatchBatch(batch, teil, issues || [], surgicalCallLlm, opts);
      break;
    case 'mcq_distinct':
      repaired = await repairL2McqDistinctBatch(
        batch,
        triage.sem2Findings || triage.mcqDistinctFindings || [],
        surgicalCallLlm,
      );
      break;
    case 'explanation':
      repaired = await repairExplanationBatch(
        batch,
        triage.explanationFindings || issues || [],
        surgicalCallLlm,
        { ...opts, teil },
      );
      break;
    case 'passage_length':
      repaired = await repairT2PassageLengthBatch(batch, surgicalCallLlm, opts);
      break;
    case 'mcq_length_bias':
      repaired = await repairMcqLengthBiasBatch(batch, teil, issues || [], surgicalCallLlm, opts);
      break;
    case 'lexico':
      repaired = await repairLexicoBatch(batch, issues || [], surgicalCallLlm, opts);
      break;
    default:
      return null;
  }

  if (!repaired) return null;

  const langGate = assertBatchGermanExamContent(repaired, {
    lang: lang || 'de',
    file: `surgical-repair:${repairKind}`,
  });
  if (!langGate.ok) {
    const detail = langGate.findings[0]?.detail || 'non_german_repair_output';
    console.warn(`  [Q5 repair block] ${repairKind}: ${detail}`);
    return null;
  }

  return repaired;
}

/**
 * Re-run gates after surgical repair (caller supplies finalizeBatch / runDualGates).
 */
export function surgicalRepairLabel(kind, level = 'B1') {
  const lv = String(level || 'B1').toUpperCase();
  const lexicoLabel = lv === 'A2' ? 'léxico B1+' : 'léxico B2+';
  const labels = {
    word_match: 'word-matching',
    mcq_distinct: 'mcq_distinct',
    explanation: 'CHK-18b explanation',
    passage_length: 'CEFR passage length',
    mcq_length_bias: `MCQ length bias (${lv})`,
    lexico: lexicoLabel,
  };
  return labels[kind] || kind;
}
