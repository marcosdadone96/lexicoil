/**
 * Published official exams — immutable snapshots + content hashes per part.
 *
 * Blob keys (Netlify Blobs store `lexicoil-data`):
 *   published_catalog:{lang}:{level}     — index of live exams
 *   published_exam:{lang}:{level}:{examId} — full published exam document
 *
 * Local fallback (no blob creds): library/published-exams/{lang}/{level}/{examId}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalPartHash, normalizePartSnapshot, shortHash } from './partContentHash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { getReusablePart } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));

export const PUBLISHED_EXAM_SCHEMA = 'published-exam/v1';

export const OFFICIAL_CELLS = [
  'lesen_1', 'lesen_2', 'lesen_3', 'lesen_4', 'lesen_5',
  'horen_1', 'horen_2', 'horen_3', 'horen_4',
  'schreiben_1', 'schreiben_2', 'schreiben_3',
];

export function publishedCatalogBlobKey(lang, level) {
  return `published_catalog:${String(lang).toLowerCase()}:${String(level).toUpperCase()}`;
}

export function publishedExamBlobKey(lang, level, examId) {
  return `published_exam:${String(lang).toLowerCase()}:${String(level).toUpperCase()}:${examId}`;
}

export function localPublishedDir(lang, level) {
  return path.join(ROOT, 'library', 'published-exams', String(lang).toLowerCase(), String(level).toUpperCase());
}

export function localPublishedPath(lang, level, examId) {
  return path.join(localPublishedDir(lang, level), `${examId}.json`);
}

export function localCatalogPath(lang, level) {
  return path.join(localPublishedDir(lang, level), '_catalog.json');
}

export function parseCellKey(cell) {
  const idx = String(cell).lastIndexOf('_');
  if (idx <= 0) throw new Error(`Invalid cell key: ${cell}`);
  const module = cell.slice(0, idx);
  const teil = Number(cell.slice(idx + 1));
  if (!Number.isFinite(teil)) throw new Error(`Invalid cell key: ${cell}`);
  return { cell, module, teil };
}

export function defaultExamId(lang, level, slot) {
  return `official-${String(lang).toLowerCase()}-${String(level).toUpperCase()}-e${slot}`;
}

export function loadSeedRecords(lang, level) {
  const key = `${String(lang).toLowerCase()}_${String(level).toUpperCase()}`;
  const file = path.join(ROOT, 'library', 'reusable-seed', `${key}.json`);
  if (!fs.existsSync(file)) return { records: [], byId: new Map(), source: null };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : Array.isArray(raw) ? raw : [];
  const byId = new Map(records.filter((r) => r?.id).map((r) => [r.id, r]));
  return { records, byId, source: file };
}

/** Map seed/bank record → blob-compatible snapshot payload. */
export function seedRecordToSnapshotPayload(record) {
  if (!record?.id) throw new Error('seed record missing id');
  const module = String(record.module || '').toLowerCase();
  const payload = {
    id: record.id,
    lang: String(record.lang || 'de').toLowerCase(),
    level: String(record.level || 'B1').toUpperCase(),
    module,
    teil: record.teil ?? null,
    instruction: record.instruction || '',
    passage: record.passage || null,
    questions: Array.isArray(record.questions) ? record.questions : [],
    complete: record.complete !== false,
    verified: record.verified !== false,
  };
  if (Array.isArray(record.ads)) payload.ads = record.ads;
  else if (Array.isArray(record.passage?.ads)) payload.ads = record.passage.ads;
  if (Array.isArray(record.passages)) payload.passages = record.passages;
  if (Array.isArray(record.segments)) payload.segments = record.segments;
  if (record.task != null) payload.task = record.task;
  if (record.minWords != null) payload.minWords = record.minWords;
  if (record.maxWords != null) payload.maxWords = record.maxWords;
  if (record.fieldId != null) payload.fieldId = record.fieldId;
  if (record.taskFormat != null) payload.taskFormat = record.taskFormat;
  if (Array.isArray(record.criteria)) payload.criteria = record.criteria;
  if (record.example) payload.example = record.example;
  return normalizePartSnapshot(payload);
}

export function parseAssembledExamFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const meta = raw._meta || {};
  if (!meta.partIds || typeof meta.partIds !== 'object') {
    throw new Error(`${filePath}: missing _meta.partIds`);
  }
  const slot = Number(meta.examNumber);
  if (!Number.isFinite(slot)) throw new Error(`${filePath}: missing _meta.examNumber`);
  return {
    slot,
    partIds: meta.partIds,
    gate1: meta.gate1 || null,
    lang: 'de',
    level: 'B1',
  };
}

/**
 * @returns {Promise<{ payload: object, source: string, contentHash: string } | null>}
 */
export async function resolvePartPayload(store, { lang, level, module, teil, partId, seedById }) {
  if (store) {
    try {
      const blob = await getReusablePart(store, lang, level, module, partId);
      if (blob && blob.disabled !== true) {
        const payload = normalizePartSnapshot(blob);
        return {
          payload,
          source: 'blob',
          contentHash: canonicalPartHash(payload),
        };
      }
    } catch (_) {
      /* fall through to seed */
    }
  }

  const rec = seedById?.get(partId);
  if (rec) {
    const payload = seedRecordToSnapshotPayload(rec);
    return {
      payload,
      source: 'local-seed',
      contentHash: canonicalPartHash(payload),
    };
  }
  return null;
}

/**
 * Capture all parts for a published exam from pool/seed.
 * @returns {Promise<{ parts: object[], missing: string[], sources: object }>}
 */
export async function capturePublishedParts(store, { lang, level, partIdMap, seedById }) {
  const parts = [];
  const missing = [];
  const sources = {};

  for (const cell of OFFICIAL_CELLS) {
    const partId = partIdMap[cell];
    if (!partId) {
      missing.push(cell);
      continue;
    }
    const { module, teil } = parseCellKey(cell);
    const resolved = await resolvePartPayload(store, {
      lang,
      level,
      module,
      teil,
      partId,
      seedById,
    });
    if (!resolved) {
      missing.push(`${cell}:${partId}`);
      continue;
    }
    sources[cell] = resolved.source;
    parts.push({
      cell,
      module,
      teil,
      partId,
      contentHash: resolved.contentHash,
      snapshot: resolved.payload,
    });
  }

  return { parts, missing, sources };
}

/**
 * Build published exam document (does not write).
 */
export function buildPublishedExamDoc({
  examId,
  lang,
  level,
  title,
  slot,
  parts,
  status = 'live',
  manifestVersion = 1,
  previousManifestVersion = null,
  publishedAt = new Date().toISOString(),
  publishedBy = null,
  gate1 = null,
  sourceAssembled = null,
}) {
  return {
    schema: PUBLISHED_EXAM_SCHEMA,
    examId,
    lang: String(lang).toLowerCase(),
    level: String(level).toUpperCase(),
    title,
    slot,
    manifestVersion,
    previousManifestVersion,
    status,
    publishedAt,
    publishedBy,
    gate1,
    sourceAssembled,
    parts,
  };
}

export function summarizePublishedExam(doc) {
  return {
    examId: doc.examId,
    slot: doc.slot,
    title: doc.title,
    status: doc.status,
    manifestVersion: doc.manifestVersion,
    publishedAt: doc.publishedAt,
    partCount: doc.parts?.length || 0,
    parts: (doc.parts || []).map((p) => ({
      cell: p.cell,
      partId: p.partId,
      contentHash: shortHash(p.contentHash),
    })),
  };
}

/** Compare published snapshots/hashes vs current pool payloads. */
export async function assessPublishedExamIntegrity(store, doc, seedById) {
  const partResults = [];
  let integrity = 'ok';

  for (const part of doc.parts || []) {
    const resolved = await resolvePartPayload(store, {
      lang: doc.lang,
      level: doc.level,
      module: part.module,
      teil: part.teil,
      partId: part.partId,
      seedById,
    });

    let match = false;
    let poolHash = null;
    let state = 'ok';

    if (!resolved) {
      state = 'missing';
      integrity = 'missing';
    } else {
      poolHash = resolved.contentHash;
      match = poolHash === part.contentHash;
      if (!match) {
        state = 'divergent';
        if (integrity === 'ok') integrity = 'divergent';
      }
    }

    partResults.push({
      cell: part.cell,
      partId: part.partId,
      publishedHash: part.contentHash,
      poolHash,
      match,
      state,
      poolSource: resolved?.source || null,
    });
  }

  return { integrity, partResults };
}

// ─── Storage: blobs with local fallback ───────────────────────────────────────

export async function getBlobStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore({ name: 'lexicoil-data', consistency: 'strong' });
  } catch (_) {
    return null;
  }
}

export async function readPublishedCatalog({ store, lang, level, preferLocal = false }) {
  if (!preferLocal && store) {
    try {
      const key = publishedCatalogBlobKey(lang, level);
      const data = await store.get(key, { type: 'json' });
      if (data) return data;
    } catch (_) {}
  }
  const local = localCatalogPath(lang, level);
  if (fs.existsSync(local)) {
    return JSON.parse(fs.readFileSync(local, 'utf8'));
  }
  return { version: 0, lang, level, exams: [] };
}

export async function readPublishedExam({ store, lang, level, examId, preferLocal = false }) {
  if (!preferLocal && store) {
    try {
      const key = publishedExamBlobKey(lang, level, examId);
      const data = await store.get(key, { type: 'json' });
      if (data) return data;
    } catch (_) {}
  }
  const local = localPublishedPath(lang, level, examId);
  if (fs.existsSync(local)) {
    return JSON.parse(fs.readFileSync(local, 'utf8'));
  }
  return null;
}

export async function writePublishedExam({
  store,
  lang,
  level,
  doc,
  applyLocal = true,
  applyBlob = true,
}) {
  const examId = doc.examId;
  const written = { local: false, blob: false };

  if (applyLocal) {
    const dir = localPublishedDir(lang, level);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPublishedPath(lang, level, examId), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    written.local = true;
  }

  if (applyBlob && store) {
    const key = publishedExamBlobKey(lang, level, examId);
    await store.setJSON(key, doc);
    written.blob = true;
  }

  return written;
}

export async function upsertPublishedCatalog({
  store,
  lang,
  level,
  examEntry,
  applyLocal = true,
  applyBlob = true,
}) {
  const catalog = await readPublishedCatalog({ store, lang, level });
  const exams = Array.isArray(catalog.exams) ? catalog.exams.filter((e) => e.examId !== examEntry.examId) : [];
  exams.push(examEntry);
  exams.sort((a, b) => Number(a.slot) - Number(b.slot));
  const next = {
    schema: 'published-catalog/v1',
    version: new Date().toISOString(),
    lang: String(lang).toLowerCase(),
    level: String(level).toUpperCase(),
    exams,
  };

  if (applyLocal) {
    fs.mkdirSync(localPublishedDir(lang, level), { recursive: true });
    fs.writeFileSync(localCatalogPath(lang, level), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  if (applyBlob && store) {
    await store.setJSON(publishedCatalogBlobKey(lang, level), next);
  }
  return next;
}

export async function listPublishedExams({ store, lang, level }) {
  const catalog = await readPublishedCatalog({ store, lang, level });
  const exams = [];
  for (const row of catalog.exams || []) {
    const doc = await readPublishedExam({ store, lang, level, examId: row.examId });
    if (doc) exams.push(doc);
  }
  return exams;
}

export { shortHash, canonicalPartHash, normalizePartSnapshot };
