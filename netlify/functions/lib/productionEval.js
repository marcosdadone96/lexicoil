'use strict';

/**
 * Production exam eval — Schreiben rubric + Sprechen in one AI response.
 * Used by claude-chat scoreProductionModules.
 */
const { extractJsonObject, certName, callAnthropicJson } = require('./proAiModes.js');
const GrammarCategories = require('../../../js/library/grammarCategories.js');

const WRITING_RUBRIC_KEYS = ['erfuellung', 'kohaerenz', 'wortschatz', 'strukturen'];
const GRAMMAR_CAT_PROMPT = GrammarCategories.promptInstruction();

function writingCorrectionSystem(lang, level, passPercent, feedbackLevel = 'full') {
  const cert = certName(lang);
  const explLang = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';
  if (feedbackLevel === 'basic') {
    return `You are an official ${cert} examiner at level ${level}. Score each Schreiben task using the Goethe rubric dimensions; per-dimension maxima vary by Teil — use the "Rubric max for this task" line in each Schreiben block (do not assume 25 fixed). Total score 0–100 = sum of dimensions. passed=true when totalScore >= ${passPercent}.
Do NOT provide corrected text, per-error corrections, or grammarPoints.
For Sprechen: score from the transcript only. Do NOT claim to evaluate Aussprache/pronunciation from audio (transcript-only). Note that in overallFeedback if relevant.
Return ONLY valid JSON (no markdown):
{"schreiben":[{"id":"...","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-M,"kohaerenz":0-M,"wortschatz":0-M,"strukturen":0-M},"summary":"brief orientative note (1-2 sentences)","errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0}}],"sprechen":[{"id":"...","totalScore":0-100,"passed":true,"overallFeedback":"brief orientative note","errorCounts":{"grammar":0,"vocab":0,"pronunciation":0,"fluency":0},"ausspracheNote":"Aussprache nicht bewertbar (nur Transkript)"}]}
M = per "Rubric max for this task" in each Schreiben block (T1/T2: 25 each; T3: Erfüllung/Kohärenz 20, Wortschatz/Strukturen 30). Write summary/overallFeedback in ${explLang}.`;
  }
  return `You are an official ${cert} examiner at level ${level}. Score and correct each Schreiben task using the Goethe rubric:
- Erfüllung (task fulfilment) — max per "Rubric max for this task" in each Schreiben block (varies by Teil; do not assume 25 fixed)
- Kohärenz (coherence) — same: use that task's Rubric max
- Wortschatz (vocabulary range/accuracy) — same: use that task's Rubric max
- Strukturen (grammar/structures) — same: use that task's Rubric max
Total score 0–100 = sum of rubric dimensions. passed=true when totalScore >= ${passPercent}.

For each Sprechen task, score the candidate TRANSCRIPT with these 4 Goethe oral criteria (0–5 each; totalScore 0–100 = sum×5):
1. Aufgabenerfüllung (Task Achievement)
2. Wortschatz (Vocabulary Range)
3. Grammatik / Strukturen (Grammar Accuracy)
4. Kohärenz & Flüssigkeit (Coherence & Fluency)
IMPORTANT: Aussprache/pronunciation CANNOT be evaluated from a transcript — set ausspracheNote to a short disclaimer in ${explLang} (e.g. "Aussprache nicht bewertbar — nur Transkript") and keep pronunciation errorCounts at 0 unless the transcript itself marks unclear words.
Cite language errors verbatim in "errors" (original → correction), max 8 per Sprechen task. Write all feedback in ${explLang}.

Return ONLY valid JSON (no markdown):
{"schreiben":[{"id":"...","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-M,"kohaerenz":0-M,"wortschatz":0-M,"strukturen":0-M},"correctedText":"...","errors":[{"original":"...","correction":"...","type":"grammar|vocab|spelling|register|cohesion","grammarCategory":"${GrammarCategories.PROMPT_LIST} (required when type=grammar)","explanation":"..."}],"summary":"...","grammarPoints":[{"tag":"...","explanation":"...","example":"..."}],"grammarErrorSummary":[{"category":"...","count":0,"severity":"major|minor"}]}],"sprechen":[{"id":"...","totalScore":0-100,"passed":true,"criteria":[{"name":"Aufgabenerfüllung","score":0-5,"comment":"..."},{"name":"Wortschatz","score":0-5,"comment":"..."},{"name":"Grammatik","score":0-5,"comment":"..."},{"name":"Kohärenz & Flüssigkeit","score":0-5,"comment":"..."}],"errors":[{"original":"...","correction":"...","type":"grammar|vocab|register|fluency","grammarCategory":"${GrammarCategories.PROMPT_LIST} (required when type=grammar)","explanation":"..."}],"grammarErrorSummary":[{"category":"...","count":0,"severity":"major|minor"}],"ausspracheNote":"...","overallFeedback":"...","strongPoints":["..."],"improvements":["..."],"correctedVersion":"..."}]}
M = per "Rubric max for this task" in each Schreiben block (T1/T2: 25 each; T3: Erfüllung/Kohärenz 20, Wortschatz/Strukturen 30).

Max 8 errors and 3 grammarPoints per Schreiben task. Max 8 errors per Sprechen task. ${GRAMMAR_CAT_PROMPT} Write explanations in ${explLang}.`;
}

function buildProductionEvalUserContent({ schreiben = [], sprechen = [], passPercent = 60 }) {
  const blocks = [`Pass threshold per module: ${passPercent}%`, ''];
  if (schreiben.length) {
    blocks.push('SCHREIBEN TASKS:');
    schreiben.forEach((t, i) => {
      const max = rubricMaxForTeil(t.teil);
      blocks.push(
        `[Schreiben ${i + 1} id=${t.id || i}]`,
        `Task: ${t.task || '(writing task)'}`,
        `Minimum words: ${t.minWords || 'n/a'}`,
        `Rubric max for this task (Teil ${t.teil}): Erfüllung ${max.erfuellung}, Kohärenz ${max.kohaerenz}, Wortschatz ${max.wortschatz}, Strukturen ${max.strukturen}`,
        `Candidate text:\n${t.userText || '(empty)'}`,
        '',
      );
    });
  }
  if (sprechen.length) {
    blocks.push('SPRECHEN TASKS:');
    sprechen.forEach((t, i) => {
      blocks.push(
        `[Sprechen ${i + 1} id=${t.id || i}]`,
        `Situation: ${t.situation || ''}`,
        `Points: ${(t.points || []).join('; ')}`,
        `Candidate transcript:\n${t.transcript || '(empty)'}`,
        `Model reference:\n${t.modelAnswer || '(none)'}`,
        '',
      );
    });
  }
  return blocks.join('\n');
}

function clampScore(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Goethe-scaled rubric maxima (sum 100). T1/T2: 25 each; T3: 20/20/30/30. */
function rubricMaxForTeil(teil) {
  if (Number(teil) === 3) return { erfuellung: 20, kohaerenz: 20, wortschatz: 30, strukturen: 30 };
  return { erfuellung: 25, kohaerenz: 25, wortschatz: 25, strukturen: 25 };
}

function normalizeRubric(raw, maxMap = { erfuellung: 25, kohaerenz: 25, wortschatz: 25, strukturen: 25 }) {
  if (!raw || typeof raw !== 'object') return null;
  const rubric = {};
  let sum = 0;
  let any = false;
  for (const k of WRITING_RUBRIC_KEYS) {
    const v = clampScore(raw[k], 0, maxMap[k]);
    if (v != null) {
      rubric[k] = v;
      sum += v;
      any = true;
    }
  }
  return any ? { rubric, sum } : null;
}

function normalizeErrorCounts(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const keys = ['grammar', 'vocab', 'spelling', 'register', 'cohesion', 'pronunciation', 'fluency'];
  const out = {};
  for (const k of keys) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

function normalizeSchreibenItem(item, passPercent, feedbackLevel = 'full', teil) {
  if (!item || typeof item !== 'object') return null;
  const rubricNorm = normalizeRubric(item.rubric, rubricMaxForTeil(teil));
  let totalScore = clampScore(item.totalScore ?? item.score, 0, 100);
  if (totalScore == null && rubricNorm) totalScore = clampScore(rubricNorm.sum, 0, 100);
  if (totalScore == null) return null;
  const passed = item.passed === true || totalScore >= passPercent;
  const base = {
    id: String(item.id ?? ''),
    score: totalScore,
    totalScore,
    passed,
    evaluated: true,
    ai: true,
    feedbackLevel,
    rubric: rubricNorm?.rubric || item.rubric || {},
    summary: String(item.summary || '').trim(),
    errorCounts: normalizeErrorCounts(item.errorCounts),
  };
  if (feedbackLevel === 'basic') {
    return base;
  }
  const errors = GrammarCategories.normalizeGrammarErrors(item.errors);
  const grammarErrorSummary = GrammarCategories.normalizeGrammarErrorSummary(
    item.grammarErrorSummary,
    errors,
  );
  return {
    ...base,
    correctedText: String(item.correctedText || item.corrected || '').trim(),
    errors,
    grammarPoints: Array.isArray(item.grammarPoints) ? item.grammarPoints.slice(0, 3) : [],
    grammarErrorSummary,
  };
}

function normalizeSprechenItem(item, passPercent, feedbackLevel = 'full') {
  if (!item || typeof item !== 'object') return null;
  const totalScore = clampScore(item.totalScore ?? item.score, 0, 100);
  if (totalScore == null) return null;
  const base = {
    id: String(item.id ?? ''),
    score: totalScore,
    totalScore,
    passed: item.passed === true || totalScore >= passPercent,
    evaluated: true,
    ai: true,
    feedbackLevel,
    overallFeedback: String(item.overallFeedback || '').trim(),
    errorCounts: normalizeErrorCounts(item.errorCounts),
    transcript: String(item.transcript || '').trim(),
    ausspracheNote: String(item.ausspracheNote || '').trim(),
  };
  if (feedbackLevel === 'basic') {
    return base;
  }
  const errors = GrammarCategories.normalizeGrammarErrors(item.errors);
  const grammarErrorSummary = GrammarCategories.normalizeGrammarErrorSummary(
    item.grammarErrorSummary,
    errors,
  );
  return {
    ...base,
    criteria: Array.isArray(item.criteria) ? item.criteria : [],
    errors,
    grammarErrorSummary,
    strongPoints: Array.isArray(item.strongPoints) ? item.strongPoints : [],
    improvements: Array.isArray(item.improvements) ? item.improvements : [],
    correctedVersion: String(item.correctedVersion || '').trim(),
  };
}

function normalizeProductionEvalResponse(
  parsed,
  { schreiben = [], sprechen = [], passPercent = 60, feedbackLevel = 'full' } = {},
) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'parse_failed' };
  const outSchreiben = [];
  const outSprechen = [];
  const byId = (arr) => {
    const map = new Map();
    for (const it of arr || []) {
      const n = it.id != null ? String(it.id) : '';
      if (n) map.set(n, it);
    }
    return map;
  };
  const schParsed = byId(parsed.schreiben);
  const spParsed = byId(parsed.sprechen);
  for (const t of schreiben) {
    const id = String(t.id ?? '');
    const raw = schParsed.get(id) || (parsed.schreiben?.[outSchreiben.length]);
    const norm = normalizeSchreibenItem(raw, passPercent, feedbackLevel, t.teil);
    if (norm) outSchreiben.push({ ...norm, partMeta: { aufgabe: t.aufgabe, teil: t.teil } });
  }
  for (const t of sprechen) {
    const id = String(t.id ?? '');
    const raw = spParsed.get(id) || (parsed.sprechen?.[outSprechen.length]);
    const norm = normalizeSprechenItem(
      { ...raw, transcript: raw?.transcript || t.transcript },
      passPercent,
      feedbackLevel,
    );
    if (norm) outSprechen.push({ ...norm, part: { teil: t.teil, fieldId: t.fieldId } });
  }
  if (!outSchreiben.length && !outSprechen.length) {
    return { ok: false, error: 'empty_eval' };
  }
  return { ok: true, schreiben: outSchreiben, sprechen: outSprechen, feedbackLevel };
}

/** Extended correctWriting JSON — adds rubric score for Pro post-exam correction. */
// TODO: teil no está disponible en este endpoint de tarea única — usa flat 25/25/25/25 para todos los Teile hasta que se plumbee teil desde el frontend (ver productionEval.js normalizeRubric para el patrón correcto).
function writingScoreExtensionPrompt(passPercent, feedbackLevel = 'full') {
  if (feedbackLevel === 'basic') {
    return ` Also include "totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25} (sin variación, Teil no disponible en este endpoint),"errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0} where passed is true when totalScore>=${passPercent}. Do NOT include correctedText, errors, or grammarPoints.`;
  }
  return ` Also include "totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25} (sin variación, Teil no disponible en este endpoint) where passed is true when totalScore>=${passPercent}.`;
}

function writingCorrectionPrompt(lang, level, passPercent, feedbackLevel = 'full') {
  const cert = certName(lang);
  const explLang = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';
  if (feedbackLevel === 'basic') {
    return `You are an official ${cert} examiner at level ${level}. Score the candidate's writing task response. Return ONLY valid JSON (no markdown, no prose):
{"summary":"brief orientative note","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25},"errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0}}${writingScoreExtensionPrompt(passPercent, 'basic')} Write summary in ${explLang}.`;
  }
  return `You are an official ${cert} examiner at level ${level}. Correct the candidate's writing task response. Return ONLY valid JSON (no markdown, no prose) with this exact shape:
{"correctedText":"...","errors":[{"original":"...","correction":"...","type":"grammar|vocab|spelling|register|cohesion","grammarCategory":"${GrammarCategories.PROMPT_LIST} (required when type=grammar)","explanation":"..."}],"summary":"...","grammarPoints":[{"tag":"...","explanation":"...","example":"..."}],"grammarErrorSummary":[{"category":"...","count":0,"severity":"major|minor"}],"totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25}}
Be concise: max 8 prioritized errors and max 3 grammarPoints. ${GRAMMAR_CAT_PROMPT}${writingScoreExtensionPrompt(passPercent, 'full')} Write explanations in ${explLang}.`;
}

async function runProductionEval(
  apiKey,
  { lang, level, passPercent, schreiben, sprechen, model, feedbackLevel = 'full' },
) {
  const system = writingCorrectionSystem(lang, level, passPercent, feedbackLevel);
  const userContent = buildProductionEvalUserContent({ schreiben, sprechen, passPercent });
  const { text } = await callAnthropicJson(apiKey, {
    model: model || process.env.CLAUDE_CORRECTION_MODEL || 'claude-haiku-4-5',
    maxTokens: feedbackLevel === 'basic' ? 1200 : 2500,
    system,
    userContent,
  });
  const parsed = extractJsonObject(text);
  return normalizeProductionEvalResponse(parsed, { schreiben, sprechen, passPercent, feedbackLevel });
}

module.exports = {
  WRITING_RUBRIC_KEYS,
  writingCorrectionSystem,
  writingCorrectionPrompt,
  buildProductionEvalUserContent,
  normalizeProductionEvalResponse,
  normalizeSchreibenItem,
  normalizeSprechenItem,
  writingScoreExtensionPrompt,
  runProductionEval,
};
