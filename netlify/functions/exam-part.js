'use strict';

/**
 * exam-part — serve and ingest reusable exam sections.
 *
 * GET  ?lang=&level=&module=[&exclude=id,id,...]
 *   → { part } or { part: null }
 *   Public (parts are not user-specific content).
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
const { addReusablePart, pickReusablePart } = require('./lib/reusablePartsStore.js');
const { runPartQualityGate, partMinTargetFromBlueprint } = require('./lib/partQualityGate.js');
const { releaseGenerationQuota }     = require('./lib/releaseGeneration.js');

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
    const ExamBlueprint = require('../../js/library/ExamBlueprint.js');
    _ExamBlueprintIndex = ExamBlueprint.INDEX || {};
  } catch (_) {
    _ExamBlueprintIndex = {};
  }
  return _ExamBlueprintIndex;
}

function resolvePath(...segments) {
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

    const excludeIds = parseExcludeList(params);

    try {
      const result = await pickReusablePart(store, lang, level, module, { excludeIds });
      if (!result) return jsonResponse(200, noCache, { part: null });
      return jsonResponse(200, noCache, { part: result.part, id: result.id });
    } catch (err) {
      console.error('[exam-part] GET error:', err.message);
      return jsonResponse(200, noCache, { part: null });
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
