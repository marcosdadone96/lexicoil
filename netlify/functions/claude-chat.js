'use strict';

const { checkQuota, incrementQuota } = require('./lib/quotaLib.js');
const { corsHeaders, jsonResponse } = require('./lib/http.js');
const { validateGeneratedExam, verifyAnswerKeysWithAI } = require('./lib/examQualityGate.js');

const DEFAULT_MODEL = 'claude-haiku-4-5';
// Exam generation defaults to Sonnet; override with CLAUDE_EXAM_MODEL.
const EXAM_MODEL = 'claude-sonnet-4-20250514';
const MAX_PROMPT_LEN = 16000;
const MAX_TOKENS = 8192;

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

  if (body.validateExam === true && body.exam) {
    const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
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

  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse(503, cors, { error: 'AI service is not configured on the server' });
  }

  if (body.quotaOnly === true) {
    try {
      const quotaCheck = await checkQuota(event);
      if (!quotaCheck.ok) {
        return jsonResponse(quotaCheck.status || 429, cors, {
          error: quotaCheck.error || 'quota_exceeded',
          used: quotaCheck.used,
          max: quotaCheck.max,
          plan: quotaCheck.plan,
        });
      }
      const quotaMeta = await incrementQuota(quotaCheck, {
        requestId: body.requestId || null,
      });
      return jsonResponse(200, cors, {
        ok: true,
        used: quotaMeta?.used,
        max: quotaMeta?.max,
        plan: quotaMeta?.plan,
      });
    } catch (err) {
      console.error('[claude-chat] quota-only failed:', err);
      return jsonResponse(503, cors, { error: 'quota_service_unavailable' });
    }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, cors, { error: 'prompt is required' });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return jsonResponse(400, cors, { error: `prompt exceeds ${MAX_PROMPT_LEN} characters` });
  }

  const consumeQuota = body.consumeQuota !== false;
  let quotaCheck = null;

  if (consumeQuota) {
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
  }

  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 6000, 1), MAX_TOKENS);
  const model = body.examGeneration
    ? cleanModel(process.env.CLAUDE_EXAM_MODEL || EXAM_MODEL)
    : cleanModel(body.model || process.env.CLAUDE_MODEL);

  if (body.examGeneration) {
    console.log('[claude-chat] exam generation model:', model);
  }

  const t0 = Date.now();
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
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : '') ||
        `Anthropic API error (${res.status})`;
      console.error('[claude-chat] Anthropic error:', res.status, msg);
      return jsonResponse(res.status >= 500 ? 502 : 400, cors, { error: msg });
    }

    const text = (data.content || []).map((part) => part.text || '').join('');
    if (!text) {
      return jsonResponse(502, cors, { error: 'Empty response from AI' });
    }

    if (body.examGeneration) {
      const placeholderCount = (
        text.match(/\.\.\.|Option [A-D]"|"Text here"|"Question here"|Ein Text ueber|Ein Text �ber|An article about/gi) || []
      ).length;
      if (placeholderCount > 5) {
        console.warn('[claude-chat] exam has too many placeholders:', placeholderCount);
        return jsonResponse(422, cors, {
          error: 'exam_low_quality',
          message: 'Generated exam contains placeholder content. Retry recommended.',
        });
      }
    }

    let quotaMeta = null;
    if (consumeQuota && quotaCheck?.ok) {
      try {
        quotaMeta = await incrementQuota(quotaCheck, {
          requestId: body.requestId || null,
        });
      } catch (err) {
        console.error('[claude-chat] quota increment failed:', err);
      }
    }

    console.log('[claude-chat] ok', {
      model,
      exam: !!body.examGeneration,
      ms: Date.now() - t0,
      maxTokens,
      outChars: text.length,
    });

    return jsonResponse(200, cors, {
      text,
      model,
      usage: data.usage || null,
      used: quotaMeta?.used,
      max: quotaMeta?.max,
      plan: quotaMeta?.plan,
    });
  } catch (err) {
    console.error('[claude-chat] request failed:', err, { ms: Date.now() - t0 });
    return jsonResponse(502, cors, { error: err.message || 'Internal server error' });
  }
};
