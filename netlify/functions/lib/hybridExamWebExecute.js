'use strict';

/**
 * Web hybrid exam EXECUTION — pool serve + shared Gemini factory (no Claude chunks).
 *
 * Decision: planHybridDecision (via exam-plan or precomputed plan).
 * Pool: fetch part by id from store / local seed.
 * Live: generateLesenPartFactory + validateLesenDelivery.
 */
const path = require('path');
const { getReusablePart } = require('./reusablePartsStore.js');
const { getFromLocalSeedById, pickFromLocalSeed } = require('./reusablePartsLocalSeed.js');
const { useLocalSeedInRuntime } = require('./poolSourceMode.js');
const { partPassesPublishGate } = require('./partPublishGate.js');
const { loadPoolIndex } = require('./loadPoolIndex.js');
const { loadBlueprintFile } = require('./hybridExamChunkPrompt.js');
const { buildPlanFromParams } = require('../exam-plan.js');
const { resolveFromRoot } = require('./projectRoot.js');
const PF = require(resolveFromRoot('js', 'engine', 'personalLesenPoolFallback.js'));
const { validateGeneratedExam } = require('./examQualityGate.js');
const { generateLesenPart, createLesenFactorySession } = require('./generateLesenPartFactoryRunner.js');
const { validateLesenDelivery } = require('./lesenDeliveryGateRunner.js');
const { loadDedupCorpusFromStore } = require('./webPartGate.js');
const { consumeGenTicketSession } = require('./genTicketLib.js');

const DEFAULT_MAX_RETRIES = 2;

async function resolvePlan(opts, store) {
  if (opts.plan?.fromPool && opts.plan?.toGenerate) {
    return { plan: opts.plan, meta: opts.planMeta || null };
  }
  const built = await buildPlanFromParams(
    {
      module: opts.module || 'lesen',
      teils: opts.teils,
      topic: opts.topic,
      vocab: opts.vocab,
      lang: opts.lang || 'de',
      level: opts.level || 'B1',
      poolThreshold: opts.poolThreshold,
    },
    store,
  );
  if (built.error) {
    const err = new Error(built.error);
    err.details = built.details;
    err.status = built.status;
    throw err;
  }
  return { plan: built.plan, meta: built.meta };
}

async function fetchPoolPartById(store, lang, level, module, partId) {
  const normModule = String(module).toLowerCase();
  if (store) {
    const fromStore = await getReusablePart(store, lang, level, normModule, partId);
    if (fromStore && partPassesPublishGate(fromStore)) {
      return { id: partId, part: fromStore, source: 'store' };
    }
  }
  if (!useLocalSeedInRuntime()) return null;
  return getFromLocalSeedById(lang, level, normModule, partId);
}

function parseHandlerJson(res) {
  if (!res?.body) return {};
  try {
    return typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
  } catch {
    return {};
  }
}

async function invokeClaudeHandler(handler, event, body) {
  const ev = {
    httpMethod: 'POST',
    headers: {
      ...(event?.headers || {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
  const res = await handler(ev, {});
  return { status: res.statusCode, data: parseHandlerJson(res) };
}

async function startPersonalExamTicket(handler, event, maxChunks = 1) {
  const res = await invokeClaudeHandler(handler, event, {
    startGeneration: true,
    scope: 'personal_exam',
    maxChunks: Math.max(1, Number(maxChunks) || 1),
  });
  if (res.status !== 200 || !res.data?.ticket) {
    const err = new Error(res.data?.error || 'startGeneration_failed');
    err.status = res.status;
    err.data = res.data;
    throw err;
  }
  return res.data.ticket;
}

async function fallbackPoolPart(store, lang, level, module, teil, topicTag) {
  if (store) {
    const { pickReusablePart } = require('./reusablePartsStore.js');
    const fromBlob = await pickReusablePart(store, lang, level, module, { teil, excludeIds: [] });
    if (fromBlob?.part) return { ...fromBlob, fallback: true, topicTag };
  }
  if (!useLocalSeedInRuntime()) return null;
  const hit =
    pickFromLocalSeed(lang, level, module, { teil, excludeIds: [] }) ||
    pickFromLocalSeed(lang, level, module, { teil, excludeIds: [], excludeTopics: [] });
  if (!hit?.part) return null;
  return { ...hit, fallback: true, topicTag };
}

function batchToLesenPart(batch, blueprint, teil) {
  const t = Number(teil);
  const poolRecord = {
    id: batch.id || `live-${t}-${Date.now()}`,
    lang: batch.lang || 'de',
    level: batch.level || 'B1',
    module: 'lesen',
    teil: t,
    passage:
      batch.passages?.[0]
        ? {
            title: batch.passages[0].title || batch.passages[0].textTitle || '',
            text: batch.passages[0].text || '',
            passages:
              t === 2 && batch.passages?.length >= 2
                ? batch.passages.map((p) => ({
                    passageId: p.id,
                    textTitle: p.title || p.textTitle || '',
                    text: p.text || '',
                  }))
                : undefined,
          }
        : null,
    passages: batch.passages,
    questions: batch.questions || [],
    ads: batch.ads,
    complete: true,
    verified: true,
    topicTag: batch.topicTag,
  };
  return PF.reusablePartToLesenPart(poolRecord, blueprint);
}

async function loadDeliveryDedupCorpus(store, lang, level, module, batch) {
  const excludeIds = (batch.passages || []).map((p) => p.id).filter(Boolean);
  try {
    return await loadDedupCorpusFromStore(store, {
      lang,
      level,
      module,
      excludePassageIds: excludeIds,
    });
  } catch (err) {
    console.warn('[hybridExamWebExecute] dedup corpus load failed:', err.message);
    return [];
  }
}

/**
 * Execute hybrid Lesen module via web stack.
 */
async function executeHybridLesenExamWeb(opts) {
  const {
    store,
    event,
    claudeHandler,
    topic,
    vocab,
    lang = 'de',
    level = 'B1',
    module = 'lesen',
    maxDeliveryAttempts = DEFAULT_MAX_RETRIES,
    skipLive = false,
    genTicket: genTicketIn,
    onlyLiveTeil = null,
    includePool = true,
    partialExam = null,
    partialTrace = null,
    validateExam = true,
  } = opts;

  if (!event) throw new Error('event_required');
  if (!store) {
    console.warn('[hybridExamWebExecute] blobs store unavailable — using local seed + dev ticket path');
  }

  const { plan, meta } = await resolvePlan(opts, store);
  const blueprint = opts.blueprint || loadBlueprintFile(lang, level);
  const trace = {
    planSource: 'planHybridDecision',
    pool: [...(partialTrace?.pool || [])],
    live: [...(partialTrace?.live || [])],
    gates: [...(partialTrace?.gates || [])],
    gateAttempts: [...(partialTrace?.gateAttempts || [])],
    generator: 'factory',
  };
  const exam = {
    lang,
    level,
    goetheFormat: true,
    vocabPersonal: true,
    topic,
    topicTag: topic,
    lesenParts: Array.isArray(partialExam?.lesenParts)
      ? partialExam.lesenParts.map((p) => ({ ...p }))
      : [],
  };
  if (partialExam?._genTicket) exam._genTicket = partialExam._genTicket;

  if (includePool !== false) {
    for (const cell of plan.fromPool || []) {
    const hit = await fetchPoolPartById(store, lang, level, module, cell.partId);
    if (!hit?.part) {
      trace.pool.push({ teil: cell.teil, partId: cell.partId, ok: false, reason: 'part_not_found' });
      continue;
    }
    const part = PF.reusablePartToLesenPart(hit.part, blueprint);
    if (!part) {
      trace.pool.push({ teil: cell.teil, partId: cell.partId, ok: false, reason: 'convert_failed' });
      continue;
    }
    part._source = 'pool';
    part._poolId = cell.partId;
    PF.insertLesenTeil(exam, part, cell.teil);
    trace.pool.push({
      teil: cell.teil,
      partId: cell.partId,
      ok: true,
      source: hit.source,
    });
    trace.gates.push({ teil: cell.teil, source: 'pool', ok: true });
    }
  }

  let toGenerate = plan.toGenerate || [];
  if (onlyLiveTeil != null && Number.isFinite(Number(onlyLiveTeil))) {
    toGenerate = toGenerate.filter((c) => Number(c.teil) === Number(onlyLiveTeil));
  }

  if (!skipLive && toGenerate.length) {
    let genTicket = genTicketIn || null;
    if (!genTicket) {
      if (!claudeHandler) throw new Error('claudeHandler_required_for_live');
      genTicket = await startPersonalExamTicket(claudeHandler, event, 1);
    }

    const ticketCheck = await consumeGenTicketSession(event, genTicket);
    if (!ticketCheck.ok) {
      const err = new Error(ticketCheck.error || 'ticket_session_failed');
      err.status = ticketCheck.status || 403;
      err.data = ticketCheck;
      throw err;
    }

    let factorySession = await createLesenFactorySession({ lang, level, fixRetries: 2 });

    for (const cell of toGenerate) {
      const teil = Number(cell.teil);
      const words = cell.vocabForCell || plan.vocabCoverage?.pending || [];
      let served = false;
      let lastFail = null;

      for (let attempt = 1; attempt <= maxDeliveryAttempts; attempt++) {
        let gen;
        try {
          gen = await generateLesenPart({
            teil,
            topic,
            words,
            lang,
            level,
            fixRetries: 2,
            session: factorySession,
            writeFile: false,
          });
        } catch (factoryErr) {
          if (
            factoryErr?.name === 'ApiBudgetStopError' ||
            factoryErr?.name === 'RateLimitStopError' ||
            factoryErr?.name === 'DailyQuotaError'
          ) {
            factoryErr.status = 503;
            factoryErr.data = { teil, code: factoryErr.name };
          }
          throw factoryErr;
        }
        if (gen.session) factorySession = gen.session;

        if (!gen.ok || !gen.batch) {
          lastFail = { reason: gen.reason || 'factory_failed', attempt };
          trace.gateAttempts.push({
            teil,
            attempt,
            phase: 'factory',
            error: gen.reason,
            gate: gen.gate || null,
          });
          continue;
        }

        const dedupCorpus = await loadDeliveryDedupCorpus(store, lang, level, module, gen.batch);
        const { gate } = await validateLesenDelivery(gen.batch, {
          teil,
          lang,
          level,
          dedupCorpus: dedupCorpus?.length ? dedupCorpus : null,
        });

        if (!gate.ok) {
          const first = gate.blocking?.[0];
          lastFail = { reason: 'delivery_gate_failed', attempt, gate: first?.id };
          trace.gateAttempts.push({
            teil,
            attempt,
            phase: 'delivery',
            error: 'part_gate_rejected',
            gate: first?.id || null,
            blocking: gate.blocking || [],
          });
          continue;
        }

        const part = batchToLesenPart(gate.batch, blueprint, teil);
        if (!part) {
          lastFail = { reason: 'convert_failed', attempt };
          continue;
        }
        part._source = 'live';
        part._gateOk = true;
        PF.insertLesenTeil(exam, part, teil);
        trace.live.push({
          teil,
          ok: true,
          vocabUsed: words,
          apiCalls: gen.apiCalls,
          ms: gen.ms,
        });
        trace.gates.push({ teil, source: 'live', ok: true });
        served = true;
        break;
      }

      if (served) continue;

      const fb = await fallbackPoolPart(store, lang, level, module, teil, topic);
      if (fb?.part) {
        const part = PF.reusablePartToLesenPart(fb.part, blueprint);
        part._source = 'live-fallback-pool';
        part._fallback = true;
        PF.insertLesenTeil(exam, part, teil);
        trace.live.push({
          teil,
          ok: true,
          fallback: true,
          reason: lastFail?.reason || 'delivery_exhausted',
          partId: fb.id,
        });
        trace.gates.push({ teil, source: 'live-fallback-pool', ok: true });
      } else {
        trace.live.push({
          teil,
          ok: false,
          reason: lastFail?.reason || 'generation_and_fallback_failed',
        });
        trace.gates.push({ teil, source: 'live', ok: false });
      }
    }

    exam._genTicket = genTicket;
  } else if (skipLive) {
    for (const cell of toGenerate) {
      trace.live.push({ teil: cell.teil, ok: false, skipped: true, reason: 'skipLive' });
    }
  }

  exam.lesenParts.sort((a, b) => Number(a.teil) - Number(b.teil));
  exam._hybridPlan = plan;
  exam._hybridTrace = trace;

  if (typeof PF.repairLesenPartsForValidation === 'function') {
    PF.repairLesenPartsForValidation(exam);
  }

  const validation = validateExam !== false
    ? validateGeneratedExam(exam, { strict: false, blueprint, partialExam: true })
    : { valid: true, errors: [], skipped: true };

  return {
    plan,
    meta,
    exam,
    trace,
    validation,
    poolIndexSize: meta?.poolIndexSize ?? (await loadPoolIndex(store, lang, level, module)).length,
  };
}

function lastGateAttemptSummary(gateAttempts, teil) {
  const rows = (gateAttempts || []).filter((a) => Number(a.teil) === Number(teil));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const blk = (last.blocking || [])[0];
  return {
    attempt: last.attempt,
    phase: last.phase,
    error: last.error || null,
    gate: last.gate || blk?.id || null,
    blockingId: blk?.id || null,
    blockingMessage: blk?.message || null,
  };
}

/**
 * Server-side hybrid telemetry — log from exam-hybrid-execute before HTTP response.
 */
function logHybridTraceReport(plan, trace, liveStats) {
  const poolPlan = new Map((plan?.fromPool || []).map((c) => [Number(c.teil), c.partId]));
  const livePlan = new Set((plan?.toGenerate || []).map((c) => Number(c.teil)));
  const poolTrace = new Map((trace?.pool || []).map((p) => [Number(p.teil), p]));
  const liveTrace = new Map((trace?.live || []).map((l) => [Number(l.teil), l]));

  const teilRows = [1, 2, 3, 4, 5].map((t) => {
    if (poolPlan.has(t)) {
      const p = poolTrace.get(t) || {};
      return {
        teil: t,
        origen: 'pool',
        planPartId: poolPlan.get(t) || null,
        resultado: p.ok ? 'ok' : 'fail',
        fallback: false,
        reason: p.reason || null,
        gate: null,
        blocking: null,
      };
    }
    if (!livePlan.has(t)) {
      return { teil: t, origen: '—', resultado: 'not_in_plan', fallback: false, reason: null };
    }
    const l = liveTrace.get(t) || {};
    let resultado = 'unknown';
    if (l.skipped) resultado = 'skipped';
    else if (l.ok && !l.fallback) resultado = 'ok_live';
    else if (l.ok && l.fallback) resultado = 'fallback';
    else if (l.ok === false) resultado = 'failed';
    const gate = lastGateAttemptSummary(trace?.gateAttempts, t);
    return {
      teil: t,
      origen: 'live',
      planPartId: null,
      resultado,
      fallback: !!l.fallback,
      reason: l.reason || gate?.error || null,
      gate: gate?.gate || gate?.blockingId || null,
      blocking: gate?.blockingMessage || null,
      lastAttempt: gate,
    };
  });

  console.log('[HYBRID-TRACE] teil summary:', JSON.stringify(teilRows, null, 2));
  console.log(
    '[HYBRID-TRACE] full:',
    JSON.stringify(
      {
        plan: {
          fromPool: plan?.fromPool,
          toGenerate: plan?.toGenerate,
          vocabCoverage: plan?.vocabCoverage,
        },
        trace: {
          generator: trace?.generator,
          pool: trace?.pool,
          live: trace?.live,
          gates: trace?.gates,
          gateAttempts: trace?.gateAttempts,
        },
        liveStats,
      },
      null,
      2,
    ),
  );
}

module.exports = {
  executeHybridLesenExamWeb,
  fetchPoolPartById,
  resolvePlan,
  startPersonalExamTicket,
  invokeClaudeHandler,
  logHybridTraceReport,
};
