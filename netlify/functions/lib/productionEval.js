'use strict';

/**
 * Production exam eval — Schreiben rubric + Sprechen in one AI response.
 * Used by claude-chat scoreProductionModules.
 */
const { extractJsonObject, certName, callAnthropicJson } = require('./proAiModes.js');

const WRITING_RUBRIC_KEYS = ['erfuellung', 'kohaerenz', 'wortschatz', 'strukturen'];

function writingCorrectionSystem(lang, level, passPercent, feedbackLevel = 'full') {
  const cert = certName(lang);
  const explLang = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';
  if (feedbackLevel === 'basic') {
    return `You are an official ${cert} examiner at level ${level}. Score each Schreiben task using the Goethe rubric dimensions (0–25 each). Total score 0–100 = sum of dimensions. passed=true when totalScore >= ${passPercent}.
Do NOT provide corrected text, per-error corrections, or grammarPoints.
Return ONLY valid JSON (no markdown):
{"schreiben":[{"id":"...","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25},"summary":"brief orientative note (1-2 sentences)","errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0}}],"sprechen":[{"id":"...","totalScore":0-100,"passed":true,"overallFeedback":"brief orientative note","errorCounts":{"grammar":0,"vocab":0,"pronunciation":0,"fluency":0}}]}
Write summary in ${explLang}.`;
  }
  return `You are an official ${cert} examiner at level ${level}. Score and correct each Schreiben task using the Goethe rubric:
- Erfüllung (task fulfilment, 0–25)
- Kohärenz (coherence, 0–25)
- Wortschatz (vocabulary range/accuracy, 0–25)
- Strukturen (grammar/structures, 0–25)
Total score 0–100 = sum of rubric dimensions. passed=true when totalScore >= ${passPercent}.

Return ONLY valid JSON (no markdown) with this exact shape:
{"schreiben":[{"id":"...","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25},"correctedText":"...","errors":[{"original":"...","correction":"...","type":"grammar|vocab|spelling|register|cohesion","explanation":"..."}],"summary":"...","grammarPoints":[{"tag":"...","explanation":"...","example":"..."}]}],"sprechen":[{"id":"...","totalScore":0-100,"passed":true,"criteria":[{"name":"Task Achievement","score":0-5,"comment":"..."},{"name":"Vocabulary Range","score":0-5,"comment":"..."},{"name":"Grammar Accuracy","score":0-5,"comment":"..."},{"name":"Coherence & Fluency","score":0-5,"comment":"..."}],"overallFeedback":"...","strongPoints":["..."],"improvements":["..."],"correctedVersion":"..."}]}

Max 8 errors and 3 grammarPoints per Schreiben task. Write explanations in ${explLang}.`;
}

function buildProductionEvalUserContent({ schreiben = [], sprechen = [], passPercent = 60 }) {
  const blocks = [`Pass threshold per module: ${passPercent}%`, ''];
  if (schreiben.length) {
    blocks.push('SCHREIBEN TASKS:');
    schreiben.forEach((t, i) => {
      blocks.push(
        `[Schreiben ${i + 1} id=${t.id || i}]`,
        `Task: ${t.task || '(writing task)'}`,
        `Minimum words: ${t.minWords || 'n/a'}`,
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

function normalizeRubric(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rubric = {};
  let sum = 0;
  let any = false;
  for (const k of WRITING_RUBRIC_KEYS) {
    const v = clampScore(raw[k], 0, 25);
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

function normalizeSchreibenItem(item, passPercent, feedbackLevel = 'full') {
  if (!item || typeof item !== 'object') return null;
  const rubricNorm = normalizeRubric(item.rubric);
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
  return {
    ...base,
    correctedText: String(item.correctedText || item.corrected || '').trim(),
    errors: Array.isArray(item.errors) ? item.errors.slice(0, 8) : [],
    grammarPoints: Array.isArray(item.grammarPoints) ? item.grammarPoints.slice(0, 3) : [],
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
  };
  if (feedbackLevel === 'basic') {
    return base;
  }
  return {
    ...base,
    criteria: Array.isArray(item.criteria) ? item.criteria : [],
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
    const norm = normalizeSchreibenItem(raw, passPercent, feedbackLevel);
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
function writingScoreExtensionPrompt(passPercent, feedbackLevel = 'full') {
  if (feedbackLevel === 'basic') {
    return ` Also include "totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25},"errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0} where passed is true when totalScore>=${passPercent}. Do NOT include correctedText, errors, or grammarPoints.`;
  }
  return ` Also include "totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25} where passed is true when totalScore>=${passPercent}.`;
}

function writingCorrectionPrompt(lang, level, passPercent, feedbackLevel = 'full') {
  const cert = certName(lang);
  const explLang = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';
  if (feedbackLevel === 'basic') {
    return `You are an official ${cert} examiner at level ${level}. Score the candidate's writing task response. Return ONLY valid JSON (no markdown, no prose):
{"summary":"brief orientative note","totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25},"errorCounts":{"grammar":0,"vocab":0,"spelling":0,"register":0,"cohesion":0}}${writingScoreExtensionPrompt(passPercent, 'basic')} Write summary in ${explLang}.`;
  }
  return `You are an official ${cert} examiner at level ${level}. Correct the candidate's writing task response. Return ONLY valid JSON (no markdown, no prose) with this exact shape:
{"correctedText":"...","errors":[{"original":"...","correction":"...","type":"grammar|vocab|spelling|register|cohesion","explanation":"..."}],"summary":"...","grammarPoints":[{"tag":"...","explanation":"...","example":"..."}],"totalScore":0-100,"passed":true,"rubric":{"erfuellung":0-25,"kohaerenz":0-25,"wortschatz":0-25,"strukturen":0-25}}
Be concise: max 8 prioritized errors and max 3 grammarPoints.${writingScoreExtensionPrompt(passPercent, 'full')} Write explanations in ${explLang}.`;
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
