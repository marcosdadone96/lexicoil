'use strict';

const { checkQuota, incrementQuota, decrementQuota, getQuotaState } = require('./lib/quotaLib.js');
const { corsHeaders, jsonResponse } = require('./lib/http.js');
const { validateGeneratedExam, verifyAnswerKeysWithAI } = require('./lib/examQualityGate.js');
const {
  extractJsonObject,
  certName,
  requireProPlan,
  callAnthropicJson,
} = require('./lib/proAiModes.js');
const { getAiCredits, checkAiCredits, confirmAiCreditConsumption, releaseAiCreditConsumption } = require('./lib/aiCredits.js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { casWriteJson } = require('./lib/casBlob.js');
const { linkTicketQuotaCharge, releaseGenerationQuota, deliverGenerationQuota, renewGenerationTicket } = require('./lib/releaseGeneration.js');
const { getJwtSecret, emailToUserId } = require('./lib/authLib.js');
const {
  createGenTicket,
  verifyGenTicket,
  TICKETED_SCOPES,
  MAX_CHUNKS_ALLOWED,
} = require('./lib/genTicket.js');
const sb = require('./lib/supabaseAdmin.js');
const {
  readAnthropicKey,
  anthropicKeyFingerprint,
  rejectBadAnthropicKey,
} = require('./lib/anthropicKey.js');

async function logExamGenChunk(event, genTicketPayload, body, { ok, model, usage }) {
  if (!sb.isConfigured()) return;
  try {
    let email = null;
    let userId = null;
    const qState = await getQuotaState(event).catch(() => null);
    if (qState?.ok && qState.authenticated) {
      email = qState.email;
    } else if (genTicketPayload?.sub && !String(genTicketPayload.sub).startsWith('guest:')) {
      email = genTicketPayload.sub;
    }
    if (email) {
      const profile = await sb.getUserProfileByEmail(email);
      userId = profile?.id || emailToUserId(email);
    }
    await sb.insertGeneration({
      user_id: userId,
      email,
      lang: body.lang || null,
      level: body.level || null,
      source: 'ai',
      model: model || null,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      valid: !!ok,
    });
  } catch (err) {
    console.error('[claude-chat] insertGeneration failed:', err.message);
  }
}

const DEFAULT_MODEL = 'claude-haiku-4-5';
// Exam generation defaults to Sonnet; override with CLAUDE_EXAM_MODEL.
const EXAM_MODEL = 'claude-sonnet-4-6';
const MAX_PROMPT_LEN = 16000;
const MAX_TOKENS = 8192;

async function refundExamQuota(quotaCheck, requestId) {
  if (!quotaCheck) return;
  try {
    await decrementQuota(quotaCheck, { requestId: requestId || null });
  } catch (err) {
    console.error('[claude-chat] quota refund failed:', err.message);
  }
}

async function refundAiCredits(event, action, requestId) {
  if (!requestId || !action) return;
  try {
    await releaseAiCreditConsumption(event, action, { requestId });
  } catch (err) {
    console.error('[claude-chat] ai credit refund failed:', err.message);
  }
}

function cleanModel(raw) {
  const m = String(raw || '').trim();
  if (!m) return DEFAULT_MODEL;
  if (!m.startsWith('claude-')) return DEFAULT_MODEL;
  return m;
}

function parseBody(event) {
  let raw = event.body;
  if (event.isBase64Encoded && typeof raw === 'string') {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  return JSON.parse(raw || '{}');
}

exports.handler = async function handler(event) {
  const cors = corsHeaders(event, 'POST, OPTIONS');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = parseBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  // ── validateExam branch (C-2: quota-gated) ──────────────────────────────
  if (body.validateExam === true && body.exam) {
    const quotaGate = await checkQuota(event).catch(() => null);
    if (!quotaGate || !quotaGate.ok) {
      return jsonResponse(quotaGate?.status || 429, cors, {
        error: quotaGate?.error || 'quota_exceeded',
        used: quotaGate?.used,
        max: quotaGate?.max,
        plan: quotaGate?.plan,
      });
    }
    const apiKey = readAnthropicKey();
    const badKey = rejectBadAnthropicKey(apiKey, jsonResponse, cors);
    if (badKey) return badKey;
    const gate = validateGeneratedExam(body.exam);
    if (!gate.valid) {
      console.warn('[claude-chat] exam validation rejected:', gate.errors);
      return jsonResponse(422, cors, {
        error: 'exam_invalid',
        message: 'Generated exam failed answer-key validation',
        validationErrors: gate.errors,
      });
    }
    if (body.verifyAnswerKeys === true) {
      try {
        const verify = await verifyAnswerKeysWithAI(body.exam, apiKey);
        if (!verify.ok && !verify.skipped) {
          console.warn('[claude-chat] answer-key verify mismatch:', verify.discrepancies);
          return jsonResponse(422, cors, {
            error: 'exam_invalid',
            message: 'Answer-key verification mismatch',
            validationErrors: ['answer_key_verify_mismatch'],
            discrepancies: verify.discrepancies,
          });
        }
      } catch (err) {
        console.warn('[claude-chat] answer-key verify error:', err.message);
      }
    }
    return jsonResponse(200, cors, { valid: true, placeholders: gate.placeholders });
  }

  // ── startGeneration branch ───────────────────────────────────────────────
  // Issues a signed ticket after charging once:
  //   personal_exam → 3 AI credits (Pro)
  //   exam_generation / quick_exam → monthly exam quota
  if (body.startGeneration === true) {
    const scope = typeof body.scope === 'string' ? body.scope.trim() : '';
    if (!TICKETED_SCOPES.has(scope)) {
      return jsonResponse(400, cors, { error: 'invalid_scope' });
    }
    const maxChunks = Math.max(1, Math.min(Number(body.maxChunks) || 1, MAX_CHUNKS_ALLOWED));

    const apiKey = readAnthropicKey();
    const badKey = rejectBadAnthropicKey(apiKey, jsonResponse, cors);
    if (badKey) return badKey;

    const secret = getJwtSecret();
    if (!secret) return jsonResponse(503, cors, { error: 'misconfigured' });

    let quotaCheck;
    try {
      quotaCheck = await checkQuota(event);
    } catch (err) {
      console.error('[claude-chat] startGeneration quota check failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }

    const qState = quotaCheck.state;
    const sub = qState.authenticated ? qState.email : `guest:${qState.ipHash || 'unknown'}`;

    if (scope === 'personal_exam') {
      const pro = await requireProPlan(event);
      if (!pro.ok) {
        return jsonResponse(pro.status || 403, cors, { error: pro.error, plan: pro.plan });
      }

      const creditCheck = await checkAiCredits(event, 'personal_exam');
      if (!creditCheck.ok) {
        return jsonResponse(creditCheck.error === 'ai_credits_exhausted' ? 402 : 403, cors, {
          error: creditCheck.error,
          remaining: creditCheck.remaining,
          aiUsed: creditCheck.used,
          aiMax: creditCheck.max,
          plan: pro.plan,
          autoRechargeFailed: creditCheck.autoRechargeFailed || false,
          reason: creditCheck.reason || undefined,
        });
      }

      const { token: ticket, payload: ticketPayload } = createGenTicket(sub, scope, maxChunks, secret);
      let aiMeta;
      try {
        aiMeta = await confirmAiCreditConsumption(event, 'personal_exam', {
          requestId: ticketPayload.nonce,
        });
      } catch (err) {
        console.error('[claude-chat] startGeneration AI credit reserve failed:', err);
        return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
      }
      if (aiMeta?.error) {
        return jsonResponse(402, cors, {
          error: aiMeta.error,
          aiUsed: aiMeta.aiUsed,
          aiMax: aiMeta.aiMax,
          remaining: aiMeta.remaining,
          plan: pro.plan,
        });
      }

      console.log('[claude-chat] startGeneration personal_exam (AI credits)', {
        maxChunks,
        sub: sub.slice(0, 30),
      });
      return jsonResponse(200, cors, {
        ticket,
        plan: pro.plan,
        aiUsed: aiMeta?.aiUsed,
        aiRemaining: aiMeta?.aiRemaining ?? aiMeta?.remaining,
        aiMax: aiMeta?.aiMax,
        remaining: aiMeta?.aiRemaining ?? aiMeta?.remaining,
      });
    }

    if (!quotaCheck.ok) {
      return jsonResponse(quotaCheck.status || 429, cors, {
        error: quotaCheck.error || 'quota_exceeded',
        used: quotaCheck.used,
        max: quotaCheck.max,
        plan: quotaCheck.plan,
      });
    }

    let quotaMeta;
    try {
      quotaMeta = await incrementQuota(quotaCheck, { requestId: body.requestId || null });
    } catch (err) {
      console.error('[claude-chat] startGeneration quota reserve failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }
    if (quotaMeta?.error === 'quota_exceeded') {
      return jsonResponse(429, cors, {
        error: 'quota_exceeded',
        used: quotaMeta.used,
        max: quotaMeta.max,
        plan: quotaMeta.plan,
      });
    }

    const { token: ticket, payload: ticketPayload } = createGenTicket(sub, scope, maxChunks, secret);
    await linkTicketQuotaCharge(event, qState, ticketPayload.nonce, quotaMeta);

    console.log('[claude-chat] startGeneration', { scope, maxChunks, sub: sub.slice(0, 30) });
    return jsonResponse(200, cors, {
      ticket,
      used: quotaMeta?.used,
      max: quotaMeta?.max,
      plan: quotaMeta?.plan,
    });
  }

  // ── releaseGeneration branch ─────────────────────────────────────────────
  if (body.releaseGeneration === true && body.genTicket) {
    const release = await releaseGenerationQuota(event, {
      genTicket: body.genTicket,
    });
    return jsonResponse(200, cors, release);
  }

  // ── deliverGeneration branch (exam shown to user — quota stays charged) ──
  if (body.deliverGeneration === true && body.genTicket) {
    const delivered = await deliverGenerationQuota(event, { genTicket: body.genTicket });
    return jsonResponse(200, cors, delivered);
  }

  // ── renewGeneration branch (extend ticket TTL, no extra quota charge) ────
  if (body.renewGeneration === true && body.genTicket) {
    const renewed = await renewGenerationTicket(event, { genTicket: body.genTicket });
    if (!renewed.renewed) {
      return jsonResponse(403, cors, { error: renewed.reason || 'renew_failed' });
    }
    return jsonResponse(200, cors, renewed);
  }

  // ── Common API key check ─────────────────────────────────────────────────
  const apiKey = readAnthropicKey();
  const badKey = rejectBadAnthropicKey(apiKey, jsonResponse, cors);
  if (badKey) return badKey;

  // ── Pro AI modes (correctWriting, grammarCoaching) ───────────────────────
  if (body.correctWriting === true || body.grammarCoaching === true) {
    try {
      const pro = await requireProPlan(event);
      if (!pro.ok) {
        return jsonResponse(pro.status || 403, cors, { error: pro.error, plan: pro.plan });
      }

      const aiAction = body.correctWriting === true ? 'writing_correction' : 'grammar_coaching';
      const creditCheck = await checkAiCredits(event, aiAction);
      if (!creditCheck.ok) {
        return jsonResponse(creditCheck.error === 'ai_credits_exhausted' ? 402 : 403, cors, {
          error: creditCheck.error,
          remaining: creditCheck.remaining,
          aiUsed: creditCheck.used,
          aiMax: creditCheck.max,
          plan: pro.plan,
          autoRechargeFailed: creditCheck.autoRechargeFailed || false,
          reason: creditCheck.reason || undefined,
        });
      }

      const correctionModel = cleanModel(
        process.env.CLAUDE_CORRECTION_MODEL || 'claude-haiku-4-5',
      );

      if (body.correctWriting === true) {
        const lang = String(body.lang || 'de').slice(0, 2);
        const level = String(body.level || 'B1').toUpperCase();
        const task = String(body.task || '').trim();
        const userText = String(body.userText || '').trim();
        if (!userText) {
          return jsonResponse(400, cors, { error: 'userText is required' });
        }
        const requestId = body.requestId || null;
        const aiMeta = await confirmAiCreditConsumption(event, 'writing_correction', { requestId });
        if (aiMeta?.error) {
          return jsonResponse(402, cors, {
            error: aiMeta.error,
            aiUsed: aiMeta.aiUsed,
            aiMax: aiMeta.aiMax,
            remaining: aiMeta.remaining,
            plan: pro.plan,
          });
        }

        const minWords = Number(body.minWords) || 0;
        const maxWords = Number(body.maxWords) || 0;
        const cert = certName(lang);
        const system = `You are an official ${cert} examiner at level ${level}. Correct the candidate's writing task response. Return ONLY valid JSON (no markdown, no prose) with this exact shape:
{"correctedText":"...","errors":[{"original":"...","correction":"...","type":"grammar|vocab|spelling|register|cohesion","explanation":"..."}],"summary":"...","grammarPoints":[{"tag":"...","explanation":"...","example":"..."}]}
Be concise: max 8 prioritized errors and max 3 grammarPoints. Write explanations in ${lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English'}.`;
        const userContent = `Task:\n${task || '(writing task)'}\n\nMinimum words: ${minWords || 'n/a'}${maxWords ? `, maximum: ${maxWords}` : ''}\n\nCandidate text:\n${userText}`;

        const t0 = Date.now();
        let text;
        try {
          ({ text } = await callAnthropicJson(apiKey, {
            model: correctionModel,
            maxTokens: Math.min(Number(body.maxTokens) || 1500, 1500),
            system,
            userContent,
          }));
        } catch (err) {
          await refundAiCredits(event, 'writing_correction', requestId);
          throw err;
        }
        const parsed = extractJsonObject(text);
        console.log('[claude-chat] correctWriting', { ok: !!parsed, ms: Date.now() - t0 });
        if (!parsed || typeof parsed !== 'object') {
          await refundAiCredits(event, 'writing_correction', requestId);
          return jsonResponse(200, cors, { ok: false, error: 'parse_failed' });
        }
        return jsonResponse(200, cors, {
          ok: true,
          correction: parsed,
          plan: pro.plan,
          aiUsed: aiMeta?.aiUsed,
          aiMax: aiMeta?.aiMax,
          aiRemaining: aiMeta?.aiRemaining ?? aiMeta?.remaining,
        });
      }

      const lang = String(body.lang || 'de').slice(0, 2);
      const level = String(body.level || 'B1').toUpperCase();
      const weakTags = Array.isArray(body.weakTags) ? body.weakTags.slice(0, 6) : [];
      const sampleMistakes = Array.isArray(body.sampleMistakes)
        ? body.sampleMistakes.slice(0, 8)
        : [];
      const requestId = body.requestId || null;
      const aiMeta = await confirmAiCreditConsumption(event, 'grammar_coaching', { requestId });
      if (aiMeta?.error) {
        return jsonResponse(402, cors, {
          error: aiMeta.error,
          aiUsed: aiMeta.aiUsed,
          aiMax: aiMeta.aiMax,
          remaining: aiMeta.remaining,
          plan: pro.plan,
        });
      }
      const cert = certName(lang);
      const system = `You are a ${cert} ${level} grammar coach. Return ONLY valid JSON:
{"topics":[{"tag":"...","title":"...","explanation":"...","examples":["..."],"tip":"..."}]}
Max 4 topics, concise. Language: ${lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English'}.`;
      const userContent = `Weak grammar areas (tags): ${weakTags.join(', ') || 'general'}\n\nSample mistakes:\n${sampleMistakes
        .map(
          (m, i) =>
            `${i + 1}. [${m.tag || 'grammar'}] Q: ${m.question || ''}\n   Yours: ${m.yours || ''}\n   Correct: ${m.correct || ''}\n   Note: ${m.explanation || ''}`,
        )
        .join('\n\n')}`;

      const t0 = Date.now();
      let text;
      try {
        ({ text } = await callAnthropicJson(apiKey, {
          model: correctionModel,
          maxTokens: Math.min(Number(body.maxTokens) || 1200, 1200),
          system,
          userContent,
        }));
      } catch (err) {
        await refundAiCredits(event, 'grammar_coaching', requestId);
        throw err;
      }
      const parsed = extractJsonObject(text);
      console.log('[claude-chat] grammarCoaching', { ok: !!parsed?.topics, ms: Date.now() - t0 });
      if (!parsed?.topics) {
        await refundAiCredits(event, 'grammar_coaching', requestId);
        return jsonResponse(200, cors, { ok: false, error: 'parse_failed' });
      }
      return jsonResponse(200, cors, {
        ok: true,
        coaching: parsed,
        plan: pro.plan,
        aiUsed: aiMeta?.aiUsed,
        aiMax: aiMeta?.aiMax,
        aiRemaining: aiMeta?.aiRemaining ?? aiMeta?.remaining,
      });
    } catch (err) {
      console.error('[claude-chat] pro AI mode failed:', err.message);
      return jsonResponse(502, cors, { error: 'ai_unavailable' });
    }
  }

  // ── quotaOnly / aiCreditsOnly (legacy compatibility) ─────────────────────
  if (body.quotaOnly === true || body.aiCreditsOnly === true) {
    try {
      const aiSnap = await getAiCredits(event);
      if (body.aiCreditsOnly === true) {
        return jsonResponse(200, cors, {
          ok: true,
          aiUsed: aiSnap.used,
          aiMax: aiSnap.max,
          aiRemaining: aiSnap.remaining,
          aiTotalPool: aiSnap.totalPool,
          rollover: aiSnap.rollover,
          creditTopups: aiSnap.creditTopups,
          remaining: aiSnap.remaining,
          month: aiSnap.month,
          plan: aiSnap.plan,
          autoRecharge: aiSnap.autoRecharge,
        });
      }
      const quotaCheck = await checkQuota(event);
      if (!quotaCheck.ok) {
        return jsonResponse(quotaCheck.status || 429, cors, {
          error: quotaCheck.error || 'quota_exceeded',
          used: quotaCheck.used,
          max: quotaCheck.max,
          plan: quotaCheck.plan,
          aiUsed: aiSnap.used,
          aiMax: aiSnap.max,
          aiRemaining: aiSnap.remaining,
          remaining: aiSnap.remaining,
          month: aiSnap.month,
        });
      }
      const quotaMeta = await incrementQuota(quotaCheck, {
        requestId: body.requestId || null,
      });
      const aiAfter = await getAiCredits(event);
      return jsonResponse(200, cors, {
        ok: true,
        used: quotaMeta?.used,
        max: quotaMeta?.max,
        plan: quotaMeta?.plan,
        aiUsed: aiAfter.used,
        aiMax: aiAfter.max,
        aiRemaining: aiAfter.remaining,
        remaining: aiAfter.remaining,
        month: aiAfter.month,
      });
    } catch (err) {
      console.error('[claude-chat] quota-only failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }
  }

  // ── Prompt validation ────────────────────────────────────────────────────
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, cors, { error: 'prompt is required' });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return jsonResponse(400, cors, { error: `prompt exceeds ${MAX_PROMPT_LEN} characters` });
  }

  // B-1: whitelist of allowed actions
  const QUOTA_AI_ACTIONS = new Set([
    'exam_generation', 'personal_exam', 'quick_exam',
    'exam_generation_de', 'exam_generation_en', 'exam_generation_es',
    'vocab_explanation', 'translation',
  ]);
  const PRO_AI_ACTIONS = new Set(['writing_correction', 'grammar_coaching']);
  const aiAction = typeof body.aiAction === 'string' ? body.aiAction.trim() : null;

  if (!aiAction && !body.examGeneration) {
    console.warn('[claude-chat] B-1: blocked prompt call with no aiAction');
    return jsonResponse(403, cors, { error: 'action_required' });
  }
  if (aiAction && !QUOTA_AI_ACTIONS.has(aiAction) && !PRO_AI_ACTIONS.has(aiAction)) {
    console.warn('[claude-chat] B-1: blocked unknown aiAction:', aiAction);
    return jsonResponse(403, cors, { error: 'unknown_action' });
  }
  if (aiAction && PRO_AI_ACTIONS.has(aiAction)) {
    const pro = await requireProPlan(event);
    if (!pro.ok) {
      return jsonResponse(pro.status || 403, cors, { error: pro.error, plan: pro.plan });
    }
    const creditCheck = await checkAiCredits(event, aiAction);
    if (!creditCheck.ok) {
      return jsonResponse(creditCheck.error === 'ai_credits_exhausted' ? 402 : 403, cors, {
        error: creditCheck.error,
        remaining: creditCheck.remaining,
        aiUsed: creditCheck.used,
        aiMax: creditCheck.max,
        plan: pro.plan,
        autoRechargeFailed: creditCheck.autoRechargeFailed || false,
        reason: creditCheck.reason || undefined,
      });
    }
  }

  // ── Ticket verification (exam generation) ────────────────────────────────
  // All examGeneration calls MUST present a server-issued ticket obtained via
  // startGeneration. body.consumeQuota is NOT trusted from the client.
  let quotaMeta = null;
  let reservedQuotaCheck = null;
  const requestId = body.requestId || null;
  let genTicketPayload = null;

  if (body.examGeneration) {
    if (!body.genTicket) {
      console.warn('[claude-chat] examGeneration without ticket — rejected');
      return jsonResponse(403, cors, { error: 'ticket_required' });
    }

    const secret = getJwtSecret();
    if (!secret) return jsonResponse(503, cors, { error: 'misconfigured' });

    const ticketPayload = verifyGenTicket(body.genTicket, secret);
    if (!ticketPayload) {
      return jsonResponse(403, cors, { error: 'ticket_invalid' });
    }
    genTicketPayload = ticketPayload;
    if (!TICKETED_SCOPES.has(ticketPayload.scope)) {
      return jsonResponse(403, cors, { error: 'ticket_scope_invalid' });
    }

    // Atomically increment the per-ticket chunk counter (server-controlled)
    const store = getStoreForEvent(event);
    const ticketKey = `gentk:${ticketPayload.nonce}`;
    const counterResult = await casWriteJson(
      store,
      ticketKey,
      (current) => {
        const used = (current?.chunksUsed || 0) + 1;
        if (used > ticketPayload.maxChunks) {
          return {
            skip: true,
            result: { error: 'chunks_exceeded', used, max: ticketPayload.maxChunks },
          };
        }
        return {
          payload: { chunksUsed: used, maxChunks: ticketPayload.maxChunks },
          result: { ok: true, chunksUsed: used },
        };
      },
      { logTag: '[gentk]' },
    ).catch((err) => {
      console.error('[claude-chat] chunk counter CAS error:', err.message);
      return { error: 'counter_error' };
    });

    if (counterResult?.error) {
      return jsonResponse(403, cors, { error: counterResult.error });
    }
    // Quota was already charged via startGeneration — skip quota reserve below
  } else {
    // Non-exam calls: server always charges quota regardless of body.consumeQuota
    // (B-4: reserve BEFORE the Anthropic call)
    let quotaCheck = null;
    try {
      quotaCheck = await checkQuota(event);
    } catch (err) {
      console.error('[claude-chat] quota check failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }
    if (!quotaCheck.ok) {
      return jsonResponse(quotaCheck.status || 429, cors, {
        error: quotaCheck.error || 'quota_exceeded',
        used: quotaCheck.used,
        max: quotaCheck.max,
        plan: quotaCheck.plan,
      });
    }
    try {
      quotaMeta = await incrementQuota(quotaCheck, { requestId });
      reservedQuotaCheck = quotaCheck;
    } catch (err) {
      console.error('[claude-chat] quota reserve failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }
    if (quotaMeta?.error === 'quota_exceeded') {
      return jsonResponse(429, cors, {
        error: 'quota_exceeded',
        used: quotaMeta.used,
        max: quotaMeta.max,
        plan: quotaMeta.plan,
      });
    }
  }

  // ── Anthropic call ───────────────────────────────────────────────────────
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 6000, 1), MAX_TOKENS);
  const model = body.examGeneration
    ? cleanModel(process.env.CLAUDE_EXAM_MODEL || EXAM_MODEL)
    : cleanModel(body.model || process.env.CLAUDE_MODEL);

  if (body.examGeneration) {
    console.log('[claude-chat] exam chunk', { model });
  }

  const t0 = Date.now();
  let anthropicOk = false;
  let anthropicUsage = null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json().catch(() => ({}));
    anthropicUsage = data.usage || null;
    anthropicOk = res.ok;
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : '') ||
        `Anthropic API error (${res.status})`;
      console.error('[claude-chat] Anthropic error:', res.status, msg, {
        key: anthropicKeyFingerprint(apiKey),
      });
      await refundExamQuota(reservedQuotaCheck, requestId);
      if (body.examGeneration) {
        await logExamGenChunk(event, genTicketPayload, body, { ok: false, model, usage: anthropicUsage });
      }
      return jsonResponse(res.status >= 500 ? 502 : 400, cors, { error: msg });
    }

    const text = (data.content || []).map((part) => part.text || '').join('');
    if (!text) {
      await refundExamQuota(reservedQuotaCheck, requestId);
      if (body.examGeneration) {
        await logExamGenChunk(event, genTicketPayload, body, { ok: false, model, usage: anthropicUsage });
      }
      return jsonResponse(502, cors, { error: 'Empty response from AI' });
    }

    if (body.examGeneration) {
      const placeholderCount = (
        text.match(/\.\.\.|Option [A-D]"|"Text here"|"Question here"|Ein Text ueber|Ein Text .ber|An article about/gi) || []
      ).length;
      if (placeholderCount > 5) {
        console.warn('[claude-chat] exam has too many placeholders:', placeholderCount);
        return jsonResponse(422, cors, {
          error: 'exam_low_quality',
          message: 'Generated exam contains placeholder content. Retry recommended.',
        });
      }
    }

    let aiMeta = null;
    if (aiAction && PRO_AI_ACTIONS.has(aiAction)) {
      try {
        aiMeta = await confirmAiCreditConsumption(event, aiAction, { requestId });
      } catch (err) {
        console.error('[claude-chat] ai credit confirm failed:', err);
      }
    }

    console.log('[claude-chat] ok', {
      model,
      exam: !!body.examGeneration,
      ms: Date.now() - t0,
      maxTokens,
      outChars: text.length,
    });

    if (body.examGeneration) {
      await logExamGenChunk(event, genTicketPayload, body, { ok: anthropicOk, model, usage: anthropicUsage });
    }

    return jsonResponse(200, cors, {
      text,
      model,
      usage: data.usage || null,
      used: quotaMeta?.used,
      max: quotaMeta?.max,
      plan: quotaMeta?.plan,
      aiUsed: aiMeta?.aiUsed,
      aiMax: aiMeta?.aiMax,
      aiRemaining: aiMeta?.aiRemaining ?? aiMeta?.remaining,
    });
  } catch (err) {
    console.error('[claude-chat] request failed:', err, { ms: Date.now() - t0 });
    await refundExamQuota(reservedQuotaCheck, requestId);
    if (body.examGeneration) {
      await logExamGenChunk(event, genTicketPayload, body, { ok: false, model, usage: anthropicUsage });
    }
    return jsonResponse(502, cors, { error: err.message || 'Internal server error' });
  }
};
