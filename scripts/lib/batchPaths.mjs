import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

export const KNOWN_LEVELS = Object.freeze(['B1', 'A2', 'B2', 'C1']);

export const MERGED_DIR = path.join(ROOT, 'batches', 'merged');
export const REJECTED_DIR = path.join(ROOT, 'batches', 'rejected');
export const LOG_DIR = path.join(ROOT, 'batches', 'logs');
export const READY_DIR = path.join(ROOT, 'batches', 'ready');
export const NEEDS_REGEN_ROOT = path.join(ROOT, 'batches', 'needs-regeneration');

/** Legacy flat root — kept for transition scans. */
export const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
export const POOL_VERIFIED_DIR = path.join(READY_DIR, 'pool-verified');
export const POOL_CONTENT_OK_DIR = path.join(READY_DIR, 'pool-content-ok');
export const POOL_CONTENT_OK_LESEN_DIR = path.join(READY_DIR, 'pool-content-ok-lesen');
export const READY_LESEN_DIR = path.join(READY_DIR, 'lesen');
export const POOL_FILE = path.join(ROOT, 'library', 'reusable-seed', 'de_B1.json');

export function normalizeLevel(level) {
  const lv = String(level || 'B1').trim().toUpperCase();
  return KNOWN_LEVELS.includes(lv) ? lv : 'B1';
}

/**
 * Infer CEFR level from batch JSON (questions / passages / root).
 * Legacy batches without level field default to B1.
 */
export function inferBatchLevel(batch) {
  const levels = new Set();
  for (const q of batch?.questions || []) {
    if (q?.level) levels.add(normalizeLevel(q.level));
  }
  for (const p of batch?.passages || []) {
    if (p?.level) levels.add(normalizeLevel(p.level));
  }
  if (batch?.level) levels.add(normalizeLevel(batch.level));
  if (levels.size === 1) return [...levels][0];
  if (levels.size > 1) return 'MIXED';
  return 'B1';
}

/**
 * True when every question (and optional passage) declares the same target level.
 * Rejects MIXED, missing levels on any question, or any level ≠ target.
 */
export function batchDeclaresUniformLevel(batch, targetLevel) {
  const target = normalizeLevel(targetLevel);
  const questions = batch?.questions || [];
  if (!questions.length) {
    return batch?.level ? normalizeLevel(batch.level) === target : false;
  }
  for (const q of questions) {
    if (!q?.level) return false;
    if (normalizeLevel(q.level) !== target) return false;
  }
  for (const p of batch?.passages || []) {
    if (p?.level && normalizeLevel(p.level) !== target) return false;
  }
  return true;
}

export function generatedDir(level = 'B1') {
  return path.join(GENERATED_DIR, normalizeLevel(level));
}

export function poolVerifiedDir(level = 'B1') {
  return path.join(POOL_VERIFIED_DIR, normalizeLevel(level));
}

/**
 * All pool-verified JSON paths for a level (leveled subdir + legacy flat scan).
 * Dedupes by basename (first seen wins: leveled before legacy flat).
 */
export function listPoolVerifiedJson(level = 'B1', opts = {}) {
  const lv = normalizeLevel(level);
  const map = new Map();
  for (const root of [poolVerifiedDir(lv), POOL_VERIFIED_DIR]) {
    if (!fs.existsSync(root)) continue;
    for (const abs of listJsonInStagingRoot(root)) {
      const base = path.basename(abs);
      if (!map.has(base)) map.set(base, abs);
    }
  }
  const out = [...map.values()];
  if (opts.sort !== false) {
    out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  }
  return out;
}

export function poolContentOkDir(level = 'B1') {
  return path.join(POOL_CONTENT_OK_DIR, normalizeLevel(level));
}

export function poolContentOkLesenDir(level = 'B1') {
  return path.join(POOL_CONTENT_OK_LESEN_DIR, normalizeLevel(level));
}

export function needsRegenerationDir(level = 'B1') {
  return path.join(NEEDS_REGEN_ROOT, normalizeLevel(level));
}

export function readyLesenDir(level = 'B1') {
  return path.join(READY_LESEN_DIR, normalizeLevel(level));
}

export function bankQuestionsPath(lang = 'de', level = 'B1') {
  return path.join(ROOT, 'library', String(lang || 'de').toLowerCase(), normalizeLevel(level), 'questions.json');
}

export function seedPoolPath(lang = 'de', level = 'B1') {
  const lv = normalizeLevel(level);
  const langKey = String(lang || 'de').toLowerCase();
  return path.join(ROOT, 'library', 'reusable-seed', `${langKey}_${lv}.json`);
}

/** Stage roots (walk recursively for level subdirs + legacy flat). */
export function allStagingJsonRoots() {
  return [
    GENERATED_DIR,
    POOL_VERIFIED_DIR,
    POOL_CONTENT_OK_DIR,
    POOL_CONTENT_OK_LESEN_DIR,
    NEEDS_REGEN_ROOT,
    READY_LESEN_DIR,
  ];
}

/**
 * Per-level scan dirs: leveled subfolder first, then legacy flat (transition).
 */
export function allStagingScanDirs(level = 'B1') {
  const lv = normalizeLevel(level);
  const pairs = [
    [generatedDir(lv), GENERATED_DIR],
    [poolVerifiedDir(lv), POOL_VERIFIED_DIR],
    [poolContentOkDir(lv), POOL_CONTENT_OK_DIR],
    [poolContentOkLesenDir(lv), POOL_CONTENT_OK_LESEN_DIR],
    [needsRegenerationDir(lv), NEEDS_REGEN_ROOT],
    [readyLesenDir(lv), READY_LESEN_DIR],
  ];
  const out = [];
  for (const [leveled, legacy] of pairs) {
    out.push(leveled);
    if (leveled !== legacy) out.push(legacy);
  }
  return [...new Set(out)];
}

/** All scan dirs across every known level (dedup corpus, batch numbering). */
export function allStagingScanDirsAllLevels() {
  const dirs = new Set();
  for (const lv of KNOWN_LEVELS) {
    for (const d of allStagingScanDirs(lv)) dirs.add(d);
  }
  return [...dirs];
}

/**
 * List .json files under a staging root (one level of subdirs + flat).
 * Skips dot dirs (.rejected, gate-logs, etc.).
 */
export function listJsonInStagingRoot(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const out = [];
  const skipDir = new Set([
    '.rejected',
    'gate-logs',
    'experiment-t1-fewshot-ab',
    'pilot-gate-control',
    'sem2-calibration',
    '_premise-dedupe-archive',
    '_selftest-archive-2026-07-14',
  ]);
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || skipDir.has(ent.name)) continue;
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      if (KNOWN_LEVELS.includes(ent.name.toUpperCase())) {
        for (const f of fs.readdirSync(full)) {
          if (f.endsWith('.json')) out.push(path.join(full, f));
        }
      }
    } else if (ent.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

/** Collect all staging batch JSON paths (all levels + legacy flat). */
export function collectAllStagingJsonFiles() {
  const map = new Map();
  for (const root of allStagingJsonRoots()) {
    for (const abs of listJsonInStagingRoot(root)) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      map.set(rel, abs);
    }
  }
  return map;
}

export function ensureLevelStagingDirs(level = 'B1') {
  const lv = normalizeLevel(level);
  for (const d of allStagingScanDirs(lv).filter((x, i, arr) => arr.indexOf(x) === i)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/**
 * Dirs scanned when allocating the next *-gemini-NNN.json index.
 * Scans all levels + legacy flats to avoid ID collisions across B1/A2.
 */
export function defaultBatchNumberScanDirs(level = null) {
  if (level) return allStagingScanDirs(level);
  return allStagingScanDirsAllLevels();
}

export function maxExistingBatchNumber(basePrefix, scanDirs = defaultBatchNumberScanDirs()) {
  const escaped = String(basePrefix || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}-(\\d+)\\.json$`, 'i');
  let max = 0;
  for (const dir of scanDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const abs of listJsonInStagingRoot(dir)) {
      const name = path.basename(abs);
      const m = name.match(re);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
  }
  return max;
}

export function nextNumberedBatchBasename(basePrefix, opts = {}) {
  const pad = Number.isFinite(opts.pad) ? opts.pad : 3;
  const scanDirs = opts.scanDirs || defaultBatchNumberScanDirs(opts.level);
  const max = maxExistingBatchNumber(basePrefix, scanDirs);
  return `${basePrefix}-${String(max + 1).padStart(pad, '0')}.json`;
}

export function rejectBatchFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  fs.mkdirSync(REJECTED_DIR, { recursive: true });
  const base = path.basename(filePath);
  let dest = path.join(REJECTED_DIR, base);
  if (fs.existsSync(dest)) {
    dest = path.join(REJECTED_DIR, `${Date.now()}-${base}`);
  }
  fs.renameSync(filePath, dest);
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}
