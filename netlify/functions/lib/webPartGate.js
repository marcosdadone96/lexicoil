'use strict';

/**
 * Web personal-exam chunk gate — validatePart wrapper (fail-closed).
 *
 * Lesen: Option A — examPart→batch → coerceGeneratedLesenPart → validatePart(skipNormalize:true)
 * Other modules: normalizeBatch via validatePart(skipNormalize:false)
 *
 * Returns normalized exam chunk JSON (never rawPart) on success.
 */
const { listPartsIndex } = require('./reusablePartsStore.js');
const {
  validatePart,
  buildDedupCorpusFromBatches,
  coerceGeneratedLesenPart,
} = require('./partGateRunner.js');

const EXAM_PART_KEYS = [
  'lesenParts', 'readingParts',
  'horenParts', 'listeningParts',
  'schreibenParts', 'writingParts',
  'sprechenParts', 'speakingParts',
];

const MODULE_FROM_KEY = {
  lesenParts: 'lesen',
  readingParts: 'lesen',
  horenParts: 'horen',
  listeningParts: 'horen',
  schreibenParts: 'schreiben',
  writingParts: 'schreiben',
  sprechenParts: 'sprechen',
  speakingParts: 'sprechen',
};

function inferChunkMeta(parsed, chunkTeil) {
  for (const key of EXAM_PART_KEYS) {
    const arr = parsed?.[key];
    if (!Array.isArray(arr) || !arr.length) continue;
    const module = MODULE_FROM_KEY[key];
    let part = arr[0];
    if (Number.isFinite(chunkTeil)) {
      const match = arr.find((p) => Number(p?.teil) === chunkTeil);
      if (match) part = match;
    }
    return { expectKey: key, module, part, teil: Number(part?.teil ?? chunkTeil ?? 1) };
  }
  return null;
}

function examPartToBatch(part, { module, teil, lang, level }) {
  const t = Number(teil ?? part.teil ?? 1);
  const mod = String(module || part.module || 'lesen').toLowerCase();

  if (mod === 'lesen' && Array.isArray(part.passages) && part.passages.length >= 2) {
    return {
      passages: part.passages.map((p) => ({
        id: p.passageId || p.id || `${mod}-t${t}-p`,
        title: p.textTitle || p.title || '',
        text: p.text || '',
        module: mod,
        teil: t,
        lang: p.lang || lang,
        level: p.level || level,
      })),
      questions: [...(part.questions || []), ...(part.items || [])],
      ads: part.ads,
      module: mod,
      teil: t,
    };
  }

  const text = part.text || part.transcript || '';
  let passages = Array.isArray(part.passages) ? part.passages.map((p) => ({
    id: p.passageId || p.id || `${mod}-t${t}-p`,
    title: p.textTitle || p.title || '',
    text: p.text || '',
    transcript: p.transcript || '',
    module: mod,
    teil: t,
    lang: p.lang || lang,
    level: p.level || level,
  })) : [];

  if (!passages.length && text) {
    passages = [{
      id: part.passageId || part.id || `${mod}-t${t}-p1`,
      title: part.textTitle || part.title || part.context || '',
      text,
      module: mod,
      teil: t,
      lang: part.lang || lang,
      level: part.level || level,
    }];
  }

  const batch = {
    passages,
    questions: [...(part.questions || []), ...(part.items || [])],
    module: mod,
    teil: t,
  };
  if (part.ads) batch.ads = part.ads;
  if (Array.isArray(part.segments)) batch.segments = part.segments;
  return batch;
}

function batchToExamPart(batch, originalPart, { module, teil }) {
  const t = Number(teil ?? originalPart.teil ?? batch.teil ?? 1);
  const mod = String(module || batch.module || 'lesen').toLowerCase();
  const part = { ...originalPart, teil: t, module: mod };

  if (mod === 'lesen') {
    if (Array.isArray(originalPart.passages) && originalPart.passages.length >= 2) {
      part.passages = batch.passages;
      part.questions = batch.questions;
    } else if (batch.passages?.[0]) {
      part.text = batch.passages[0].text;
      part.textTitle = batch.passages[0].title || part.textTitle;
      part.passageId = batch.passages[0].id;
      part.questions = batch.questions;
    } else {
      part.questions = batch.questions;
    }
    if (batch.ads) part.ads = batch.ads;
  } else if (mod === 'horen') {
    part.passages = batch.passages;
    part.segments = batch.segments;
    part.questions = batch.questions;
    const tx = batch.passages?.map((p) => p.transcript || p.text).filter(Boolean).join('\n\n');
    if (tx) part.transcript = tx;
  } else {
    part.questions = batch.questions;
    if (batch.questions?.[0]?.question && !part.task) {
      part.task = batch.questions[0].question;
    }
  }
  return part;
}

function wrapNormalizedChunk(parsed, expectKey, normalizedPart) {
  const out = { ...parsed };
  const arr = [...(parsed[expectKey] || [])];
  const teil = Number(normalizedPart.teil);
  const idx = arr.findIndex((p) => Number(p?.teil) === teil);
  if (idx >= 0) arr[idx] = normalizedPart;
  else arr.push(normalizedPart);
  out[expectKey] = arr;
  return out;
}

async function loadDedupCorpusFromStore(store, { lang, level, module, excludePassageIds = [] }) {
  if (!store) return [];
  const exclude = new Set(excludePassageIds.filter(Boolean));
  const entries = await listPartsIndex(store, lang, level, module).catch(() => []);
  const batches = [];
  const sample = entries.slice(0, 80);
  for (const row of sample) {
    try {
      const payload = await store.get(row.partKey, { type: 'json' });
      if (!payload) continue;
      const batch = examPartToBatch(payload, {
        module,
        teil: payload.teil ?? row.teil,
        lang,
        level,
      });
      batches.push(batch);
    } catch {
      /* skip corrupt */
    }
  }
  const corpus = await buildDedupCorpusFromBatches(batches);
  return corpus.filter((e) => !exclude.has(e.id));
}

/**
 * Gate one personal-exam chunk. Fail-closed on gate errors.
 *
 * @returns {Promise<{ ok: boolean, chunk?: object, batch?: object, blocking?: object[], message?: string, gateId?: string }>}
 */
async function gatePersonalExamChunk(store, {
  parsed,
  lang = 'de',
  level = 'B1',
  chunkTeil = null,
  semantic = true,
  dedupThreshold = 0.55,
}) {
  const meta = inferChunkMeta(parsed, chunkTeil);
  if (!meta) {
    return {
      ok: false,
      gateId: 'PART-GATE',
      message: 'Chunk JSON sin lesenParts/horenParts/… reconocible',
      blocking: [{ id: 'PART-GATE', severity: 'CRITICAL', message: 'missing exam part array' }],
    };
  }

  const { expectKey, module, part, teil } = meta;
  const langNorm = String(parsed.lang || lang || 'de').toLowerCase();
  const levelNorm = String(parsed.level || level || 'B1').toUpperCase();

  let batchIn = examPartToBatch(part, { module, teil, lang: langNorm, level: levelNorm });
  let skipNormalize = false;

  if (module === 'lesen') {
    batchIn = await coerceGeneratedLesenPart(batchIn, {
      module: 'lesen',
      teil,
      lang: langNorm,
      level: levelNorm,
    });
    skipNormalize = true;
  }

  const excludeIds = (batchIn.passages || []).map((p) => p.id).filter(Boolean);
  let dedupCorpus = null;
  try {
    dedupCorpus = await loadDedupCorpusFromStore(store, {
      lang: langNorm,
      level: levelNorm,
      module,
      excludePassageIds: excludeIds,
    });
  } catch (err) {
    console.warn('[webPartGate] dedup corpus load failed (dedup skipped):', err.message);
    dedupCorpus = [];
  }

  const gate = await validatePart(batchIn, {
    semantic,
    skipNormalize,
    skipDedup: !dedupCorpus?.length,
    dedupCorpus: dedupCorpus?.length ? dedupCorpus : null,
    dedupThreshold,
    module,
    teil,
    lang: langNorm,
    level: levelNorm,
  });

  if (!gate.ok) {
    const first = gate.blocking?.[0];
    return {
      ok: false,
      gateId: first?.id || 'PART-GATE',
      message: first?.message || 'Part gate rejected',
      blocking: gate.blocking || [],
      batch: gate.batch,
    };
  }

  const normalizedPart = batchToExamPart(gate.batch, part, { module, teil });
  const chunk = wrapNormalizedChunk(parsed, expectKey, normalizedPart);

  return {
    ok: true,
    chunk,
    batch: gate.batch,
    advisory: gate.advisory || [],
  };
}

module.exports = {
  gatePersonalExamChunk,
  examPartToBatch,
  batchToExamPart,
  inferChunkMeta,
  loadDedupCorpusFromStore,
  EXAM_PART_KEYS,
};
