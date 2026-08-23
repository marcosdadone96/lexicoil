'use strict';

/**
 * Textos pick handler — shared between exam-part GET and tests.
 */
const { resolveFromRoot } = require('./projectRoot.js');
const { normalizeB1Topic } = require(resolveFromRoot('js', 'data', 'b1Topics.js'));
const { normalizeA2Topic } = require(resolveFromRoot('js', 'data', 'a2Topics.js'));
const { pickReusablePartByTopic } = require('./reusablePartsStore.js');
const {
  loadOfficialReservedIndex,
  reservedPartIdSet,
} = require('./officialReservedIndex.js');
const { toTextosReadingPayload } = require('./textosReadingPayload.js');

const TEXTOS_V1_LEVELS = new Set(['A2', 'B1']);

function normalizeTextosTopic(topicTag, level) {
  const lv = String(level || '').toUpperCase();
  if (lv === 'A2') return normalizeA2Topic(topicTag);
  return normalizeB1Topic(topicTag);
}

function requireOfficialIndex(lang, level) {
  return loadOfficialReservedIndex({ lang, level });
}

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
async function pickTextosReading(store, {
  lang,
  level,
  module,
  topicTag,
  teil = null,
  excludeIds = [],
} = {}) {
  const normLang = String(lang || '').toLowerCase();
  const normLevel = String(level || '').toUpperCase();
  const normModule = String(module || '').toLowerCase();

  if (normModule !== 'lesen') {
    return { status: 400, body: { error: 'textos_lesen_only', ok: false } };
  }
  if (!TEXTOS_V1_LEVELS.has(normLevel)) {
    return { status: 400, body: { error: 'textos_level_not_supported', ok: false, level: normLevel } };
  }

  const wantTopic = normalizeTextosTopic(topicTag, normLevel);
  if (!wantTopic) {
    return { status: 400, body: { error: 'topic_required', ok: false } };
  }

  const index = requireOfficialIndex(normLang, normLevel);
  if (!index) {
    return { status: 503, body: { error: 'official_index_stale', ok: false } };
  }

  const result = await pickReusablePartByTopic(store, normLang, normLevel, normModule, {
    excludeIds,
    teil,
    topicTag: wantTopic,
    assembleMode: 'practice',
    excludeOfficialReserved: true,
  });

  if (!result?.part) {
    return { status: 404, body: { error: 'textos_no_match', ok: false, topicTag: wantTopic } };
  }

  const reserved = reservedPartIdSet(index);
  if (reserved.has(result.id)) {
    console.error('[textos] reserved part leaked through pick:', result.id);
    return { status: 404, body: { error: 'textos_no_match', ok: false, topicTag: wantTopic } };
  }

  const reading = toTextosReadingPayload(result.part);
  if (!reading.passageText || reading.wordCount < 20) {
    return { status: 404, body: { error: 'textos_no_match', ok: false, topicTag: wantTopic } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      purpose: 'textos',
      id: result.id,
      module: normModule,
      teil: Number(result.part.teil) || teil,
      topicTag: result.topicTag || wantTopic,
      topicRelaxed: false,
      reading,
      meta: {
        officialReserved: false,
        servedCount: result.part.servedCount || 0,
        source: result.source || null,
      },
    },
  };
}

module.exports = {
  TEXTOS_V1_LEVELS,
  normalizeTextosTopic,
  pickTextosReading,
  requireOfficialIndex,
};
