/**
 * wordMatchRepair.mjs — Reparación localizada word-matching (T1 afirmaciones, T2/T5 MCQ).
 */
import { randomBytes } from 'node:crypto';
import { buildT1QuestionsRepairPrompt, buildMcqWordCopyRepairPrompt } from './lesenTemplatePrompt.mjs';
import { extractJson } from './extractJson.mjs';
import { coerceGeneratedLesenPart } from './normalizeBatch.mjs';
import {
  tokenize,
  hasLongLiteralOverlap,
  sharedContentTokens,
} from './lesenBatchQuality.mjs';

const WORD_MATCH_RE =
  /palabras idénticas|copia literal|copia ≥|comparten demasiadas palabras|word-matching/i;

export function hasWordMatchSignal(issues) {
  return (issues || []).some((i) => WORD_MATCH_RE.test(String(i)));
}

/** @returns {Array<{ itemId: string, detail: string }>} */
export function parseWordMatchFindings(issues) {
  const out = [];
  for (const issue of issues || []) {
    const s = String(issue);
    if (!WORD_MATCH_RE.test(s)) continue;
    const m = s.match(/^(gen-q-[^\s:]+):/);
    if (m) out.push({ itemId: m[1], detail: s });
  }
  return out;
}

function passageForbiddenTokens(text, limit = 25) {
  const freq = new Map();
  for (const t of tokenize(text)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

function passageForQuestion(batch, question) {
  const pid = question.passageId;
  return (batch.passages || []).find((p) => p.id === pid) || batch.passages?.[0] || null;
}

function mergeMcqPatch(question, patch) {
  if (!patch || typeof patch !== 'object') return question;
  const out = { ...question };
  if (Array.isArray(patch.options) && patch.options.length >= 3) {
    out.options = patch.options.slice(0, 3).map(String);
  }
  if (typeof patch.question === 'string' && patch.question.trim()) {
    out.question = patch.question.trim();
  }
  if (typeof patch.explanation === 'string' && patch.explanation.trim()) {
    out.explanation = patch.explanation.trim();
  }
  if (patch.correct != null) out.correct = patch.correct;
  if (patch.correctAnswer != null) out.correctAnswer = patch.correctAnswer;
  return out;
}

function correctOptionText(question) {
  const letter = String(question.correctAnswer || question.correct || '')
    .toLowerCase()
    .replace(/[^a-d]/g, '');
  const correctOpt = (question.options || []).find((o) =>
    String(o).toLowerCase().trim().startsWith(`${letter})`),
  );
  return correctOpt ? String(correctOpt).replace(/^[a-d]\)\s*/i, '') : '';
}

function mcqWordCopyStillBad(question, passage, teil) {
  const literalMinWords = Number(teil) === 5 ? 5 : 4;
  const body = `${passage.title || ''} ${passage.text || ''}`;
  const optText = correctOptionText(question);
  if (!optText) return false;
  if (hasLongLiteralOverlap(optText, body, literalMinWords)) return true;
  if (sharedContentTokens(question.question, optText).length >= 3) return true;
  const sharedWithPassage = sharedContentTokens(optText, body);
  return sharedWithPassage.length >= 4;
}

/**
 * T1: reescribe las 6 afirmaciones; pasaje fijo.
 */
export async function repairT1WordMatchBatch(batch, qualityIssues, callLlm, opts = {}) {
  if (!batch?.passages?.[0]?.text || !batch?.questions?.length) return null;

  const passage = batch.passages[0];
  const idSuffix = randomBytes(4).toString('hex');
  const prompt = buildT1QuestionsRepairPrompt({
    passage,
    idSuffix,
    forbiddenTokens: passageForbiddenTokens(passage.text),
    qualityIssues: qualityIssues || [],
  });

  console.log('T1: reparando solo afirmaciones (pasaje fijo)…');

  let raw;
  try {
    raw = await callLlm({ prompt, maxTokens: Math.min(opts.maxTokens ?? 4096, 4096) });
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = extractJson(raw.text ?? raw);
  } catch {
    return null;
  }

  const newQuestions = Array.isArray(parsed?.questions) ? parsed.questions : null;
  if (!newQuestions?.length) return null;

  return coerceGeneratedLesenPart(
    { passages: batch.passages, questions: newQuestions },
    {
      module: 'lesen',
      teil: 1,
      lang: opts.lang || 'de',
      level: opts.level || 'B1',
      rootTopicTag: batch.topicTag || batch._requestedTopic || null,
    },
  );
}

/**
 * T2/T5: reescribe solo la(s) pregunta(s) con opción correcta copiando el pasaje.
 */
export async function repairMcqWordCopyBatch(batch, teil, findings, callLlm, opts = {}) {
  if (!batch?.questions?.length || !findings?.length) return null;
  const t = Number(teil);
  const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 2);

  const byItem = new Map();
  for (const f of findings) {
    if (!f.itemId) continue;
    if (!byItem.has(f.itemId)) byItem.set(f.itemId, []);
    byItem.get(f.itemId).push(f);
  }
  if (!byItem.size) return null;

  let questions = [...batch.questions];
  let repairedAny = false;
  const minWords = t === 5 ? 5 : 4;

  for (const [itemId, itemFindings] of byItem) {
    const qIdx = questions.findIndex((q) => q.id === itemId);
    if (qIdx < 0) continue;
    let question = questions[qIdx];
    const passage = passageForQuestion(batch, question);
    if (!passage?.text) continue;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt = buildMcqWordCopyRepairPrompt({
        passage,
        question,
        teil: t,
        minWords,
        findings: itemFindings,
        forbiddenTokens: passageForbiddenTokens(passage.text),
      });

      console.log(`T${t}: reparando pregunta ${itemId} (word-copy, pasaje fijo, intento ${attempt}/${maxAttempts})…`);

      let raw;
      try {
        raw = await callLlm({ prompt, maxTokens: 2048 });
      } catch {
        break;
      }

      let parsed;
      try {
        parsed = extractJson(raw.text ?? raw);
      } catch {
        continue;
      }

      const patch = parsed?.question || parsed;
      if (!patch?.options?.length) continue;

      const patched = mergeMcqPatch(question, patch);
      if (!mcqWordCopyStillBad(patched, passage, t)) {
        questions[qIdx] = patched;
        repairedAny = true;
        break;
      }
      question = patched;
      console.log(`  word-copy aún detectado en ${itemId} tras intento ${attempt}`);
    }
  }

  return repairedAny ? { ...batch, questions } : null;
}

/**
 * Router word-matching por Teil.
 */
export async function repairWordMatchBatch(batch, teil, issues, callLlm, opts = {}) {
  const t = Number(teil);
  if (t === 1) {
    return repairT1WordMatchBatch(batch, issues, callLlm, opts);
  }
  if (t === 2 || t === 5) {
    const findings = parseWordMatchFindings(issues);
    return repairMcqWordCopyBatch(batch, t, findings, callLlm, opts);
  }
  return null;
}
