/**
 * coverageRegistry.mjs — Registro de cobertura B1 en el pool (medición + rotación dirigida).
 *
 * Fuente de lemas: library/vocab/{lang}/{level}.json (whitelist cerrada).
 * Medición: vocabIndex/vocab[] de library/reusable-seed (misma lógica que pickReusablePartByVocab).
 * Salida: data/coverage/registry-{lang}_{level}.json + weak-{lang}_{level}.json (compat).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ROOT } from './loadEnv.mjs';
import { loadVocabBankLemmaSet, foldLemma } from './vocabBank.mjs';
import { loadPoolRecords } from './poolGapPlanner.mjs';
import { filterPromptTargetWords, isBlacklistedLemma } from './lexicalCheck.mjs';
import { enrichBatchMetadata } from './enrichBatchMetadata.mjs';

const require = createRequire(import.meta.url);
const { getPartVocabIndex, vocabEntryKey } = require(path.join(
  ROOT,
  'netlify/functions/lib/partIndex.js',
));
const { TOPIC_KEYWORDS } = require(path.join(ROOT, 'js/engine/partTopicDetect.js'));
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WORD_COUNT = 6;
const MIN_WORD_COUNT = 5;
const MAX_WORD_COUNT = 8;

export function registryPath(lang = 'de', level = 'B1') {
  return path.join(ROOT, 'data', 'coverage', `registry-${lang}_${level}.json`);
}

export function weakPath(lang = 'de', level = 'B1') {
  return path.join(ROOT, 'data', 'coverage', `weak-${lang}_${level}.json`);
}

function cellKey(module, teil) {
  return `${String(module).toLowerCase()}:T${teil}`;
}

/** Strict topic lemmas: TOPIC_KEYWORDS ∩ bank only. */
export function topicKeywordPool(topicTag, lang = 'de', level = 'B1') {
  const bank = loadVocabBankLemmaSet(lang, level);
  const topic = normalizeB1Topic(topicTag);
  const keywords = topic && TOPIC_KEYWORDS[topic] ? TOPIC_KEYWORDS[topic] : [];
  const foldedKw = keywords.map((w) => foldLemma(w)).filter(Boolean);
  return [...new Set(
    foldedKw.filter((w) => bank.has(w) && !isBlacklistedLemma(w) && w.length >= 4),
  )];
}

/** Per-topic strict pools (TOPIC_KEYWORDS ∩ bank). */
export function allTopicStrictLemmaSets(lang = 'de', level = 'B1') {
  const map = {};
  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    map[topic] = new Set(topicKeywordPool(topic, lang, level));
  }
  return map;
}

/** Lemmas in another topic's strict pool — excluded from fill for the requested topic. */
export function crossTopicStrictLemmas(excludeTopic, lang = 'de', level = 'B1') {
  const topic = normalizeB1Topic(excludeTopic);
  const byTopic = allTopicStrictLemmaSets(lang, level);
  const out = new Set();
  for (const [t, lemmas] of Object.entries(byTopic)) {
    if (t === topic) continue;
    for (const l of lemmas) out.add(l);
  }
  return out;
}

/** Debate-generic B1 fill — never includes another topic's strict lemmas. */
const NEUTRAL_DEBATE_FILL = [
  'meinung', 'problem', 'vorteil', 'diskussion', 'diskutieren', 'entscheidung', 'plan', 'regel',
  'erfahrung', 'positiv', 'speziell', 'bieten', 'bedeuten', 'achten', 'schritt', 'betreffen',
  'erwachsen', 'aktuell', 'angenehm', 'beachten', 'situation', 'vorschlag', 'argument',
  'bewohner', 'termin', 'projekt', 'programm', 'anmeldung', 'gebühr', 'ruhe', 'raum',
  'bericht', 'gemeinsam', 'nutzen', 'direkt', 'täglich', 'zukunft', 'aufgabe', 'bedeutung',
];

/** Topic strict pool + neutral debate fill (no cross-topic strict contamination). */
export function topicLemmaPool(topicTag, lang = 'de', level = 'B1') {
  const bank = loadVocabBankLemmaSet(lang, level);
  const strict = topicKeywordPool(topicTag, lang, level);
  const strictSet = new Set(strict);
  const cross = crossTopicStrictLemmas(topicTag, lang, level);
  const neutral = NEUTRAL_DEBATE_FILL
    .map(foldLemma)
    .filter(
      (w) =>
        bank.has(w) &&
        !isBlacklistedLemma(w) &&
        w.length >= 4 &&
        !cross.has(w) &&
        !strictSet.has(w),
    );
  const merged = [...new Set([...strict, ...neutral])];
  return merged.filter((w) => bank.has(w) && !isBlacklistedLemma(w) && w.length >= 4);
}

function lemmasFromRecord(rec) {
  const keys = new Set();
  const part = rec.part || rec;
  for (const entry of getPartVocabIndex(part)) {
    const key = vocabEntryKey(entry);
    if (key) keys.add(String(key).toLowerCase());
  }
  if (Array.isArray(rec.vocab)) {
    for (const v of rec.vocab) {
      const lw = foldLemma(typeof v === 'string' ? v : v?.lemma || v?.word);
      if (lw) keys.add(lw);
    }
  }
  return [...keys];
}

/**
 * Escanea el pool y construye el registro completo.
 * @returns {object} registry payload
 */
export function buildCoverageRegistry(lang = 'de', level = 'B1', opts = {}) {
  const threshold = Math.max(1, Number(opts.threshold) || DEFAULT_THRESHOLD);
  const bank = loadVocabBankLemmaSet(lang, level);
  const lemmas = [...bank].sort();
  const records = loadPoolRecords(lang, level);

  const globalCounts = Object.fromEntries(lemmas.map((l) => [l, 0]));
  const cellCounts = {};

  for (const rec of records) {
    const mod = String(rec.module || '').toLowerCase();
    const teil = Number(rec.teil);
    if (!mod || !Number.isFinite(teil)) continue;
    const ck = cellKey(mod, teil);
    if (!cellCounts[ck]) cellCounts[ck] = Object.fromEntries(lemmas.map((l) => [l, 0]));

    const seen = new Set();
    for (const lw of lemmasFromRecord(rec)) {
      if (!bank.has(lw) || seen.has(lw)) continue;
      seen.add(lw);
      globalCounts[lw] = (globalCounts[lw] || 0) + 1;
      cellCounts[ck][lw] = (cellCounts[ck][lw] || 0) + 1;
    }
  }

  const weakDetail = lemmas
    .map((lemma) => ({ lemma, parts: globalCounts[lemma] || 0 }))
    .filter((w) => w.parts < threshold && !isBlacklistedLemma(w.lemma))
    .sort((a, b) => a.parts - b.parts || a.lemma.localeCompare(b.lemma));

  let cov0 = 0;
  let cov12 = 0;
  let covT = 0;
  for (const l of lemmas) {
    const n = globalCounts[l] || 0;
    if (n === 0) cov0++;
    else if (n < threshold) cov12++;
    else covT++;
  }

  return {
    lang,
    level,
    threshold,
    generatedAt: new Date().toISOString(),
    bankLemmaCount: lemmas.length,
    poolPartsMeasured: records.length,
    partsByCell: records.reduce((acc, r) => {
      const k = cellKey(r.module, r.teil);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    globalCounts,
    cellCounts,
    weakDetail,
    weakLemmas: weakDetail.map((w) => w.lemma),
    metrics: { cov0, cov12, covT, weakCount: weakDetail.length },
  };
}

export function writeCoverageRegistry(registry) {
  const dir = path.dirname(registryPath(registry.lang, registry.level));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    registryPath(registry.lang, registry.level),
    `${JSON.stringify(registry, null, 2)}\n`,
    'utf8',
  );
  const weak = {
    lang: registry.lang,
    level: registry.level,
    threshold: registry.threshold,
    generatedAt: registry.generatedAt,
    totalLemmas: registry.bankLemmaCount,
    weakCount: registry.weakDetail.length,
    weakLemmas: registry.weakLemmas,
    detail: registry.weakDetail,
  };
  fs.writeFileSync(weakPath(registry.lang, registry.level), `${JSON.stringify(weak, null, 2)}\n`, 'utf8');
}

export function loadCoverageRegistry(lang = 'de', level = 'B1') {
  const file = registryPath(lang, level);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Full rebuild (pool scan). Also refreshes weak-de_B1.json for legacy scripts. */
export function refreshCoverageRegistry(lang = 'de', level = 'B1', opts = {}) {
  const registry = buildCoverageRegistry(lang, level, opts);
  writeCoverageRegistry(registry);
  return registry;
}

/** Shell wrapper — same as pool-fill / vocab-coverage-report. */
export function refreshCoverageViaReport(lang = 'de', level = 'B1') {
  const res = spawnSync(
    process.execPath,
    ['scripts/vocab-coverage-report.mjs', '--lang', lang, '--level', level],
    { cwd: ROOT, stdio: 'inherit' },
  );
  return refreshCoverageRegistry(lang, level);
}

/**
 * Lemmas realmente presentes en un batch (vocabularyTags tras enrichBatchMetadata).
 */
export function extractActualVocabLemmas(batch) {
  const { batch: enriched } = enrichBatchMetadata(batch, {
    vocab: true,
    grammar: false,
    topic: false,
    forceVocab: true,
  });
  const lemmas = new Set();
  for (const q of enriched.questions || []) {
    for (const tag of q.vocabularyTags || []) {
      const lw = foldLemma(tag);
      if (lw) lemmas.add(lw);
    }
  }
  for (const p of enriched.passages || []) {
    if (Array.isArray(p.vocabularyTags)) {
      for (const tag of p.vocabularyTags) {
        const lw = foldLemma(tag);
        if (lw) lemmas.add(lw);
      }
    }
  }
  return [...lemmas];
}

/**
 * Tras publicar: re-escanea pool (fuente de verdad). Log de lo pedido vs lo real.
 */
export function recordGenerationOutcome(ctx) {
  const { lang, level, module, teil, requestedWords, batch, published } = ctx;
  const actual = batch ? extractActualVocabLemmas(batch) : [];
  const registry = refreshCoverageRegistry(lang, level);
  const logDir = path.join(ROOT, 'batches', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const entry = {
    at: new Date().toISOString(),
    cell: cellKey(module, teil),
    topic: ctx.topic || null,
    requested: requestedWords || [],
    actual,
    published: !!published,
    weakRemaining: registry.metrics?.weakCount,
  };
  const logFile = path.join(logDir, 'coverage-generation.jsonl');
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
  console.log(
    `  📊 Cobertura actualizada · lemas reales en batch: ${actual.length}` +
      (requestedWords?.length ? ` (sugeridos: ${requestedWords.length})` : ''),
  );
  return { registry, actual };
}

/**
 * Elige 5–8 lemas menos cubiertos, priorizando alineación temática.
 */
export function pickTopicAlignedWeakWords(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const topic = normalizeB1Topic(opts.topic);
  const count = Math.min(
    MAX_WORD_COUNT,
    Math.max(MIN_WORD_COUNT, Number(opts.count) || DEFAULT_WORD_COUNT),
  );
  const cursor = Math.max(0, Number(opts.cursor) || 0);

  let registry = loadCoverageRegistry(lang, level);
  if (!registry?.weakDetail?.length) {
    registry = refreshCoverageRegistry(lang, level);
  }

  const topicPool = new Set(topicKeywordPool(topic, lang, level));
  const topicFillPool = new Set(topicLemmaPool(topic, lang, level));
  const crossExclude = crossTopicStrictLemmas(topic, lang, level);
  const weakOrdered = registry.weakDetail || [];

  const topicFirst = weakOrdered.filter((w) => topicPool.has(w.lemma));

  const topicSafeFill = [...topicFillPool]
    .map((lemma) => ({
      lemma,
      parts: registry.globalCounts?.[lemma] ?? 0,
    }))
    .filter((w) => !isBlacklistedLemma(w.lemma))
    .sort((a, b) => a.parts - b.parts || a.lemma.localeCompare(b.lemma));

  const ordered = [];
  const used = new Set();
  for (const w of topicFirst) {
    if (!used.has(w.lemma)) {
      ordered.push(w);
      used.add(w.lemma);
    }
  }
  for (const w of topicSafeFill) {
    if (!used.has(w.lemma)) {
      ordered.push(w);
      used.add(w.lemma);
    }
  }

  if (!ordered.length) {
    throw new Error(
      `Sin lemas alineados al tema «${topic}». Revisa TOPIC_KEYWORDS o ejecuta vocab-coverage-report.`,
    );
  }

  const raw = [];
  const picked = new Set();
  let idx = cursor;
  const maxSteps = Math.max(ordered.length * 3, count * 4);
  for (let step = 0; raw.length < count && step < maxSteps; step++) {
    const pick = ordered[idx % ordered.length];
    idx++;
    const lemma = String(pick.lemma).toLowerCase();
    if (picked.has(lemma)) continue;
    picked.add(lemma);
    raw.push(lemma);
  }

  if (raw.length < MIN_WORD_COUNT) {
    for (const w of weakOrdered) {
      if (raw.length >= count) break;
      const lemma = String(w.lemma).toLowerCase();
      if (picked.has(lemma) || crossExclude.has(lemma)) continue;
      picked.add(lemma);
      raw.push(lemma);
    }
  }

  const words = filterPromptTargetWords(raw, { lang, level, requireBank: true, log: false });
  if (words.length < MIN_WORD_COUNT) {
    throw new Error(
      `Tras whitelist quedan ${words.length} palabras para tema «${topic}» (<${MIN_WORD_COUNT}).`,
    );
  }

  return {
    words: words.slice(0, count),
    nextCursor: cursor + count,
    topic,
    topicPoolSize: topicPool.size,
    topicAlignedCount: topicFirst.length,
  };
}

export function printCoverageSummary(lang = 'de', level = 'B1') {
  const reg = loadCoverageRegistry(lang, level) || refreshCoverageRegistry(lang, level);
  const m = reg.metrics || {};
  console.log(
    `\n📈 Registro cobertura ${lang}/${level}: ${reg.poolPartsMeasured} partes · ` +
      `${reg.bankLemmaCount} lemas banco · flojos: ${m.weakCount ?? reg.weakDetail?.length ?? 0}`,
  );
  console.log(
    `   Sin cubrir: ${m.cov0 ?? '?'} · flojos: ${m.cov12 ?? '?'} · bien (≥${reg.threshold}): ${m.covT ?? '?'}`,
  );
}
