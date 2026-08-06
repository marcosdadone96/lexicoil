'use strict';

/**
 * Pro Sprechen — turn-based partner chat (v1).
 * Realtime voice (speaking-realtime-session) is parked as v2.
 *
 * POST { action: 'start'|'turn'|'delete', ... }
 * Credits: speaking_realtime (Pro-only bucket; 4 credits on start).
 */

const crypto = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { requireAuth, emailToUserId } = require('./lib/authLib.js');
const { checkActionAccess } = require('./lib/actionAccessLib.js');
const { resolvePlan } = require('./lib/quotaLib.js');
const { checkAiCredits, confirmAiCreditConsumption, releaseAiCreditConsumption } = require('./lib/aiCredits.js');
const { corsHeaders, jsonResponse, parseJsonBody } = require('./lib/http.js');
const { readAnthropicKey, rejectBadAnthropicKey } = require('./lib/anthropicKey.js');
const {
  PERSONAS,
  decideWhoStarts,
  getPersona,
  resolveTeil,
  buildChatSystem,
  buildOpenerUser,
  normalizeLevel,
} = require('./lib/speakingPersonas.js');

const MODEL = process.env.CLAUDE_SPEAKING_MODEL || 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 200;
const MAX_TURNS = 24;
const SESSION_TTL_MS = 15 * 60 * 1000;
const CREDIT_ACTION = 'speaking_realtime';

function sessionKey(userId, sessionId) {
  return `speaking_session:${userId}:${sessionId}`;
}

function newSessionId() {
  return crypto.randomBytes(12).toString('hex');
}

async function callPartner(apiKey, { system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : '') ||
      `Anthropic API error (${res.status})`;
    throw new Error(msg);
  }
  const text = (data.content || []).map((p) => p.text || '').join('').trim();
  return { text, usage: data.usage || null };
}

function publicSession(session) {
  return {
    sessionId: session.sessionId,
    personaId: session.personaId,
    displayName: session.displayName,
    fieldId: session.fieldId,
    turns: session.turns,
    consent: !!session.consent,
    expiresAt: session.expiresAt,
    turnCount: session.turns.length,
    whoStarts: session.whoStarts || (session.turns?.[0]?.role === 'partner' ? 'partner' : 'user'),
  };
}

exports.decideWhoStarts = decideWhoStarts;

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
        : String(body.action || 'turn').toLowerCase();

  // ── get ──────────────────────────────────────────────────────────────────
  if (action === 'get') {
    const sessionId = String(body.sessionId || event.queryStringParameters?.sessionId || '');
    if (!sessionId) return jsonResponse(400, cors, { error: 'session_required' });
    const session = await store.get(sessionKey(userId, sessionId), { type: 'json' }).catch(() => null);
    if (!session) return jsonResponse(404, cors, { error: 'session_not_found' });
    return jsonResponse(200, cors, { ok: true, session: publicSession(session) });
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

  // ── start ────────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!body.consent) {
      return jsonResponse(400, cors, { error: 'consent_required' });
    }
    const personaId = String(body.personaId || 'balanced');
    const level = normalizeLevel(body.level || 'B1');
    const persona = getPersona(personaId, level);
    if (!persona) return jsonResponse(400, cors, { error: 'invalid_persona' });

    const creditCheck = await checkAiCredits(event, CREDIT_ACTION);
    if (!creditCheck.ok) {
      return jsonResponse(creditCheck.error === 'ai_credits_exhausted' ? 402 : creditCheck.status || 403, cors, {
        error: creditCheck.error,
        remaining: creditCheck.remaining,
        plan,
      });
    }

    const requestId = body.requestId || `speak-chat-${Date.now()}`;
    const meta = await confirmAiCreditConsumption(event, CREDIT_ACTION, { requestId });
    if (meta?.error) {
      return jsonResponse(402, cors, { error: meta.error, plan, ...meta });
    }

    const sessionId = newSessionId();
    const now = Date.now();
    const situation = String(body.situation || body.task || '').slice(0, 4000);
    const teil = resolveTeil(body.teil ?? (String(body.fieldId || '').match(/speak_bp_(\d)/)?.[1]));
    const whoStarts = decideWhoStarts();
    const chatSystem = buildChatSystem({ personaId, teil, situation, level });
    const session = {
      sessionId,
      userId,
      personaId,
      displayName: persona.displayName,
      systemHint: chatSystem,
      maxTokens: persona.maxTokens,
      teil,
      fieldId: body.fieldId || null,
      examId: body.examId || null,
      subject: String(body.subject || 'de').slice(0, 5),
      level,
      situation,
      consent: true,
      consentAt: now,
      turns: [],
      whoStarts,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
      creditRequestId: requestId,
    };

    // Opening partner line — only when whoStarts === 'partner' (~50%).
    // When candidate starts: empty turns; UI prompts user to speak first.
    // Session + turnCount still work: first user turn is turn 1, partner reply turn 2.
    if (whoStarts === 'partner') {
      const apiKey = readAnthropicKey();
      const badKey = rejectBadAnthropicKey(apiKey, jsonResponse, cors);
      if (badKey) {
        await releaseAiCreditConsumption(event, CREDIT_ACTION, { requestId }).catch(() => {});
        return badKey;
      }

      try {
        const openerUser = buildOpenerUser({ level, teil, situation });
        const { text } = await callPartner(apiKey, {
          system: chatSystem,
          maxTokens: persona.maxTokens,
          messages: [{ role: 'user', content: openerUser }],
        });
        if (text) {
          session.turns.push({ role: 'partner', text, at: Date.now() });
        }
      } catch (err) {
        await releaseAiCreditConsumption(event, CREDIT_ACTION, { requestId }).catch(() => {});
        console.error('[speaking-chat] start opener failed:', err.message);
        return jsonResponse(503, cors, { error: 'partner_unavailable', message: err.message });
      }
    }

    session.updatedAt = Date.now();
    await store.setJSON(sessionKey(userId, sessionId), session);

    return jsonResponse(200, cors, {
      ok: true,
      mode: 'turn_based',
      whoStarts,
      session: publicSession(session),
      aiRemaining: meta?.aiRemaining ?? meta?.remaining,
      plan,
    });
  }

  // ── turn ─────────────────────────────────────────────────────────────────
  if (action === 'turn') {
    const sessionId = String(body.sessionId || '');
    const userText = String(body.text || body.transcript || '').trim().slice(0, 4000);
    if (!sessionId) return jsonResponse(400, cors, { error: 'session_required' });
    if (!userText) return jsonResponse(400, cors, { error: 'text_required' });

    const key = sessionKey(userId, sessionId);
    const session = await store.get(key, { type: 'json' }).catch(() => null);
    if (!session) return jsonResponse(404, cors, { error: 'session_not_found' });
    if (Date.now() > Number(session.expiresAt || 0)) {
      return jsonResponse(410, cors, { error: 'session_expired' });
    }
    if (session.turns.length >= MAX_TURNS) {
      return jsonResponse(429, cors, { error: 'max_turns' });
    }

    session.turns.push({ role: 'user', text: userText, at: Date.now() });

    const apiKey = readAnthropicKey();
    const badKey = rejectBadAnthropicKey(apiKey, jsonResponse, cors);
    if (badKey) return badKey;

    const messages = [];
    if (session.situation) {
      messages.push({
        role: 'user',
        content: `Prüfungsaufgabe (Kontext):\n${session.situation}`,
      });
      messages.push({
        role: 'assistant',
        content: 'Verstanden. Ich bleibe bei der Aufgabe.',
      });
    }
    for (const t of session.turns) {
      messages.push({
        role: t.role === 'partner' ? 'assistant' : 'user',
        content: t.text,
      });
    }

    try {
      const persona = getPersona(session.personaId, session.level) || PERSONAS.balanced;
      const { text } = await callPartner(apiKey, {
        system:
          session.systemHint ||
          buildChatSystem({
            personaId: session.personaId,
            teil: session.teil,
            situation: session.situation,
            level: session.level,
          }),
        maxTokens: session.maxTokens || persona.maxTokens,
        messages,
      });
      session.turns.push({ role: 'partner', text: text || '…', at: Date.now() });
    } catch (err) {
      console.error('[speaking-chat] turn failed:', err.message);
      return jsonResponse(503, cors, { error: 'partner_unavailable', message: err.message });
    }

    session.updatedAt = Date.now();
    await store.setJSON(key, session);
    return jsonResponse(200, cors, { ok: true, session: publicSession(session) });
  }

  return jsonResponse(400, cors, { error: 'unknown_action' });
};
