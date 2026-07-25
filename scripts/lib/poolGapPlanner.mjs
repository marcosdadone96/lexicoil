/**
 * poolGapPlanner.mjs — elige tema + vocab según escasez real en reusable-seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { loadWeakLemmas } from './lesenTemplatePrompt.mjs';

const require = createRequire(import.meta.url);
const { B1_TOPICS, normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const SEED_FILES = [
  'library/reusable-seed/de_B1.json',
  'library/reusable-seed/de_B1.bank.json',
];

const MODULE_TEILS = {
  lesen: [1, 2, 3, 4, 5],
  horen: [1, 2, 3, 4],
  schreiben: [1, 2, 3],
  sprechen: [1, 2, 3],
};

export function loadPoolRecords(lang = 'de', level = 'B1') {
  const records = [];
  for (const rel of SEED_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const rows = Array.isArray(data.records) ? data.records : [];
    for (const r of rows) {
      if (String(r.lang || lang).toLowerCase() !== lang) continue;
      if (String(r.level || level).toUpperCase() !== level) continue;
      if (r.disabled) continue;
      if (!r.complete || !r.verified) continue;
      records.push(r);
    }
  }
  return records;
}

export function moduleTeils(module, blueprintTeils) {
  const m = String(module).toLowerCase();
  if (blueprintTeils?.length) return blueprintTeils;
  return MODULE_TEILS[m] || [];
}

/** Count verified parts per canonical B1 topic for one module+teil cell. */
export function countTopicStock(records, module, teil) {
  const mod = String(module).toLowerCase();
  const tN = Number(teil);
  const counts = Object.fromEntries(B1_TOPICS.map((t) => [t, 0]));
  let untagged = 0;

  for (const r of records) {
    if (String(r.module).toLowerCase() !== mod) continue;
    if (Number(r.teil) !== tN) continue;
    const topic = normalizeB1Topic(r.topicTag);
    if (topic && counts[topic] !== undefined) counts[topic]++;
    else untagged++;
  }

  return { counts, untagged, total: Object.values(counts).reduce((a, b) => a + b, 0) + untagged };
}

/** Rank topics for a cell: highest deficit first, then lowest count. */
export function rankTopicGaps(records, module, teil, targetPerCell = 3) {
  const { counts } = countTopicStock(records, module, teil);
  return B1_TOPICS.map((topic) => {
    const count = counts[topic] || 0;
    const deficit = Math.max(0, targetPerCell - count);
    return { topic, count, deficit };
  }).sort((a, b) => b.deficit - a.deficit || a.count - b.count || a.topic.localeCompare(b.topic));
}

export function pickScarcestTopic(records, module, teil, opts = {}) {
  const {
    targetPerCell = 3,
    excludeTopics = [],
    excludeSet = null,
  } = opts;
  const exclude = excludeSet || new Set((excludeTopics || []).map((t) => normalizeB1Topic(t)).filter(Boolean));
  const ranked = rankTopicGaps(records, module, teil, targetPerCell);
  const candidates = ranked.filter((r) => !exclude.has(r.topic));
  const pool = candidates.length ? candidates : ranked;
  const bestDeficit = pool[0]?.deficit ?? 0;
  const bestCount = pool.filter((r) => r.deficit === bestDeficit).reduce(
    (min, r) => Math.min(min, r.count),
    pool[0]?.count ?? 0,
  );
  const ties = pool.filter((r) => r.deficit === bestDeficit && r.count === bestCount);
  const pick = ties[Math.floor(Math.random() * ties.length)] || pool[0];
  return pick?.topic || B1_TOPICS[Math.floor(Math.random() * B1_TOPICS.length)];
}

export function loadWeakDetail(lang, level) {
  const file = path.join(ROOT, 'data', 'coverage', `weak-${lang}_${level}.json`);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(data.detail)) return data.detail;
  return (data.weakLemmas || []).map((lemma) => ({ lemma, parts: 0 }));
}

/** Rotate through weakest lemmas (fewest pool hits first). */
export function pickRotatingWords(lang, level, opts = {}) {
  const count = Math.max(1, Number(opts.count) || 10);
  let cursor = Math.max(0, Number(opts.cursor) || 0);
  const detail = loadWeakDetail(lang, level);
  if (!detail.length) {
    const weak = loadWeakLemmas(lang, level);
    if (!weak?.length) {
      throw new Error(
        `Sin lemas flojos para ${lang}/${level}. Ejecuta: node scripts/vocab-coverage-report.mjs --lang ${lang} --level ${level}`,
      );
    }
    const ordered = [...weak];
    const words = [];
    for (let i = 0; i < count; i++) words.push(ordered[(cursor + i) % ordered.length]);
    return { words, nextCursor: cursor + count };
  }

  const ordered = [
    ...detail.filter((d) => !d.parts).sort((a, b) => String(a.lemma).localeCompare(String(b.lemma))),
    ...detail.filter((d) => d.parts > 0).sort((a, b) => a.parts - b.parts || String(a.lemma).localeCompare(String(b.lemma))),
  ];
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push(String(ordered[(cursor + i) % ordered.length].lemma).toLowerCase());
  }
  return { words, nextCursor: cursor + count };
}

export function buildCellGapReport(lang, level, module, teil, targetPerCell = 3) {
  const records = loadPoolRecords(lang, level);
  const ranked = rankTopicGaps(records, module, teil, targetPerCell);
  const { untagged, total } = countTopicStock(records, module, teil);
  const missing = ranked.filter((r) => r.deficit > 0);
  return { module, teil, targetPerCell, ranked, untagged, total, missing };
}

export function checkpointKey(lang, level, module, teil) {
  const t = teil != null ? `:T${teil}` : '';
  return `${lang}_${level}:${String(module).toLowerCase()}${t}`;
}

export const POOL_FILL_CHECKPOINT = path.join(ROOT, 'batches', '.pool-fill-checkpoint.json');

export function loadPoolFillCheckpoint(key) {
  if (!fs.existsSync(POOL_FILL_CHECKPOINT)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(POOL_FILL_CHECKPOINT, 'utf8'));
    return data?.key === key ? data : null;
  } catch {
    return null;
  }
}

export function savePoolFillCheckpoint(data) {
  fs.mkdirSync(path.dirname(POOL_FILL_CHECKPOINT), { recursive: true });
  fs.writeFileSync(POOL_FILL_CHECKPOINT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function clearPoolFillCheckpoint() {
  try {
    if (fs.existsSync(POOL_FILL_CHECKPOINT)) fs.unlinkSync(POOL_FILL_CHECKPOINT);
  } catch {
    /* ignore */
  }
}
