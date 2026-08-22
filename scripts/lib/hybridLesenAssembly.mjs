/**
 * hybridLesenAssembly — ejecuta planHybridExam (pool + live + gate + ingest simulado).
 *
 * Simula el flujo web: plan → pool fetch → live gen → validatePart → exam merge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';
import { planHybridExam, DEFAULT_TEIL_LIST } from './planHybridExam.mjs';
import { validatePart, partToBatch } from './partGate.mjs';
import { isPartPoolReady } from '../audit-pass-2.mjs';
import { computeVocabFeedback } from './generationFeedback.mjs';
import { generateLesenPart, createLesenFactorySession } from './generateLesenPartFactory.mjs';
import { validateLesenDelivery } from './lesenDeliveryGate.mjs';

const require = createRequire(import.meta.url);

const { buscar } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const { addReusablePart, listPartsIndex } = require(
  path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'),
);
const PF = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const { rotateReusablePartsForModule } = require(
  path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'),
);

async function pickGatedSeedPart(records, { lang, level, teil, topicTag }) {
  let candidates = records.filter(
    (r) =>
      String(r.lang || '').toLowerCase() === lang &&
      String(r.level || '').toUpperCase() === level &&
      String(r.module || '') === 'lesen' &&
      Number(r.teil) === Number(teil) &&
      r.complete === true &&
      r.verified === true &&
      r.disabled !== true,
  );
  if (topicTag) {
    const topicHits = candidates.filter((r) => String(r.topicTag || '') === topicTag);
    if (topicHits.length) candidates = [...topicHits, ...candidates.filter((r) => !topicHits.includes(r))];
  }
  candidates.sort((a, b) => (a.servedCount || 0) - (b.servedCount || 0));
  for (const part of candidates) {
    const batch = partToBatch(part, { module: 'lesen', teil });
    const { gate } = await gateBatch(batch, { semantic: false, lang, level });
    if (gate.ok) return part;
  }
  return null;
}

function poolPartPlayable(lesenPart, teil, blueprint) {
  const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
  const exam = {
    lang: 'de',
    level: 'B1',
    goetheFormat: true,
    vocabPersonal: true,
    lesenParts: [lesenPart],
  };
  const v = new ExamValidator().validate(exam, { strict: false, blueprint, partialExam: true });
  const part = exam.lesenParts.find((p) => Number(p.teil) === Number(teil));
  if (!part) return { ok: false, reason: 'missing_part' };
  const bpPart = blueprint?.modules?.find((m) => m.id === 'lesen')?.parts?.find((x) => x.teil === teil);
  const n = (part.questions || part.items || []).length;
  const exp = bpPart?.itemsTotal || bpPart?.questionsTotal?.max || 6;
  if (teil === 3 && (!part.ads || part.ads.length < 10)) return { ok: false, reason: 't3_ads' };
  if (n < exp * 0.85) return { ok: false, reason: 'item_count', n, exp };
  return { ok: v.valid, errors: v.errors };
}

export function loadPoolRecords(lang = 'de', level = 'B1') {
  const dir = path.join(ROOT, 'library', 'reusable-seed');
  const records = [];
  for (const suffix of ['.json', '.bank.json']) {
    const file = path.join(dir, `${lang}_${level}${suffix}`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.records)) records.push(...data.records);
  }
  return records.filter(
    (r) =>
      String(r.lang || '').toLowerCase() === lang &&
      String(r.level || '').toUpperCase() === level &&
      String(r.module || '') === 'lesen' &&
      r.complete === true &&
      r.verified === true &&
      r.disabled !== true,
  );
}

export function countStockByTeil(records, module = 'lesen') {
  const counts = Object.fromEntries(DEFAULT_TEIL_LIST.map((t) => [t, 0]));
  for (const r of records) {
    if (String(r.module) !== module) continue;
    const t = Number(r.teil);
    if (counts[t] != null) counts[t] += 1;
  }
  return counts;
}

function makeMockStore(initialRecords = []) {
  const blobs = new Map();
  for (const rec of initialRecords) {
    const lang = String(rec.lang || 'de').toLowerCase();
    const level = String(rec.level || 'B1').toUpperCase();
    const mod = String(rec.module || 'lesen').toLowerCase();
    const id = rec.id || randomUUID();
    const pKey = `reusable_part:${lang}:${level}:${mod}:${id}`;
    const iKey = `reusable_part_idx:${lang}:${level}:${mod}:${id}`;
    const payload = { ...rec, id, servedCount: rec.servedCount || 0 };
    blobs.set(pKey, payload);
    blobs.set(iKey, {
      partKey: pKey,
      id,
      teil: payload.teil,
      complete: payload.complete,
      verified: payload.verified,
      createdAt: payload.createdAt || Date.now(),
      disabled: false,
      servedCount: payload.servedCount || 0,
    });
  }
  return {
    blobs,
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && blobs.has(key)) return { modified: false };
      blobs.set(key, value);
      return { modified: true };
    },
    async get(key, opts = {}) {
      const v = blobs.get(key) ?? null;
      return v;
    },
    async delete(key) {
      blobs.delete(key);
    },
    async list({ prefix }) {
      const keys = [...blobs.keys()].filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

async function countStockInStore(store, lang, level, module = 'lesen') {
  const rows = await listPartsIndex(store, lang, level, module);
  return countStockByTeil(
    rows.map((r) => ({ teil: r.teil, module })),
    module,
  );
}

function poolRecordToLesenPart(rec) {
  return PF.reusablePartToLesenPart(rec);
}

function batchToPoolRecord(batch, { lang, level, topicTag, id }) {
  const teil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? 1);
  return {
    id: id || randomUUID(),
    lang,
    level,
    module: 'lesen',
    teil,
    passage: batch.passages?.[0]
      ? {
          title: batch.passages[0].title || '',
          text: batch.passages[0].text || '',
        }
      : null,
    passages: batch.passages,
    questions: batch.questions || [],
    ads: batch.ads,
    complete: true,
    verified: true,
    topicTag: batch.topicTag || topicTag,
    contributor: 'hybrid-e2e',
    createdAt: Date.now(),
  };
}

async function gateBatch(batch, opts = {}) {
  const gate = await validatePart(batch, {
    module: 'lesen',
    teil: batch.teil,
    semantic: opts.semantic !== false,
    skipNormalize: false,
    lang: opts.lang || batch.lang || 'de',
    level: opts.level || batch.level || 'B1',
  });
  const poolReady = gate.ok
    ? (await isPartPoolReady(batch, { semantic: opts.semantic !== false })).ok
    : false;
  return { gate, poolReady };
}

/** Structural live: reuse a gated seed part (same gate path, no LLM). */
async function simulateLivePart(store, records, { teil, topicTag, words, lang, level, onIngest }) {
  let hits = buscar(records, {
    lang,
    level,
    module: 'lesen',
    teil,
    topicTag,
    words,
    literal: true,
  });
  if (!hits.length) {
    const any = await pickGatedSeedPart(records, { lang, level, teil, topicTag });
    if (any) hits = [{ part: any, id: any.id, score: 0, coveredWords: [], topicTag: any.topicTag }];
  }
  if (!hits.length) return { ok: false, reason: 'no_seed_for_simulation' };

  const source = hits[0].part;
  const batch = partToBatch(source, { module: 'lesen', teil });
  batch.topicTag = topicTag;
  const { gate, poolReady } = await gateBatch(batch, { semantic: false, lang, level });
  if (!gate.ok) return { ok: false, reason: 'gate_failed', gate };

  const poolRecord = batchToPoolRecord(batch, { lang, level, topicTag, id: `hybrid-sim-${teil}-${randomUUID().slice(0, 8)}` });
  await addReusablePart(store, poolRecord, { deferRotate: true });
  if (typeof onIngest === 'function') onIngest(teil);
  const lesenPart = poolRecordToLesenPart(poolRecord);
  lesenPart._source = 'live-simulated';
  lesenPart._gateOk = true;
  lesenPart._poolReady = poolReady;
  return {
    ok: true,
    teil,
    lesenPart,
    poolRecord,
    gate,
    vocabFeedback: computeVocabFeedback(batch, words, { topic: topicTag, prompted: words }),
  };
}

/** Live LLM via shared factory (Gemini + make-t3). */
async function generateLivePartGemini({ teil, topicTag, words, lang, level, fixRetries = 2, session }) {
  const t0 = Date.now();
  const shared = session || createLesenFactorySession({ lang, level, fixRetries });
  const result = await generateLesenPart({
    teil,
    topic: topicTag,
    words,
    lang,
    level,
    fixRetries,
    session: shared,
    writeFile: true,
  });
  return {
    ok: result.ok,
    batch: result.batch,
    file: result.file,
    ms: result.ms ?? Date.now() - t0,
    reason: result.reason,
    apiCalls: result.apiCalls,
    session: result.session || shared,
  };
}

async function generateLivePart(store, records, opts) {
  const { teil, topicTag, words, lang, level, live, onIngest } = opts;
  if (!live) return simulateLivePart(store, records, { teil, topicTag, words, lang, level, onIngest });

  const maxAttempts = 3;
  let lastFail = null;
  let totalMs = 0;
  let factorySession = createLesenFactorySession({ lang, level, fixRetries: 2 });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const gen = await generateLivePartGemini({
      teil,
      topicTag,
      words,
      lang,
      level,
      fixRetries: 2,
      session: factorySession,
    });
    if (gen.session) factorySession = gen.session;
    totalMs += gen.ms || 0;
    if (!gen.ok) {
      lastFail = { reason: gen.reason, ms: totalMs, fallback: true };
      continue;
    }
    const batch = { ...gen.batch, topicTag: gen.batch?.topicTag || topicTag, teil };
    const { gate, poolReady } = await validateLesenDelivery(batch, { teil, lang, level });
    if (!gate.ok) {
      lastFail = {
        reason: 'gate_failed',
        gate,
        ms: totalMs,
        file: gen.file,
        fallback: attempt === maxAttempts,
      };
      continue;
    }

    const gatedBatch = gate.batch || batch;
    const poolRecord = batchToPoolRecord(gatedBatch, { lang, level, topicTag });
    await addReusablePart(store, poolRecord, { deferRotate: true });
    if (typeof onIngest === 'function') onIngest(teil);
    const lesenPart = poolRecordToLesenPart(poolRecord);
    lesenPart._source = 'live';
    lesenPart._gateOk = true;
    lesenPart._poolReady = poolReady;
    lesenPart._generatedFile = gen.file;
    return {
      ok: true,
      teil,
      lesenPart,
      poolRecord,
      gate,
      ms: totalMs,
      vocabFeedback: computeVocabFeedback(gatedBatch, words, { topic: topicTag, prompted: words }),
    };
  }

  if (lastFail?.fallback) {
    return lastFail;
  }
  return lastFail || { ok: false, reason: 'live_exhausted', ms: totalMs, fallback: true };
}

/**
 * Full hybrid Lesen module assembly.
 */
export async function assembleHybridLesenModule({
  topicTag = 'Umwelt',
  words,
  lang = 'de',
  level = 'B1',
  teilList = DEFAULT_TEIL_LIST,
  live = false,
  blueprint = null,
} = {}) {
  const t0 = Date.now();
  const records = loadPoolRecords(lang, level);
  const bp =
    blueprint ||
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
    );

  const store = makeMockStore(records);
  await rotateReusablePartsForModule(store, lang, level, 'lesen');
  const stockBefore = await countStockInStore(store, lang, level);
  const ingestDelta = Object.fromEntries(teilList.map((t) => [t, 0]));

  const plan = planHybridExam({
    poolRecords: records,
    module: 'lesen',
    teilList,
    topicTag,
    words,
    lang,
    level,
  });

  const lesenParts = [];
  const trace = { pool: [], live: [], gates: [] };
  const timings = { poolMs: 0, liveMs: 0 };
  const onIngest = (teil) => {
    ingestDelta[teil] = (ingestDelta[teil] || 0) + 1;
  };

  const tp0 = Date.now();
  for (const p of plan.pool) {
    const lesenPart = poolRecordToLesenPart(p.part);
    const playable = poolPartPlayable(lesenPart, p.teil, bp);
    trace.gates.push({
      teil: p.teil,
      source: 'pool',
      ok: playable.ok,
      blocking: playable.ok ? [] : [{ id: playable.reason || 'playable', message: playable.errors?.[0] }],
    });
    lesenPart._source = 'pool';
    lesenPart._poolId = p.id;
    lesenPart._poolScore = p.score;
    lesenPart._coveredWords = p.coveredWords;
    lesenParts.push(lesenPart);
    trace.pool.push({
      teil: p.teil,
      id: p.id,
      topicTag: p.topicTag,
      score: p.score,
      coveredWords: p.coveredWords,
    });
  }
  timings.poolMs = Date.now() - tp0;

  const liveConcurrency = live ? 1 : 3;
  const liveJobs = plan.live.map((teil) => async () => {
    const tl0 = Date.now();
    let result = await generateLivePart(store, records, {
      teil,
      topicTag,
      words: plan.vocab.remaining,
      lang,
      level,
      live,
      onIngest,
    });
    if (!result.ok && result.fallback && live) {
      result = await simulateLivePart(store, records, {
        teil,
        topicTag,
        words: plan.vocab.remaining,
        lang,
        level,
        onIngest,
      });
      result._fallbackFromLive = true;
    }
    const elapsed = Date.now() - tl0;
    return { teil, result, elapsed };
  });

  const liveResults = [];
  for (let i = 0; i < liveJobs.length; i += liveConcurrency) {
    const chunk = liveJobs.slice(i, i + liveConcurrency);
    const batch = await Promise.all(chunk.map((fn) => fn()));
    liveResults.push(...batch);
  }

  for (const { teil, result, elapsed } of liveResults) {
    timings.liveMs += elapsed;
    trace.live.push({
      teil,
      ok: result.ok,
      reason: result.reason,
      ms: result.ms ?? elapsed,
      fallback: result._fallbackFromLive,
      vocabUsed: result.vocabFeedback?.used,
    });
    if (result.gate) {
      trace.gates.push({
        teil,
        source: result._fallbackFromLive ? 'live-fallback-sim' : (live ? 'live' : 'live-simulated'),
        ok: result.gate.ok,
        blocking: result.gate.blocking?.slice(0, 3),
      });
    }
    if (result.ok && result.lesenPart) lesenParts.push(result.lesenPart);
  }

  lesenParts.sort((a, b) => Number(a.teil) - Number(b.teil));

  await rotateReusablePartsForModule(store, lang, level, 'lesen');
  const stockAfter = await countStockInStore(store, lang, level);
  const stockDelta = {};
  for (const t of teilList) {
    stockDelta[t] = (stockAfter[t] || 0) - (stockBefore[t] || 0);
  }

  const exam = {
    lang,
    level,
    goetheFormat: true,
    vocabPersonal: true,
    topic: topicTag,
    topicTag,
    lesenParts,
    _hybridPlan: plan,
    _hybridTrace: trace,
  };

  return {
    plan,
    exam,
    lesenParts,
    trace,
    timings: { ...timings, totalMs: Date.now() - t0 },
    stockBefore,
    stockAfter,
    stockDelta,
    ingestDelta,
    mode: live ? 'live' : 'structural',
  };
}
