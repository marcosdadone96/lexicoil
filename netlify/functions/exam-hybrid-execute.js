'use strict';

/**
 * exam-hybrid-execute — hybrid Lesen EXECUTION (pool + Gemini factory).
 *
 * POST /.netlify/functions/exam-hybrid-execute
 * Body: {
 *   genTicket,              // required — from claude-chat startGeneration (personal_exam)
 *   topic, vocab,
 *   lang?, level?, module?, teils?, poolThreshold?,
 *   plan?, planMeta?,       // optional — from exam-plan
 *   skipLive?: boolean
 * }
 *
 * Credits: charged once at startGeneration; this endpoint consumes one ticket session slot
 * and does NOT call confirmAiCreditConsumption again. Client calls deliverGeneration when
 * the exam is shown, or releaseGeneration on total failure.
 */
const { getStoreForEvent } = require('./lib/blobStore.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { requireActionAccess } = require('./lib/proAiModes.js');
const { isAllowLiveGenEnabled, liveGenDisabledResponse } = require('./lib/liveGenGate.js');
const { verifyGenTicketOrNull } = require('./lib/genTicketLib.js');
const { resolveFromRoot } = require('./lib/projectRoot.js');
const { writeHybridError } = require('./lib/hybridErrorLog.js');
const { executeHybridLesenExamWeb, logHybridTraceReport } = require('./lib/hybridExamWebExecute.js');

let normalizeB1Topic;
try {
  ({ normalizeB1Topic } = require(resolveFromRoot('js', 'data', 'b1Topics.js')));
} catch (moduleErr) {
  writeHybridError('exam-hybrid-execute:module_load', moduleErr, {
    module: 'js/data/b1Topics.js',
  });
  throw moduleErr;
}

const ALLOWED_LANGS = new Set(['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja']);
const ALLOWED_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const ALLOWED_MODULES = new Set([
  'lesen', 'horen', 'schreiben', 'sprechen',
  'reading', 'listening', 'writing', 'speaking',
]);

function parseVocab(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).slice(0, 40);
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function validateBody(body) {
  const errors = [];
  const lang = String(body.lang || 'de').trim().toLowerCase();
  const level = String(body.level || 'B1').trim().toUpperCase();
  const module = String(body.module || 'lesen').trim().toLowerCase();
  const topicRaw = body.topic != null ? String(body.topic).trim() : '';
  const topicCanon = topicRaw ? normalizeB1Topic(topicRaw) : null;
  const vocab = parseVocab(body.vocab);

  if (!body.genTicket || typeof body.genTicket !== 'string') errors.push('genTicket_required');
  if (!topicRaw) errors.push('topic_required');
  else if (!topicCanon) errors.push(`invalid_topic:${topicRaw}`);
  if (!vocab.length) errors.push('vocab_required');
  if (!ALLOWED_LANGS.has(lang)) errors.push('invalid_lang');
  if (!ALLOWED_LEVELS.has(level)) errors.push('invalid_level');
  if (!ALLOWED_MODULES.has(module)) errors.push('invalid_module');

  if (errors.length) return { errors };

  const onlyLiveTeil =
    body.onlyLiveTeil != null && Number.isFinite(Number(body.onlyLiveTeil))
      ? Number(body.onlyLiveTeil)
      : null;

  return {
    lang,
    level,
    module,
    topic: topicCanon,
    topicRaw,
    vocab,
    genTicket: String(body.genTicket).trim(),
    plan: body.plan,
    planMeta: body.planMeta || body.meta || null,
    teils: body.teils,
    poolThreshold: body.poolThreshold,
    skipLive: body.skipLive === true,
    onlyLiveTeil,
    includePool: body.includePool !== false,
    partialExam: body.partialExam || null,
    partialTrace: body.partialTrace || null,
    validateExam: body.validateExam !== false,
  };
}

function safeJsonResponse(statusCode, headers, body, extraHeaders = {}) {
  try {
    return jsonResponse(statusCode, headers, body, extraHeaders);
  } catch (stringifyErr) {
    writeHybridError('exam-hybrid-execute:json_stringify', stringifyErr, {
      phase: 'respond',
      statusCode,
    });
    return jsonResponse(statusCode, headers, {
      error: 'response_serialization_failed',
      message: stringifyErr.message,
      phase: 'respond',
      errorLog: 'last-hybrid-error.json',
    });
  }
}

function summarizeLiveTrace(trace, plan) {
  const cells = plan?.toGenerate || [];
  let gatePass = 0;
  let fallback = 0;
  let failed = 0;
  for (const cell of cells) {
    const live = (trace?.live || []).find((l) => Number(l.teil) === Number(cell.teil));
    if (!live || live.skipped) continue;
    if (live.ok && !live.fallback) gatePass += 1;
    else if (live.ok && live.fallback) fallback += 1;
    else failed += 1;
  }
  return { gatePass, fallback, failed, liveCells: cells.length };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'POST, OPTIONS');
  const noCache = { ...cors, 'Cache-Control': 'no-store' };
  let requestContext = { phase: 'init' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return jsonResponse(405, cors, { error: 'method_not_allowed' });

  const store = getStoreForEvent(event);

  try {
    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }

    requestContext.phase = 'validate_body';
    const parsed = validateBody(body);
    if (parsed.errors?.length) {
      return jsonResponse(400, cors, { error: 'invalid_fields', details: parsed.errors });
    }
    requestContext = {
      phase: 'access_check',
      topicRaw: parsed.topicRaw,
      topic: parsed.topic,
      lang: parsed.lang,
      level: parsed.level,
      module: parsed.module,
      skipLive: parsed.skipLive,
      planTeils: parsed.plan?.toGenerate?.map((c) => c.teil),
    };

    const access = await requireActionAccess(event, 'personal_exam');
    if (!access.ok) {
      return jsonResponse(access.status || 403, cors, {
        error: access.error || 'forbidden',
        plan: access.plan,
      });
    }

    requestContext.phase = 'verify_ticket';
    const ticketPayload = verifyGenTicketOrNull(parsed.genTicket);
    if (!ticketPayload) {
      return jsonResponse(403, cors, { error: 'ticket_invalid' });
    }
    if (ticketPayload.scope !== 'personal_exam') {
      return jsonResponse(403, cors, { error: 'ticket_scope_invalid' });
    }

    requestContext.phase = 'live_gate';
    const skipLive = parsed.skipLive;
    const needsLive = !skipLive && Array.isArray(parsed.plan?.toGenerate)
      ? parsed.plan.toGenerate.length > 0
      : true;

    if (needsLive && !skipLive) {
      if (!isAllowLiveGenEnabled()) {
        return liveGenDisabledResponse(jsonResponse, cors);
      }
      if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
        return jsonResponse(503, cors, { error: 'gemini_misconfigured' });
      }
    }

    requestContext.phase = 'execute_hybrid';
    const result = await executeHybridLesenExamWeb({
      store,
      event,
      genTicket: parsed.genTicket,
      plan: parsed.plan,
      planMeta: parsed.planMeta,
      topic: parsed.topic,
      vocab: parsed.vocab,
      lang: parsed.lang,
      level: parsed.level,
      module: parsed.module,
      teils: parsed.teils,
      poolThreshold: parsed.poolThreshold,
      skipLive: parsed.skipLive,
      onlyLiveTeil: parsed.onlyLiveTeil,
      includePool: parsed.includePool,
      partialExam: parsed.partialExam,
      partialTrace: parsed.partialTrace,
      validateExam: parsed.validateExam,
    });

    requestContext.phase = 'summarize_trace';
    const liveStats = summarizeLiveTrace(result.trace, result.plan);
    const genTicket = result.exam?._genTicket || parsed.genTicket;

    try {
      logHybridTraceReport(result.plan, result.trace, liveStats);
    } catch (traceErr) {
      writeHybridError('exam-hybrid-execute:trace_log', traceErr, requestContext);
      console.warn('[exam-hybrid-execute] trace log failed (non-fatal):', traceErr.message);
    }

    requestContext.phase = 'respond';
    return safeJsonResponse(200, noCache, {
      ok: true,
      exam: result.exam,
      plan: result.plan,
      meta: result.meta,
      trace: result.trace,
      validation: {
        valid: result.validation?.valid === true,
        errors: result.validation?.errors || [],
      },
      liveStats,
      poolIndexSize: result.poolIndexSize,
      genTicket,
      releaseEligible: !result.validation?.valid && liveStats.failed > 0,
    });
  } catch (err) {
    if (/timed out after/i.test(String(err.message || ''))) {
      err.status = 504;
      err.message = 'hybrid_execute_timeout';
      err.details = {
        hint: 'Netlify sync limit ~60s per call — client uses 55s; run one Teil per request',
        original: err.message,
      };
    }
    const status = Number(err.status) || 500;
    const logged = writeHybridError('exam-hybrid-execute', err, requestContext);
    return safeJsonResponse(status, cors, {
      error: err.message || 'hybrid_execute_failed',
      details: err.data || err.details || undefined,
      phase: requestContext.phase || null,
      errorLog: 'last-hybrid-error.json',
      errorAt: logged.at,
      errorWrittenTo: logged.writtenTo || null,
    });
  }
};
