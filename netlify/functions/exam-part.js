'use strict';

/**
 * exam-part — serve and ingest reusable exam sections.
 *
 * GET  ?lang=&level=&module=[&teil=][&exclude=id,id,...]
 *   → { part } or { part: null }
 *   Public when no ?words= (generic pool pick).
 *   With ?words= (personal pool): requires auth + personal_lesen/horen quota
 *   (checkPersonalPoolQuota + CAS via poolRequestId) before serving.
 *
 * POST (requireAuth) — submit a part from the approval flow.
 *   Body: { lang, level, module, teil, passage, questions, complete, verified,
 *           itemCount?, targetCount?, genTicket? }
 *   Runs the quality gate before storing.
 *   If the part is discarded and `genTicket` is present, releases the quota.
 *   → { saved: true, key, id, complete, itemCount, targetCount }
 *   or 422 { error: 'part_discarded', ... }
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { getStoreForEvent }           = require('./lib/blobStore.js');
const { requireAuth }                = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { readAnthropicKey }           = require('./lib/anthropicKey.js');
const { resolveFromRoot } = require('./lib/projectRoot.js');
const { normalizeB1Topic } = require(resolveFromRoot('js', 'data', 'b1Topics.js'));
const { addReusablePart, pickReusablePart, pickReusablePartByTopic, pickReusablePartByVocab } = require('./lib/reusablePartsStore.js');
const { pickFromLocalSeed } = require('./lib/reusablePartsLocalSeed.js');
const { useLocalSeedInRuntime } = require('./lib/poolSourceMode.js');
const { runPartQualityGate, partMinTargetFromBlueprint, applyPartPostprocess } = require('./lib/partQualityGate.js');
const { verifyTopicCoherence } = require('./lib/topicCoherenceGate.js');
const { releaseGenerationQuota }     = require('./lib/releaseGeneration.js');
const { checkExamPartVocabRateLimit } = require('./lib/examPartVocabRateLimit.js');
const { checkPersonalModuleIntentRateLimit } = require('./lib/personalModuleIntentRateLimit.js');
const { gatePersonalExamPartGet } = require('./lib/examPartPersonalQuota.js');
const { normalizeAssembleMode, partPassesAssembleMode } = require('./lib/officialQuarantine.js');
const { planPersonalModuleAssembly } = require('./lib/personalModuleVocabPlan.js');
const { requireAuth: requireAuthUser } = require('./lib/authLib.js');

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_LANGS   = new Set(['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja']);
const ALLOWED_LEVELS  = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const ALLOWED_MODULES = new Set([
  'lesen', 'horen', 'schreiben', 'sprechen',
  'reading', 'listening', 'writing', 'speaking',
]);

// ─── Blueprint loading (optional — gate degrades gracefully if missing) ───────

let _ExamBlueprintIndex = null;

function getExamBlueprintIndex() {
  if (_ExamBlueprintIndex) return _ExamBlueprintIndex;
  try {
    const ExamBlueprint = require(resolveFromRoot('js', 'library', 'ExamBlueprint.js'));
    _ExamBlueprintIndex = ExamBlueprint.INDEX || {};
  } catch (_) {
    _ExamBlueprintIndex = {};
  }
  return _ExamBlueprintIndex;
}

function resolvePath(...segments) {
  const fromRoot = resolveFromRoot(...segments);
  if (fs.existsSync(fromRoot)) return fromRoot;
  const roots = [
    path.join(__dirname, '..', '..', ...segments),
    path.join(__dirname, '..', '..', '..', ...segments),
  ];
  for (const f of roots) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function loadBlueprint(lang, level) {
  try {
    const idx = getExamBlueprintIndex();
    const id  = idx[`${lang}_${level}`];
    if (!id) return null;
    const file = resolvePath('library', 'blueprints', `${id}.json`);
    if (!file) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExcludeList(params) {
  const raw = String(params.exclude || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
}

function validatePostBody(body) {
  const errors = [];
  const lang   = String(body.lang   || '').toLowerCase();
  const level  = String(body.level  || '').toUpperCase();
  const module = String(body.module || '').toLowerCase();
  if (!lang   || !ALLOWED_LANGS.has(lang))     errors.push('invalid_lang');
  if (!level  || !ALLOWED_LEVELS.has(level))   errors.push('invalid_level');
  if (!module || !ALLOWED_MODULES.has(module)) errors.push('invalid_module');
  if (!Array.isArray(body.questions) || !body.questions.length) errors.push('questions_required');
  return errors;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const cors    = corsHeaders(event, 'GET, POST, OPTIONS');
  const noCache = { ...cors, 'Cache-Control': 'no-store' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);

  // ── GET — public pick ─────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const lang   = String(params.lang   || '').trim().toLowerCase();
    const level  = String(params.level  || '').trim().toUpperCase();
    const module = String(params.module || '').trim().toLowerCase();

    if (!lang || !level || !module) {
      return jsonResponse(400, noCache, { error: 'lang, level, and module required' });
    }
    if (!ALLOWED_LANGS.has(lang) || !ALLOWED_LEVELS.has(level) || !ALLOWED_MODULES.has(module)) {
      return jsonResponse(400, noCache, { error: 'invalid_params' });
    }

    const partId = String(params.id || params.partId || '').trim();
    const assembleModeById = normalizeAssembleMode(params.assembleMode || params.mode);
    if (partId) {
      try {
        const { getReusablePart } = require('./lib/reusablePartsStore.js');
        const { getFromLocalSeedById } = require('./lib/reusablePartsLocalSeed.js');
        let hit = await getReusablePart(store, lang, level, module, partId);
        if (!hit && useLocalSeedInRuntime()) {
          hit = getFromLocalSeedById(lang, level, module, partId)?.part;
        }
        if (!hit) return jsonResponse(404, noCache, { part: null, id: partId });
        if (!partPassesAssembleMode(hit, assembleModeById)) {
          return jsonResponse(200, noCache, { part: null, id: partId, quarantined: true });
        }
        if (Array.isArray(hit.questions)) applyPartPostprocess(hit.questions);
        return jsonResponse(200, noCache, { part: hit, id: partId });
      } catch (err) {
        console.error('[exam-part] GET by id error:', err.message);
        return jsonResponse(500, noCache, { error: 'fetch_failed' });
      }
    }

    const excludeIds = parseExcludeList(params);
    const teilRaw = params.teil;
    const teil =
      teilRaw != null && String(teilRaw).trim() !== '' && Number.isFinite(Number(teilRaw))
        ? Number(teilRaw)
        : null;

    try {
      // Selección por vocabulario (A.2). Sin words → comportamiento clásico.
      const wordsRaw = String(params.words || '')
        .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
      const excludeTopics = String(params.excludeTopics || '')
        .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);

      let wantLemmas = [];
      if (wordsRaw.length) {
        try {
          const { canonicalizeVocabQuery } = require('./lib/vocabIndexQuality.js');
          const canon = canonicalizeVocabQuery(wordsRaw, { lang });
          wantLemmas = canon.words.length
            ? canon.words
            : (() => {
                const { lemmatizeWords } = require('./lib/passageVocab.js');
                return lemmatizeWords(wordsRaw, lang);
              })();
        } catch (lemErr) {
          console.warn('[exam-part] canonicalizeVocabQuery failed:', lemErr.message);
          try {
            const { lemmatizeWords } = require('./lib/passageVocab.js');
            wantLemmas = lemmatizeWords(wordsRaw, lang);
          } catch (_) {
            wantLemmas = wordsRaw.map((w) => String(w).toLowerCase());
          }
        }
      }

      const topicRaw = String(params.topicTag || params.topic || '').trim();
      const topicTag = topicRaw ? normalizeB1Topic(topicRaw) : null;
      const assembleMode = normalizeAssembleMode(params.assembleMode || params.mode);

      const planModule = params.planModule === '1' || params.planModule === 'true';
      if (planModule) {
        const auth = await requireAuthUser(event, store);
        if (!auth.ok) {
          return jsonResponse(auth.status || 401, noCache, {
            error: auth.error === 'unauthorized' ? 'login_required' : (auth.error || 'login_required'),
          });
        }
        const rlIntent = await checkPersonalModuleIntentRateLimit(store, event);
        if (!rlIntent.ok) {
          return jsonResponse(429, {
            ...noCache,
            'Retry-After': String(Math.max(1, Math.ceil((rlIntent.resetAt - Date.now()) / 1000))),
          }, {
            error: 'personal_module_intent_rate_limited',
            limit: rlIntent.limit,
            remaining: 0,
            resetAt: rlIntent.resetAt,
          });
        }
        const rlPlan = await checkExamPartVocabRateLimit(store, event);
        if (!rlPlan.ok) {
          return jsonResponse(429, {
            ...noCache,
            'Retry-After': String(Math.max(1, Math.ceil((rlPlan.resetAt - Date.now()) / 1000))),
          }, {
            error: 'rate_limited',
            limit: rlPlan.limit,
            remaining: 0,
            resetAt: rlPlan.resetAt,
          });
        }
        if (!wantLemmas.length) {
          return jsonResponse(400, noCache, { error: 'words_required', ok: false, reason: 'vocab_no_match' });
        }
        const verifyText = params.verifyText !== '0' && params.verifyText !== 'false';
        const blueprint = loadBlueprint(lang, level);
        try {
          const plan = await planPersonalModuleAssembly(store, lang, level, module, {
            words: wantLemmas,
            userWords: wordsRaw.length ? wordsRaw : wantLemmas,
            topicTag,
            excludeIds,
            assembleMode,
            blueprint,
            verifyText,
          });
          console.info('[exam-part] planModule', {
            ok: plan.ok,
            reason: plan.reason,
            coveredCount: plan.coveredCount,
            textCoveredCount: plan.textCoveredCount,
            decision: plan.decision,
            module,
            level,
            topic: plan.requestedTopic,
          });
          return jsonResponse(200, noCache, plan);
        } catch (planErr) {
          console.error('[exam-part] planModule error:', planErr.message, planErr.stack);
          return jsonResponse(200, noCache, {
            ok: false,
            reason: 'plan_internal_error',
            error: 'plan_internal_error',
            message: planErr.message,
          });
        }
      }

      let quotaGate = null;

      // Via A abuse guard: rate-limit only vocab picks (?words=), not classic pool pick.
      // Client intentionally skips canGenerate for pool assembly — this is the server backstop.
      if (wordsRaw.length) {
        const rl = await checkExamPartVocabRateLimit(store, event);
        if (!rl.ok) {
          return jsonResponse(429, {
            ...noCache,
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          }, {
            error: 'rate_limited',
            limit: rl.limit,
            remaining: 0,
            resetAt: rl.resetAt,
            message: 'Too many vocabulary pool lookups. Wait a moment and try again.',
          });
        }

        quotaGate = await gatePersonalExamPartGet(event, store, {
          module,
          poolRequestId: params.poolRequestId || params.requestId,
          wordsPresent: true,
        });
        if (!quotaGate.ok) {
          return jsonResponse(quotaGate.status || 429, noCache, {
            error: quotaGate.error || 'personal_pool_quota_exceeded',
            module: quotaGate.module,
            used: quotaGate.used,
            max: quotaGate.max,
            plan: quotaGate.plan,
          });
        }
      }

      let result = null;
      let poolRelaxed = false;

      if (wantLemmas.length) {
        result = await pickReusablePartByVocab(store, lang, level, module, {
          excludeIds, teil, words: wantLemmas, excludeTopics, topicTag, assembleMode,
        });
        if (result?.source === 'local-seed') {
          console.info(`[exam-part] local seed vocab ${module} T${teil ?? '?'} → ${result.id}`);
        }
        if (result?.topicRelaxed) poolRelaxed = true;
      }
      if (!result && topicTag) {
        result = await pickReusablePartByTopic(store, lang, level, module, {
          excludeIds, teil, topicTag, assembleMode,
        });
      }
      if (!result) {
        result = await pickReusablePart(store, lang, level, module, { excludeIds, teil, assembleMode });
        if (result && topicTag) poolRelaxed = true;
      }
      if (!result && useLocalSeedInRuntime()) {
        result = pickFromLocalSeed(lang, level, module, { excludeIds, teil, assembleMode });
        if (result) {
          console.info(`[exam-part] local seed ${module} T${teil ?? '?'} → ${result.id}`);
        }
      }
      if (!result) return jsonResponse(200, noCache, { part: null });
      if (Array.isArray(result.part?.questions)) {
        applyPartPostprocess(result.part.questions);
      }
      const payload = {
        part: result.part,
        id: result.id,
        coveredWords: result.coveredWords || [],
        coverage: result.coverage || null,
        topic: result.topic || result.part?.topic || null,
        topicTag: result.topicTag || result.part?.topicTag || null,
        topicRelaxed: poolRelaxed || !!result.topicRelaxed,
        requestedLemmas: wantLemmas,
      };
      if (wordsRaw.length && quotaGate?.quotaMeta && !quotaGate.quotaMeta.error) {
        payload.personalLesenUsed = quotaGate.quotaMeta.personalLesenUsed;
        payload.personalHorenUsed = quotaGate.quotaMeta.personalHorenUsed;
      }
      return jsonResponse(200, noCache, payload);
    } catch (err) {
      console.error('[exam-part] GET error:', err.message, err.stack);
      return jsonResponse(500, noCache, {
        error: 'internal_error',
        reason: 'exam_part_get_exception',
        message: err.message,
      });
    }
  }

  // ── POST — authenticated contribute ──────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const auth = await requireAuth(event, store);
    if (!auth.ok) {
      return jsonResponse(auth.status || 401, cors, { error: auth.error || 'login_required' });
    }

    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }

    const bodyErrors = validatePostBody(body);
    if (bodyErrors.length) {
      return jsonResponse(400, cors, { error: 'invalid_fields', details: bodyErrors });
    }

    const lang   = String(body.lang).toLowerCase();
    const level  = String(body.level).toUpperCase();
    const module = String(body.module).toLowerCase();
    const teil   = body.teil ?? null;

    // ── Quality gate ────────────────────────────────────────────────────────
    const blueprint = loadBlueprint(lang, level);
    const apiKey    = readAnthropicKey();

    const partInput = {
      id:          body.id || randomUUID(),
      lang,
      level,
      module,
      teil,
      passage:     body.passage     || null,
      questions:   body.questions,
      targetCount: body.targetCount ?? (blueprint
        ? partMinTargetFromBlueprint(blueprint, module, teil)
        : body.questions.length),
    };

    const gateResult = await runPartQualityGate(partInput, {
      blueprint,
      apiKey,
      repair: true,
      topic: body.topic || null,
      lang,
      level,
      skipTopicCoherence: true,
    });

    console.info(
      `[exam-part] gate ${lang}/${level}/${module} t${teil}: ` +
      `${gateResult.itemCount}/${gateResult.targetCount} valid, ` +
      `complete=${gateResult.complete}, discarded=${gateResult.discarded}` +
      (gateResult.repaired ? ' (repaired)' : ''),
    );

    // ── Discard path ────────────────────────────────────────────────────────
    if (gateResult.discarded) {
      // Release generation quota if a ticket was provided
      if (body.genTicket) {
        try {
          const rel = await releaseGenerationQuota(event, { genTicket: body.genTicket });
          console.info('[exam-part] quota released:', rel.released, rel.reason || '');
        } catch (relErr) {
          console.warn('[exam-part] quota release failed:', relErr.message);
        }
      }

      return jsonResponse(422, cors, {
        error:  'part_discarded',
        reason: gateResult.reason,
        itemCount:   gateResult.itemCount,
        targetCount: gateResult.targetCount,
        minItems:    gateResult.minItems,
        aiSkipped:   gateResult.aiSkipped,
        structErrors: (gateResult.structInvalid || []).map((e) => ({
          id:     e.question?.id,
          errors: e.errors,
        })),
      });
    }

    // ── Topic coherence (reusable pool route — final gate) ─────────────────
    if (apiKey && process.env.TOPIC_COHERENCE_GATE !== '0') {
      process.env.TOPIC_COHERENCE_GATE = process.env.TOPIC_COHERENCE_GATE || '1';
      const coherencePart = {
        module,
        teil,
        passage: partInput.passage,
        questions: gateResult.validItems,
        text: partInput.passage?.text,
        transcript: partInput.passage?.transcript,
      };
      const coherence = await verifyTopicCoherence(coherencePart, {
        topic: body.topic || null,
        lang,
        level,
        apiKey,
        module,
        teil,
      });
      if (!coherence.skipped && (!coherence.onTopic || !coherence.cefrOk)) {
        console.info('[exam-part] topic coherence rejected', {
          module,
          teil,
          onTopic: coherence.onTopic,
          cefrOk: coherence.cefrOk,
          issues: coherence.issues,
        });
        if (body.genTicket) {
          try {
            const rel = await releaseGenerationQuota(event, { genTicket: body.genTicket });
            console.info('[exam-part] quota released:', rel.released, rel.reason || '');
          } catch (relErr) {
            console.warn('[exam-part] quota release failed:', relErr.message);
          }
        }
        return jsonResponse(422, cors, {
          error: 'part_discarded',
          reason: 'topic_coherence_failed',
          onTopic: coherence.onTopic,
          cefrOk: coherence.cefrOk,
          issues: coherence.issues || [],
          itemCount: gateResult.itemCount,
          targetCount: gateResult.targetCount,
        });
      }
    }

    // ── Store validated part ────────────────────────────────────────────────
    const now  = Date.now();
    const part = {
      id:          partInput.id,
      lang,
      level,
      module,
      teil,
      passage:     body.passage || null,
      questions:   gateResult.validItems,
      complete:    gateResult.complete,
      verified:    true,
      itemCount:   gateResult.itemCount,
      targetCount: gateResult.targetCount,
      contributor: auth.email,
      createdAt:   body.createdAt || now,
      topicTag:    body.topicTag || body.topic || null,
    };

    const { partKey } = await addReusablePart(store, part);

    return jsonResponse(200, cors, {
      saved:       true,
      key:         partKey,
      id:          part.id,
      complete:    part.complete,
      itemCount:   part.itemCount,
      targetCount: part.targetCount,
      repaired:    gateResult.repaired,
      aiSkipped:   gateResult.aiSkipped,
    });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
