/**
 * Banco transversal de nombres para diálogos (Hören T1/T3, Lesen T4, Schreiben…).
 * Exclusión persistida por celda (level×module×teil) — patrón titleVariantBank.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './loadEnv.mjs';
import {
  extractLesenT4ForumNames,
  GERMAN_FIRST_NAMES,
  TEMPLATE_DEFAULT_NAMES,
  replaceGuestNamesInBatch,
} from './nameRotation.mjs';

const CONFIG_FILE = path.join(ROOT, 'data', 'dialogue-names-bank.json');
const USAGE_FILE = path.join(ROOT, 'data', 'dialogue-names-usage.json');

let _cache = null;

export function loadDialogueNamesConfig() {
  if (_cache) return _cache;
  if (!fs.existsSync(CONFIG_FILE)) {
    _cache = { pairs: [], excludeNames: [], promptDeSingle: '', promptDeMulti: '' };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return _cache;
}

export function resetDialogueNamesCache() {
  _cache = null;
}

function hashPick(key, mod) {
  const h = crypto.createHash('sha256').update(String(key), 'utf8').digest();
  return mod > 0 ? h.readUInt32BE(0) % mod : 0;
}

export const DIALOGUE_HOT_PAIRS = new Set(['Emma+Jonas', 'Clara+Tobias']);

export function pairKey(a, b) {
  return [String(a).trim(), String(b).trim()].sort().join('+');
}

function loadUsageStore() {
  if (!fs.existsSync(USAGE_FILE)) return { cells: {} };
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {
    return { cells: {} };
  }
}

function saveUsageStore(store) {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  fs.writeFileSync(USAGE_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export function cellKey(level, module, teil) {
  return `${String(level).toUpperCase()}:${String(module).toLowerCase()}:t${Number(teil)}`;
}

/** Cast signature for a batch: sorted pair keys joined. */
export function extractDialogueCastSignature(batch) {
  const text = (batch.passages || [])
    .map((p) => p.text || p.transcript || '')
    .join('\n');
  const names = [...text.matchAll(/(?:^|\n)([A-ZÄÖÜ][a-zäöüß]{2,15}):/gm)].map((m) => m[1]);
  const uniq = [...new Set(names)];
  if (uniq.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < uniq.length - 1; i += 2) {
    pairs.push(pairKey(uniq[i], uniq[i + 1]));
  }
  return pairs.sort().join('|');
}

/** All speaker pairs found in batch (per passage segment). */
export function extractDialoguePairs(batch) {
  const out = [];
  for (const p of batch.passages || []) {
    const text = p.text || p.transcript || '';
    const names = [...text.matchAll(/(?:^|\n)([A-ZÄÖÜ][a-zäöüß]{2,15}):/gm)].map((m) => m[1]);
    const uniq = [...new Set(names)];
    if (uniq.length >= 2) out.push([uniq[0], uniq[1]]);
  }
  return out;
}

/** Hard gate: no hot pairs; optional match to planned cast per segment. */
export function validateA2HorenDialogueNames(batch, opts = {}) {
  const planned = opts.plannedPairs || [];
  const found = extractDialoguePairs(batch);
  const issues = [];
  for (const [a, b] of found) {
    const pk = pairKey(a, b);
    if (DIALOGUE_HOT_PAIRS.has(pk)) issues.push(`forbidden_pair:${pk}`);
  }
  if (planned.length && found.length) {
    const n = Math.min(planned.length, found.length);
    for (let i = 0; i < n; i += 1) {
      const exp = pairKey(planned[i][0], planned[i][1]);
      const got = pairKey(found[i][0], found[i][1]);
      if (exp !== got) issues.push(`segment_${i + 1}: expected ${exp}, got ${got}`);
    }
    if (planned.length !== found.length && Number(opts.teil) === 3) {
      issues.push(`segment_count: expected ${planned.length} dialogue segments, found ${found.length}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonFiles(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

/**
 * Load cast signatures already used in pool for this cell.
 */
export function loadPersistedDialogueCasts(opts = {}) {
  const level = String(opts.level || 'A2').toUpperCase();
  const mod = String(opts.module || 'horen').toLowerCase();
  const teil = Number(opts.teil);
  const dirs = opts.extraDirs || [
    path.join(ROOT, `batches/ready/pool-verified/${level}`),
    path.join(ROOT, `batches/needs-regeneration/${level}`),
    path.join(ROOT, `batches/generated/${level}`),
    path.join(ROOT, 'batches/generated/.rejected'),
    path.join(ROOT, `batches/rejected/${level}`),
  ];
  const casts = new Set();
  const pairCounts = new Map();

  for (const abs of [...new Set(dirs.flatMap((d) => walkJsonFiles(d)))]) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    const bMod = String(batch.module || batch.passages?.[0]?.module || '').toLowerCase();
    const bTeil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil);
    const bLevel = String(batch.level || batch.passages?.[0]?.level || '').toUpperCase();
    if (bMod !== mod || bTeil !== teil || bLevel !== level) continue;

    const sig = extractDialogueCastSignature(batch);
    if (sig) casts.add(sig);

    for (const [a, b] of extractDialoguePairs(batch)) {
      const pk = pairKey(a, b);
      pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
    }
  }

  const store = loadUsageStore();
  const ck = cellKey(level, mod, teil);
  const cell = store.cells[ck];
  if (cell?.casts?.length) {
    for (const sig of cell.casts) casts.add(sig);
  }

  return { casts, pairCounts };
}

/**
 * Pick N distinct name pairs avoiding persisted casts and session collisions.
 * @param {number} count
 * @param {{ level?: string, module?: string, teil?: number, excludeCasts?: Set, sessionExcludeCasts?: Set, entropy?: string }} opts
 */
export function pickDialogueNameCast(count = 1, opts = {}) {
  const cfg = loadDialogueNamesConfig();
  const pairs = (cfg.pairs || [])
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .filter((p) => !DIALOGUE_HOT_PAIRS.has(pairKey(p[0], p[1])));
  const persisted = loadPersistedDialogueCasts({
    level: opts.level,
    module: opts.module,
    teil: opts.teil,
  });
  const excludeCasts = opts.excludeCasts || persisted.casts;
  const sessionExclude = opts.sessionExcludeCasts || new Set();
  const combinedExclude = new Set([
    ...(excludeCasts instanceof Set ? excludeCasts : []),
    ...sessionExclude,
  ]);
  const entropy = String(opts.entropy || Date.now());
  const baseStart = hashPick(`${entropy}:names`, pairs.length);

  const forbiddenPairs = new Set(DIALOGUE_HOT_PAIRS);
  for (const [pk, cnt] of persisted.pairCounts) {
    if (cnt >= 2) forbiddenPairs.add(pk);
  }

  /** Build N consecutive pairs from bank starting at offset. */
  function pickFromOffset(offset, relax = false) {
    const picked = [];
    const usedKeys = new Set();
    for (let round = 0; round < pairs.length * 8 && picked.length < count; round += 1) {
      const p = pairs[(offset + round) % pairs.length];
      const pk = pairKey(p[0], p[1]);
      if (usedKeys.has(pk)) continue;
      if (!relax && forbiddenPairs.has(pk)) continue;
      if (relax && DIALOGUE_HOT_PAIRS.has(pk)) continue;
      usedKeys.add(pk);
      picked.push([String(p[0]), String(p[1])]);
    }
    return picked.slice(0, count);
  }

  for (let attempt = 0; attempt < pairs.length; attempt += 1) {
    const offset = (baseStart + attempt) % pairs.length;
    let picked = pickFromOffset(offset, false);
    if (picked.length < count) picked = pickFromOffset(offset, true);
    if (picked.length < count) continue;
    const castSig = picked.map(([a, b]) => pairKey(a, b)).sort().join('|');
    if (!combinedExclude.has(castSig)) {
      return { pairs: picked, castSignature: castSig };
    }
  }

  let fallback = pickFromOffset((baseStart + pairs.length - 1) % pairs.length, true);
  if (fallback.length < count) {
    fallback = pickFromOffset(0, true);
  }
  const castSig = fallback.map(([a, b]) => pairKey(a, b)).sort().join('|');
  return { pairs: fallback, castSignature: `${castSig}#${hashPick(entropy, 999)}` };
}

export function recordDialogueCastUsage(level, module, teil, castSignature) {
  if (!castSignature) return;
  const store = loadUsageStore();
  const ck = cellKey(level, module, teil);
  if (!store.cells[ck]) store.cells[ck] = { casts: [], updatedAt: null };
  const cell = store.cells[ck];
  if (!cell.casts.includes(castSignature)) cell.casts.push(castSignature);
  if (cell.casts.length > 200) cell.casts = cell.casts.slice(-200);
  cell.updatedAt = new Date().toISOString();
  saveUsageStore(store);
}

/**
 * Persist casts after successful Hören generation (planned pick + dialogue in batch).
 */
export function recordDialogueCastsFromGeneration(opts = {}) {
  const level = String(opts.level || 'A2').toUpperCase();
  const mod = String(opts.module || 'horen').toLowerCase();
  const teil = Number(opts.teil);
  if (!Number.isFinite(teil)) return;

  if (opts.plannedSignature) {
    recordDialogueCastUsage(level, mod, teil, opts.plannedSignature);
  }
  const batch = opts.batch;
  if (!batch) return;
  const sig = extractDialogueCastSignature(batch);
  if (sig) recordDialogueCastUsage(level, mod, teil, sig);
  for (const [a, b] of extractDialoguePairs(batch)) {
    recordDialogueCastUsage(level, mod, teil, pairKey(a, b));
  }
}

export function buildDialogueNamesPromptBlock(opts = {}) {
  const cfg = loadDialogueNamesConfig();
  const exclude = (cfg.excludeNames || []).join(', ');
  const count = Number(opts.count ?? opts.pairs?.length ?? 1);

  if (count === 1 && opts.pairs?.length === 1) {
    const [a, b] = opts.pairs[0];
    const line = String(cfg.promptDeSingle || '')
      .replaceAll('{{NAME_A}}', a)
      .replaceAll('{{NAME_B}}', b)
      .replaceAll('{{EXCLUDE}}', exclude);
    return line ? `\n- ${line}\n` : '';
  }

  const pairsLine = (opts.pairs || [])
    .map(([a, b], i) => `segmento ${i + 1}: ${a}+${b}`)
    .join(' · ');
  const line = String(cfg.promptDeMulti || '')
    .replaceAll('{{PAIRS}}', pairsLine)
    .replaceAll('{{EXCLUDE}}', exclude);
  return line ? `\n- ${line}\n` : '';
}

export function tallyNameFrequency(batches) {
  const nameCounts = new Map();
  const pairCounts = new Map();
  for (const batch of batches) {
    for (const [a, b] of extractDialoguePairs(batch)) {
      nameCounts.set(a, (nameCounts.get(a) || 0) + 1);
      nameCounts.set(b, (nameCounts.get(b) || 0) + 1);
      const pk = pairKey(a, b);
      pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
    }
  }
  return { nameCounts, pairCounts };
}

/** Lesen T4 — sorted forum cast (7× «Ist Name für …?»). */
export function extractLesenT4ForumCastSignature(batch) {
  const names = extractLesenT4ForumNames(batch).sort();
  if (names.length < 2) return null;
  return names.join('|');
}

function lesenT4BatchMatchesCell(batch, level, teil) {
  const bMod = String(batch.module || 'lesen').toLowerCase();
  const bTeil = Number(batch.teil ?? batch.questions?.[0]?.teil);
  const bLevel = String(batch.level || batch.passages?.[0]?.level || level).toUpperCase();
  return bMod === 'lesen' && bTeil === Number(teil) && bLevel === String(level).toUpperCase();
}

/**
 * Persisted Lesen T4 forum casts + per-name file frequency (pool + usage store).
 */
export function loadPersistedLesenT4ForumCasts(opts = {}) {
  const level = String(opts.level || 'B1').toUpperCase();
  const teil = Number(opts.teil ?? 4);
  const dirs = opts.extraDirs || [
    path.join(ROOT, `batches/ready/pool-verified/${level}`),
    path.join(ROOT, `batches/needs-regeneration/${level}`),
    path.join(ROOT, `batches/generated/${level}`),
    path.join(ROOT, 'batches/generated/.rejected'),
    path.join(ROOT, `batches/rejected/${level}`),
  ];
  const casts = new Set();
  const nameFileCounts = new Map();
  const castByFile = [];

  for (const abs of [...new Set(dirs.flatMap((d) => walkJsonFiles(d)))]) {
    if (!/lesen-t4.*\.json$/i.test(path.basename(abs))) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    if (!lesenT4BatchMatchesCell(batch, level, teil)) continue;
    const sig = extractLesenT4ForumCastSignature(batch);
    if (sig) {
      casts.add(sig);
      castByFile.push({ file: abs, sig, names: sig.split('|') });
    }
    for (const n of extractLesenT4ForumNames(batch)) {
      nameFileCounts.set(n, (nameFileCounts.get(n) || 0) + 1);
    }
  }

  const store = loadUsageStore();
  const ck = cellKey(level, 'lesen', teil);
  const cell = store.cells[ck];
  if (cell?.casts?.length) {
    for (const sig of cell.casts) casts.add(sig);
  }

  return { casts, nameFileCounts, castByFile };
}

/**
 * Pick 7 forum names (Lesen T4) avoiding persisted full casts + hot names.
 * @param {{ level?: string, teil?: number, sessionExclude?: string[], sessionExcludeCasts?: Set, entropy?: string, extraDirs?: string[], count?: number }} opts
 */
export function pickLesenT4ForumCast(opts = {}) {
  const count = Number(opts.count ?? 7);
  const level = String(opts.level || 'B1').toUpperCase();
  const teil = Number(opts.teil ?? 4);
  const persisted = loadPersistedLesenT4ForumCasts({ level, teil, extraDirs: opts.extraDirs });
  const excludeCasts = opts.excludeCasts || persisted.casts;
  const sessionCastExclude = opts.sessionExcludeCasts || new Set();
  const sessionNameExclude = new Set([
    ...(opts.sessionExclude || []),
    ...TEMPLATE_DEFAULT_NAMES,
  ]);
  const entropy = String(opts.entropy || Date.now());
  const baseStart = hashPick(`${entropy}:lesen-t4-forum`, GERMAN_FIRST_NAMES.length);

  const totalFiles = Math.max(
    1,
    persisted.castByFile.length || [...persisted.nameFileCounts.values()].reduce((a, b) => a + b, 0),
  );
  const maxNameShare = opts.maxNameFileShare ?? 0.28;
  const maxNameFiles = Math.max(2, Math.ceil(totalFiles * maxNameShare));

  function nameScore(n) {
    return persisted.nameFileCounts.get(n) || 0;
  }

  function buildPick(offset) {
    const ranked = [...GERMAN_FIRST_NAMES].sort((a, b) => {
      const penA = sessionNameExclude.has(a) ? 12 : 0;
      const penB = sessionNameExclude.has(b) ? 12 : 0;
      const d = nameScore(a) + penA - (nameScore(b) + penB);
      if (d !== 0) return d;
      return hashPick(`${entropy}:${a}:${offset}`, 997) - hashPick(`${entropy}:${b}:${offset}`, 997);
    });
    const picked = [];
    for (const n of ranked) {
      if (picked.includes(n)) continue;
      if (nameScore(n) >= maxNameFiles && picked.length >= 4) continue;
      picked.push(n);
      if (picked.length >= count) break;
    }
    if (picked.length < count) {
      for (const n of GERMAN_FIRST_NAMES) {
        if (picked.includes(n)) continue;
        picked.push(n);
        if (picked.length >= count) break;
      }
    }
    return picked.slice(0, count);
  }

  for (let attempt = 0; attempt < GERMAN_FIRST_NAMES.length; attempt += 1) {
    const offset = (baseStart + attempt) % GERMAN_FIRST_NAMES.length;
    const names = buildPick(offset);
    const sig = [...names].sort().join('|');
    if (excludeCasts instanceof Set && excludeCasts.has(sig)) continue;
    if (sessionCastExclude.has(sig)) continue;
    const overlapHot = names.filter((n) => (persisted.nameFileCounts.get(n) || 0) >= maxNameFiles);
    if (overlapHot.length > 2) continue;
    return { names, castSignature: sig };
  }

  const fallback = buildPick(baseStart);
  const sig = [...fallback].sort().join('|');
  return { names: fallback, castSignature: `${sig}#${hashPick(entropy, 999)}` };
}

export function recordLesenT4ForumCastFromGeneration(opts = {}) {
  const level = String(opts.level || 'B1').toUpperCase();
  const teil = Number(opts.teil ?? 4);
  if (opts.plannedSignature) {
    recordDialogueCastUsage(level, 'lesen', teil, opts.plannedSignature);
  }
  const batch = opts.batch;
  if (!batch) return;
  const sig = extractLesenT4ForumCastSignature(batch);
  if (sig) recordDialogueCastUsage(level, 'lesen', teil, sig);
}

/**
 * Force planned forum names onto batch (deterministic replace, no LLM).
 */
export function enforceLesenT4PlannedForumNames(batch, plannedNames) {
  const plan = (plannedNames || []).filter(Boolean).slice(0, 7);
  if (!plan.length || !batch) return batch;
  const actual = extractLesenT4ForumNames(batch);
  if (actual.length !== plan.length) return batch;
  let next = batch;
  for (let i = 0; i < plan.length; i += 1) {
    if (actual[i] === plan[i]) continue;
    const { batch: patched } = replaceGuestNamesInBatch(next, [actual[i]], [plan[i]]);
    next = patched;
  }
  return next;
}

/** Frequency table for Lesen T4 forum names across dirs. */
export function tallyLesenT4ForumNameFrequency(opts = {}) {
  const { nameFileCounts, castByFile } = loadPersistedLesenT4ForumCasts(opts);
  const pairOverlap = new Map();
  for (let i = 0; i < castByFile.length; i += 1) {
    for (let j = i + 1; j < castByFile.length; j += 1) {
      const a = new Set(castByFile[i].names);
      const shared = castByFile[j].names.filter((n) => a.has(n));
      if (shared.length >= 3) {
        const key = `${path.basename(castByFile[i].file)}↔${path.basename(castByFile[j].file)}`;
        pairOverlap.set(key, shared);
      }
    }
  }
  return { nameFileCounts, castByFile, pairOverlap };
}
