'use strict';

/**
 * Structured Goethe B1 Sprechen partner session (T1 plan / T3 feedback — voice + eval).
 * Not a free chat: timed, roles, turn protocol, soft close.
 */

const { getPersona, buildLiveSystemInstruction, resolveTeil } = require('./speakingPersonas.js');

/** Official T1 dialogue length (exam-like). */
const EXAM_DURATION_MS = 3 * 60 * 1000;
/** Practice ceiling (configurable via body / env). */
const PRACTICE_MAX_MS_DEFAULT = 6 * 60 * 1000;
const PRACTICE_MAX_MS_HARD = 8 * 60 * 1000;
/** After time-up: wait for partner to finish current sentence. */
const SOFT_CLOSE_GRACE_MS = 15 * 1000;

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';

/**
 * Live session config locked into ephemeral token + client setup.
 * PTT + NO_INTERRUPTION (operator priority #1).
 */
function buildLiveSessionConfig({ systemInstruction, voiceName }) {
  const voice = voiceName || 'Puck';
  return {
    responseModalities: ['AUDIO'],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
      activityHandling: 'NO_INTERRUPTION',
    },
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
    },
  };
}

/**
 * @param {{ mode?: 'exam'|'practice', durationMs?: number }} opts
 */
function resolveDurationMs(opts = {}) {
  const mode = opts.mode === 'practice' ? 'practice' : 'exam';
  if (Number.isFinite(Number(opts.durationMs)) && Number(opts.durationMs) > 0) {
    const d = Math.min(PRACTICE_MAX_MS_HARD, Math.max(30_000, Number(opts.durationMs)));
    return d;
  }
  if (mode === 'practice') {
    const envMax = Number(process.env.SPEAKING_LIVE_PRACTICE_MAX_MS);
    const max = Number.isFinite(envMax) && envMax > 0 ? envMax : PRACTICE_MAX_MS_DEFAULT;
    return Math.min(PRACTICE_MAX_MS_HARD, max);
  }
  return EXAM_DURATION_MS;
}

function buildExamBlueprint({
  personaId = 'balanced',
  situation = '',
  whoStarts,
  mode = 'exam',
  durationMs,
  fieldId = null,
  examId = null,
  subject = 'de',
  level = 'B1',
  teil = 1,
}) {
  const persona = getPersona(personaId, level);
  if (!persona) throw new Error('invalid_persona');
  const start = whoStarts === 'user' || whoStarts === 'partner' ? whoStarts : null;
  if (!start) throw new Error('whoStarts_required');
  const teilN = resolveTeil(teil);
  const duration = resolveDurationMs({ mode, durationMs });
  const systemInstruction = buildLiveSystemInstruction({
    situation,
    whoStarts: start,
    displayName: persona.displayName,
    personaId: persona.id,
    teil: teilN,
    mode,
    durationMs: duration,
    level,
  });
  const liveConfig = buildLiveSessionConfig({
    systemInstruction,
    voiceName: persona.voiceName,
  });

  return {
    model: LIVE_MODEL,
    personaId: persona.id,
    displayName: persona.displayName,
    whoStarts: start,
    mode: mode === 'practice' ? 'practice' : 'exam',
    durationMs: duration,
    softCloseGraceMs: SOFT_CLOSE_GRACE_MS,
    situation: String(situation || '').slice(0, 4000),
    fieldId,
    examId,
    subject: String(subject || 'de').slice(0, 5),
    level: String(level || 'B1').slice(0, 5),
    teil: teilN,
    systemInstruction,
    liveConfig,
    softClosePrompt:
      'Die Prüfungszeit ist jetzt um. Beende deinen aktuellen Satz höflich in einem kurzen Satz und verabschiede dich. Stelle keine neuen Fragen.',
  };
}

/**
 * Normalize Live transcript events into turns for storage + eval.
 */
function formatCandidateTranscript(turns) {
  const lines = [];
  for (const t of turns || []) {
    const text = String(t.text || '').trim();
    if (!text) continue;
    const label = t.role === 'partner' ? 'Partner' : 'Kandidat';
    lines.push(`${label}: ${text}`);
  }
  return lines.join('\n');
}

/**
 * Payload shape expected by scoreProductionModules / buildProductionEvalUserContent.
 */
function toProductionEvalSprechenTask(session) {
  const turns = session.turns || [];
  const teil = resolveTeil(session.teil);
  return {
    id: String(session.fieldId || session.sessionId || `t${teil}`),
    situation: session.situation || '',
    points: session.points || [],
    transcript: formatCandidateTranscript(turns),
    modelAnswer: session.modelAnswer || '',
    teil,
  };
}

/**
 * Merge streaming transcription chunks into discrete turns.
 */
function appendTranscriptionChunk(turns, { role, text, at = Date.now() }) {
  const chunk = String(text || '').trim();
  if (!chunk) return turns;
  const list = Array.isArray(turns) ? turns.slice() : [];
  const last = list[list.length - 1];
  if (last && last.role === role) {
    last.text = `${last.text} ${chunk}`.replace(/\s+/g, ' ').trim();
    last.at = at;
  } else {
    list.push({ role, text: chunk, at });
  }
  return list;
}

/** @deprecated use buildLiveSystemInstruction from speakingPersonas */
function buildExamSystemInstruction(opts) {
  return buildLiveSystemInstruction({
    situation: opts.situation,
    whoStarts: opts.whoStarts,
    displayName: opts.displayName,
    personaId: opts.personaId,
    teil: opts.teil,
    mode: opts.mode,
    durationMs: opts.durationMs,
  });
}

module.exports = {
  EXAM_DURATION_MS,
  PRACTICE_MAX_MS_DEFAULT,
  PRACTICE_MAX_MS_HARD,
  SOFT_CLOSE_GRACE_MS,
  LIVE_MODEL,
  buildExamSystemInstruction,
  buildLiveSessionConfig,
  resolveDurationMs,
  buildExamBlueprint,
  formatCandidateTranscript,
  toProductionEvalSprechenTask,
  appendTranscriptionChunk,
};
