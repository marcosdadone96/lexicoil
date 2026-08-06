/**
 * t3GroupFingerprint.mjs — Fingerprint de grupo T3 por las 7 situaciones (question).
 * Dos partes con el mismo fp comparten el mismo «examen» para el alumno aunque los anuncios difieran.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { READY_LESEN_DIR } from './batchPaths.mjs';

/** @param {string} text */
export function normalizeT3SituationText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object[]} questions
 * @param {{ slots?: number[] }} [opts] — default all 7; pool gate uses slots 1–6 (q7 excluded).
 * @returns {string|null} 16-char hex sha256 prefix
 */
export function t3SituationFingerprintFromQuestions(questions, opts = {}) {
  const all = (questions || [])
    .map((q) => normalizeT3SituationText(q?.question))
    .filter(Boolean);
  const slots = opts.slots;
  const situations =
    Array.isArray(slots) && slots.length
      ? slots.map((i) => all[i]).filter(Boolean)
      : all;
  const expected = Array.isArray(slots) && slots.length ? slots.length : 7;
  if (situations.length !== expected) return null;
  const canonical = [...situations].sort().join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

/** Slots 1–6 only (q7 seeker name rotates — excluded from pool dedup). */
export function t3SituationCoreFingerprintFromQuestions(questions) {
  return t3SituationFingerprintFromQuestions(questions, { slots: [0, 1, 2, 3, 4, 5] });
}

/** @param {object} batch */
export function t3SituationCoreFingerprintFromBatch(batch) {
  return t3SituationCoreFingerprintFromQuestions(batch?.questions || []);
}

/** @param {object} batch */
export function t3SituationFingerprintFromBatch(batch) {
  return t3SituationFingerprintFromQuestions(batch?.questions || []);
}

/** @param {object} part exam part with .questions */
export function t3SituationFingerprintFromPart(part) {
  const qs = (part?.questions || []).filter(
    (q) => String(q?.module || 'lesen').toLowerCase() === 'lesen' && Number(q?.teil) === 3,
  );
  return t3SituationFingerprintFromQuestions(qs.length ? qs : part?.questions || []);
}

/** @param {string} filePath */
export function t3SituationFingerprintFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const batch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return t3SituationFingerprintFromBatch(batch);
  } catch {
    return null;
  }
}

/**
 * Scan ready/lesen T3 files for blueprint slug + situation fingerprint counts.
 * @param {string} [readyDir]
 */
export function scanReadyT3Stats(readyDir = READY_LESEN_DIR) {
  const byBlueprintSlug = {};
  const bySituationFp = {};
  const files = [];

  if (!fs.existsSync(readyDir)) {
    return { total: 0, byBlueprintSlug, bySituationFp, files };
  }

  for (const name of fs.readdirSync(readyDir)) {
    if (!name.endsWith('.json') || !/lesen-t3/i.test(name)) continue;
    const fp = path.join(readyDir, name);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
      continue;
    }
    const slug = batch._blueprintSlug || batch.blueprintSlug || '(unknown)';
    const situationFp = t3SituationFingerprintFromBatch(batch);
    byBlueprintSlug[slug] = (byBlueprintSlug[slug] || 0) + 1;
    if (situationFp) {
      bySituationFp[situationFp] = (bySituationFp[situationFp] || 0) + 1;
    }
    files.push({ file: name, blueprintSlug: slug, t3SituationFp: situationFp });
  }

  return { total: files.length, byBlueprintSlug, bySituationFp, files };
}

/** @param {string} slug @param {string} [readyDir] */
export function countReadyT3ForBlueprint(slug, readyDir = READY_LESEN_DIR) {
  const stats = scanReadyT3Stats(readyDir);
  return stats.byBlueprintSlug[slug] || 0;
}

const ASSEMBLED_GLOB = /^assembled-exam-b1(?:-e(\d+)|-clean)?\.json$/i;

/**
 * Load T3 situation fingerprints already used in assembled exam JSON files at repo root.
 * @param {string} root
 * @param {{ excludeExamNumbers?: number[], excludeFiles?: string[] }} [opts]
 */
export function loadCatalogT3Entries(root, opts = {}) {
  const excludeNums = new Set(opts.excludeExamNumbers || []);
  const excludeFiles = new Set((opts.excludeFiles || []).map((f) => path.basename(f)));
  const entries = [];

  if (!root || !fs.existsSync(root)) return entries;

  for (const name of fs.readdirSync(root)) {
    const m = name.match(ASSEMBLED_GLOB);
    if (!m) continue;
    if (excludeFiles.has(name)) continue;
    const examNum = m[1] ? Number(m[1]) : name.includes('-clean') ? 0 : null;
    if (examNum != null && excludeNums.has(examNum)) continue;

    const filePath = path.join(root, name);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    const lesenParts = doc?.exam?.lesenParts || [];
    const t3Part = lesenParts.find((p) => Number(p?.teil) === 3)
      || lesenParts[2]
      || null;
    const fp = t3Part ? t3SituationFingerprintFromPart(t3Part) : null;
    if (!fp) continue;

    entries.push({
      examFile: name,
      examNumber: doc?._meta?.examNumber ?? examNum,
      t3SituationFp: fp,
      partId: doc?._meta?.partIds?.lesen_3 || t3Part?.id || null,
    });
  }
  return entries;
}

/**
 * @param {{ examNumber?: number, examFile?: string, t3SituationFp: string }[]} entries
 */
export function validateDistinctT3Fingerprints(entries) {
  const byFp = new Map();
  const errors = [];

  for (const row of entries || []) {
    if (!row?.t3SituationFp) continue;
    const prior = byFp.get(row.t3SituationFp);
    if (prior) {
      errors.push(
        `T3 situation fp ${row.t3SituationFp} compartido: ` +
          `${prior.examFile || prior.examNumber} y ${row.examFile || row.examNumber}`,
      );
    } else {
      byFp.set(row.t3SituationFp, row);
    }
  }

  return { ok: errors.length === 0, errors, uniqueCount: byFp.size };
}

/**
 * Fail if `fp` collides with catalog entries (excluding optional exam numbers).
 * @returns {{ ok: boolean, conflict?: object }}
 */
export function assertT3FingerprintUniqueInCatalog(fp, root, opts = {}) {
  if (!fp) return { ok: true };
  for (const row of loadCatalogT3Entries(root, opts)) {
    if (row.t3SituationFp === fp) {
      return { ok: false, conflict: row };
    }
  }
  return { ok: true };
}
