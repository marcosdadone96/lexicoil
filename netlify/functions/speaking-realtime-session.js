'use strict';

/**
 * Gemini Live Sprechen session (lab / Phase 2).
 * Mints ephemeral Live tokens — GEMINI_API_KEY never sent to the client.
 *
 * Credits: same speaking_realtime bucket as turn-based chat (4 credits, Pro-only).
 * UI of production is NOT wired yet — endpoint is for internal lab + future voice v2.
 *
 * POST { action: 'start'|'finalize'|'get'|'delete', ... }
 */
const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth, emailToUserId } = require('./lib/authLib.js');
const { checkActionAccess } = require('./lib/actionAccessLib.js');
const { resolvePlan } = require('./lib/quotaLib.js');
const { checkAiCredits, confirmAiCreditConsumption, releaseAiCreditConsumption } = require('./lib/aiCredits.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const { PERSONAS, decideWhoStarts, getPersona, resolveTeil, normalizeLevel } = require('./lib/speakingPersonas.js');
const {
  buildExamBlueprint,
  toProductionEvalSprechenTask,
  appendTranscriptionChunk,
  SOFT_CLOSE_GRACE_MS,
} = require('./lib/speakingLiveExam.js');
const { mintEphemeralLiveToken, readGeminiKey } = require('./lib/geminiLiveAuth.js');
const { isSpeakingVoicePilotEligible } = require('./lib/speakingVoicePilot.js');

const CREDIT_ACTION = 'speaking_realtime';
const SESSION_TTL_MS = 20 * 60 * 1000;

function sessionKey(userId, sessionId) {
  return `speaking_live:${userId}:${sessionId}`;
}

function newSessionId() {
  return crypto.randomBytes(12).toString('hex');
}

function publicSession(session, { includeEvalPayload = false } = {}) {
  const out = {
    sessionId: session.sessionId,
    mode: session.mode,
    implementationStatus: session.implementationStatus || 'pilot',
    personaId: session.personaId,
    displayName: session.displayName,
    whoStarts: session.whoStarts,
    fieldId: session.fieldId,
    examId: session.examId,
    situation: session.situation,
    teil: resolveTeil(session.teil),
    durationMs: session.durationMs,
    softCloseGraceMs: session.softCloseGraceMs || SOFT_CLOSE_GRACE_MS,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    status: session.status,
    turnCount: (session.turns || []).length,
    turns: session.turns || [],
    softClosePrompt: session.softClosePrompt,
    live: {
      model: session.model,
      apiVersion: 'v1alpha',
      websocketUrl: session.websocketUrl,
      ptt: true,
      automaticActivityDetectionDisabled: true,
      activityHandling: 'NO_INTERRUPTION',
      inputAudioTranscription: true,
      outputAudioTranscription: true,
    },
  };
  if (includeEvalPayload) {
    out.evalTask = toProductionEvalSprechenTask(session);
    out.candidateTranscript = out.evalTask.transcript;
  }
  return out;
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, DELETE, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (!['POST', 'DELETE', 'GET'].includes(event.httpMethod)) {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const store = getStoreForEvent(event);
  if (!store) return jsonResponse(503, cors, { error: 'store_unavailable' });

  const auth = await requireAuth(event, store);
  if (!auth.ok) {
    return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
  }

  const plan = resolvePlan(auth.user);
  const access = checkActionAccess(plan, CREDIT_ACTION);
  if (!access.ok) {
    return jsonResponse(access.error === 'pro_only' ? 403 : 401, cors, {
      error: access.error || 'forbidden',
      plan: access.plan,
    });
  }

  const userId = emailToUserId(auth.user.email) || String(auth.user.email || '').toLowerCase();
  let body = {};
  try {
    body = event.httpMethod === 'GET' ? {} : parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const action =
    event.httpMethod === 'DELETE'
      ? 'delete'
      : event.httpMethod === 'GET'
        ? 'get'
        : String(body.action || 'start').toLowerCase();

  // ── get ──────────────────────────────────────────────────────────────────
  if (action === 'get') {
    const sessionId = String(body.sessionId || event.queryStringParameters?.sessionId || '');
    if (!sessionId) return jsonResponse(400, cors, { error: 'session_required' });
    const session = await store.get(sessionKey(userId, sessionId), { type: 'json' }).catch(() => null);
    if (!session) return jsonResponse(404, cors, { error: 'session_not_found' });
    return jsonResponse(200, cors, {
      ok: true,
      session: publicSession(session, { includeEvalPayload: session.status === 'finalized' }),
    });
  }

  // ── delete ───────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) return jsonResponse(400, cors, { error: 'session_required' });
    try {
      await store.delete(sessionKey(userId, sessionId));
    } catch (_) {
      /* ignore */
    }
    return jsonResponse(200, cors, { ok: true, deleted: true, sessionId });
  }

  // ── start — mint ephemeral token + exam blueprint ────────────────────────
  if (action === 'start') {
    if (!body.consent) {
      return jsonResponse(400, cors, { error: 'consent_required' });
    }
    if (!isSpeakingVoicePilotEligible(auth.email, plan)) {
      return jsonResponse(403, cors, { error: 'pilot_not_eligible', plan });
    }
    if (!readGeminiKey()) {
      return jsonResponse(503, cors, { error: 'gemini_key_missing', code: 'gemini_key_missing' });
    }

    const personaId = String(body.personaId || 'balanced');
    if (!getPersona(personaId, normalizeLevel(body.level || 'B1'))) return jsonResponse(400, cors, { error: 'invalid_persona' });

    const creditCheck = await checkAiCredits(event, CREDIT_ACTION);
    if (!creditCheck.ok) {
      return jsonResponse(creditCheck.error === 'ai_credits_exhausted' ? 402 : creditCheck.status || 403, cors, {
        error: creditCheck.error,
        remaining: creditCheck.remaining,
        plan,
      });
    }

    const requestId = body.requestId || `speak-live-${Date.now()}`;
    const meta = await confirmAiCreditConsumption(event, CREDIT_ACTION, { requestId });
    if (meta?.error) {
      return jsonResponse(402, cors, { error: meta.error, plan, ...meta });
    }

    const whoStarts = decideWhoStarts();
    const teil = resolveTeil(
      body.teil ?? (String(body.fieldId || '').match(/speak_bp_(\d)/)?.[1]),
    );
    let blueprint;
    try {
      blueprint = buildExamBlueprint({
        personaId,
        situation: body.situation || body.task || '',
        whoStarts,
        teil,
        mode: body.mode === 'practice' ? 'practice' : 'exam',
        durationMs: body.durationMs,
        fieldId: body.fieldId || null,
        examId: body.examId || null,
        subject: body.subject || 'de',
        level: body.level || 'B1',
      });
    } catch (err) {
      await releaseAiCreditConsumption(event, CREDIT_ACTION, { requestId }).catch(() => {});
      return jsonResponse(400, cors, { error: err.message || 'invalid_exam' });
    }

    let minted;
    try {
      minted = await mintEphemeralLiveToken({
        liveConfig: blueprint.liveConfig,
        model: blueprint.model,
        // Token must outlive exam duration + soft close
        expireMinutes: Math.ceil((blueprint.durationMs + SOFT_CLOSE_GRACE_MS) / 60000) + 5,
        newSessionExpireSeconds: 180,
      });
    } catch (err) {
      await releaseAiCreditConsumption(event, CREDIT_ACTION, { requestId }).catch(() => {});
      console.error('[speaking-live] mint failed:', err.message, err.details || '');
      return jsonResponse(503, cors, {
        error: 'ephemeral_mint_failed',
        message: err.message,
        code: err.code || 'ephemeral_mint_failed',
      });
    }

    const sessionId = newSessionId();
    const now = Date.now();
    const session = {
      sessionId,
      userId,
      personaId: blueprint.personaId,
      displayName: blueprint.displayName,
      whoStarts: blueprint.whoStarts,
      mode: blueprint.mode,
      situation: blueprint.situation,
      fieldId: blueprint.fieldId,
      examId: blueprint.examId,
      subject: blueprint.subject,
      level: blueprint.level,
      teil: blueprint.teil,
      durationMs: blueprint.durationMs,
      softCloseGraceMs: blueprint.softCloseGraceMs,
      softClosePrompt: blueprint.softClosePrompt,
      model: blueprint.model,
      websocketUrl: minted.websocketUrl,
      systemInstruction: blueprint.systemInstruction,
      consent: true,
      consentAt: now,
      implementationStatus: 'pilot',
      startedAt: now,
      endsAt: now + blueprint.durationMs,
      expiresAt: now + SESSION_TTL_MS,
      status: 'active',
      turns: [],
      creditRequestId: requestId,
      createdAt: now,
      updatedAt: now,
    };

    await store.setJSON(sessionKey(userId, sessionId), session);

    return jsonResponse(200, cors, {
      ok: true,
      mode: 'gemini_live_ptt',
      implementationStatus: 'pilot',
      whoStarts: session.whoStarts,
      session: publicSession(session),
      /** Ephemeral credential — NOT the long-lived GEMINI_API_KEY */
      ephemeral: {
        token: minted.token,
        expireTime: minted.expireTime,
        newSessionExpireTime: minted.newSessionExpireTime,
        apiVersion: minted.apiVersion,
        websocketUrl: minted.websocketUrl,
        model: minted.model,
      },
      /** Client setup reminder (also locked into token when supported). */
      clientSetup: {
        automaticActivityDetection: { disabled: true },
        activityHandling: 'NO_INTERRUPTION',
        responseModalities: ['AUDIO'],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      aiRemaining: meta?.aiRemaining ?? meta?.remaining,
      plan,
      personas: Object.keys(PERSONAS),
    });
  }

  // ── finalize — soft-close complete; persist transcript for eval ──────────
  if (action === 'finalize') {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) return jsonResponse(400, cors, { error: 'session_required' });

    const key = sessionKey(userId, sessionId);
    const session = await store.get(key, { type: 'json' }).catch(() => null);
    if (!session) return jsonResponse(404, cors, { error: 'session_not_found' });

    let turns = Array.isArray(body.turns) ? body.turns : session.turns || [];
    // Optional raw chunks: [{role,text}]
    if (Array.isArray(body.chunks)) {
      turns = session.turns || [];
      for (const c of body.chunks) {
        turns = appendTranscriptionChunk(turns, {
          role: c.role === 'partner' ? 'partner' : 'user',
          text: c.text,
          at: c.at || Date.now(),
        });
      }
    }

    // Normalize turn shapes
    turns = (turns || [])
      .map((t) => ({
        role: t.role === 'partner' || t.role === 'model' ? 'partner' : 'user',
        text: String(t.text || '').trim(),
        at: Number(t.at) || Date.now(),
      }))
      .filter((t) => t.text);

    session.turns = turns;
    session.status = 'finalized';
    session.finalizedAt = Date.now();
    session.closeReason = String(body.closeReason || 'client_finalize').slice(0, 64);
    session.updatedAt = Date.now();
    if (body.noInterruptionProbe) {
      session.noInterruptionProbe = body.noInterruptionProbe;
    }
    if (
      body.pcmBytesIn != null ||
      body.pcmBytesOut != null ||
      body.usageMetadata ||
      body.geminiLiveConnected != null
    ) {
      session.liveTelemetry = {
        pcmBytesIn: body.pcmBytesIn ?? null,
        pcmBytesOut: body.pcmBytesOut ?? null,
        usageMetadata: body.usageMetadata ?? null,
        geminiLiveConnected: body.geminiLiveConnected ?? null,
        capturedAt: Date.now(),
      };
      try {
        const { appendSpeakingLiveCostLog } = await import('../../scripts/lib/speakingLiveCostLog.mjs');
        const costEntry = appendSpeakingLiveCostLog({
          source: 'pilot-ui',
          sessionId: session.sessionId,
          closeReason: session.closeReason,
          model: session.model,
          durationMs: session.finalizedAt - session.startedAt,
          turnCount: turns.length,
          pcmBytesIn: session.liveTelemetry.pcmBytesIn,
          pcmBytesOut: session.liveTelemetry.pcmBytesOut,
          usageMetadata: session.liveTelemetry.usageMetadata,
        });
        session.liveTelemetry.costLogId = costEntry.id;
        console.log('[speaking-live] pilot finalize', {
          sessionId: session.sessionId,
          geminiLiveConnected: session.liveTelemetry.geminiLiveConnected,
          pcmBytesOut: session.liveTelemetry.pcmBytesOut,
          usageCaptured: costEntry.usageCaptured,
          costLogId: costEntry.id,
        });
      } catch (err) {
        console.warn('[speaking-live] cost log skipped:', err.message);
      }
    }

    await store.setJSON(key, session);

    return jsonResponse(200, cors, {
      ok: true,
      session: publicSession(session, { includeEvalPayload: true }),
    });
  }

  return jsonResponse(400, cors, { error: 'unknown_action' });
};

// Lab / unit exports
exports.decideWhoStarts = decideWhoStarts;
exports.sessionKey = sessionKey;
