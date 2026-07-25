'use strict';

/**
 * exam-plan — hybrid exam DECISION endpoint (pure planHybridDecision).
 *
 * POST /.netlify/functions/exam-plan
 * Body: { module, teils?, topic, vocab, lang?, level?, poolThreshold? }
 * → { plan: { fromPool, toGenerate, vocabCoverage }, meta: { poolIndexSize, ... } }
 *
 * GET ?lang=&level=&module=&topic=&vocab=word1,word2&teils=1,2,3,4,5
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { loadPoolIndex } = require('./lib/loadPoolIndex.js');
const { resolveFromRoot } = require('./lib/projectRoot.js');
const { normalizeB1Topic, B1_TOPICS } = require(resolveFromRoot('js', 'data', 'b1Topics.js'));

const DEFAULT_TEIL_LIST = [1, 2, 3, 4, 5];

let _hybridExamPlanMod = null;
async function loadHybridExamPlanMod() {
  if (_hybridExamPlanMod) return _hybridExamPlanMod;
  const href = pathToFileURL(resolveFromRoot('scripts', 'lib', 'hybridExamPlan.mjs')).href;
  _hybridExamPlanMod = await import(href);
  return _hybridExamPlanMod;
}

const ALLOWED_LANGS = new Set(['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja']);
const ALLOWED_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const ALLOWED_MODULES = new Set([
  'lesen', 'horen', 'schreiben', 'sprechen',
  'reading', 'listening', 'writing', 'speaking',
]);

function resolveBlueprint(lang, level) {
  try {
    const ExamBlueprint = require(resolveFromRoot('js', 'library', 'ExamBlueprint.js'));
    const id = ExamBlueprint.INDEX?.[`${lang}_${level}`];
    if (!id) return null;
    const file = resolveFromRoot('library', 'blueprints', `${id}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const roots = [
      path.join(__dirname, '..', '..', 'library', 'blueprints', `${id}.json`),
      path.join(__dirname, '..', '..', '..', 'library', 'blueprints', `${id}.json`),
    ];
    for (const alt of roots) {
      if (fs.existsSync(alt)) return JSON.parse(fs.readFileSync(alt, 'utf8'));
    }
  } catch (_) {
    /* optional */
  }
  return null;
}

function parseTeils(raw) {
  if (raw == null || raw === '') return [...(DEFAULT_TEIL_LIST || [1, 2, 3, 4, 5])];
  const parts = String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite);
  return parts.length ? parts : [1, 2, 3, 4, 5];
}

function parseVocab(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).slice(0, 40);
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function validateParams({ lang, level, module, vocab }) {
  const errors = [];
  if (!lang || !ALLOWED_LANGS.has(lang)) errors.push('invalid_lang');
  if (!level || !ALLOWED_LEVELS.has(level)) errors.push('invalid_level');
  if (!module || !ALLOWED_MODULES.has(module)) errors.push('invalid_module');
  if (!vocab?.length) errors.push('vocab_required');
  return errors;
}

async function buildPlanFromParams(params, store) {
  const lang = String(params.lang || '').trim().toLowerCase();
  const level = String(params.level || '').trim().toUpperCase();
  const module = String(params.module || '').trim().toLowerCase();
  const topicRaw = params.topic != null ? String(params.topic).trim() : '';
  const topic = topicRaw ? normalizeB1Topic(topicRaw) : '';
  const vocab = parseVocab(params.vocab);
  const teils = parseTeils(params.teils);
  const poolThreshold =
    params.poolThreshold != null && Number.isFinite(Number(params.poolThreshold))
      ? Number(params.poolThreshold)
      : 1;

  const fieldErrors = validateParams({ lang, level, module, vocab });
  if (topicRaw && !topic) fieldErrors.push(`invalid_topic:${topicRaw}`);
  if (fieldErrors.length) {
    return { error: 'invalid_fields', details: fieldErrors, status: 400 };
  }

  const poolIndex = await loadPoolIndex(store, lang, level, module);
  const { planHybridDecision } = await loadHybridExamPlanMod();
  const plan = planHybridDecision({
    module,
    teils,
    topic,
    vocab,
    poolIndex,
    lang,
    level,
    poolThreshold,
  });

  return {
    status: 200,
    plan,
    meta: {
      lang,
      level,
      module,
      topic,
      topicRaw: topicRaw || topic,
      teils,
      poolIndexSize: poolIndex.length,
      canonicalTopics: B1_TOPICS,
      poolThreshold,
    },
  };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  const noCache = { ...cors, 'Cache-Control': 'no-store' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);

  try {
    if (event.httpMethod === 'GET') {
      const p = event.queryStringParameters || {};
      const result = await buildPlanFromParams(
        {
          lang: p.lang,
          level: p.level,
          module: p.module,
          topic: p.topic,
          vocab: p.vocab,
          teils: p.teils,
          poolThreshold: p.poolThreshold,
        },
        store,
      );
      if (result.error) {
        return jsonResponse(result.status || 400, noCache, {
          error: result.error,
          details: result.details,
        });
      }
      return jsonResponse(200, noCache, { plan: result.plan, meta: result.meta });
    }

    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = parseJsonBody(event);
      } catch (_) {
        return jsonResponse(400, cors, { error: 'invalid_json' });
      }
      const result = await buildPlanFromParams(body, store);
      if (result.error) {
        return jsonResponse(result.status || 400, cors, {
          error: result.error,
          details: result.details,
        });
      }
      return jsonResponse(200, cors, { plan: result.plan, meta: result.meta });
    }

    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[exam-plan] error:', err.message, err.stack);
    return jsonResponse(500, cors, { error: 'plan_failed', message: err.message });
  }
};

exports.buildPlanFromParams = buildPlanFromParams;
exports.resolveBlueprint = resolveBlueprint;
