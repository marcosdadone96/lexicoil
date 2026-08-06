/**
 * Banco transversal de nombres para diálogos (Hören T1/T3, Lesen T4, Schreiben…).
 * Exclusión persistida por celda (level×module×teil) — patrón titleVariantBank.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './loadEnv.mjs';

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

function pairKey(a, b) {
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
  return { casts, pairCounts };
}

/**
 * Pick N distinct name pairs avoiding persisted casts and session collisions.
 * @param {number} count
 * @param {{ level?: string, module?: string, teil?: number, excludeCasts?: Set, sessionExcludeCasts?: Set, entropy?: string }} opts
 */
export function pickDialogueNameCast(count = 1, opts = {}) {
  const cfg = loadDialogueNamesConfig();
  const pairs = (cfg.pairs || []).filter(
    (p) => Array.isArray(p) && p.length >= 2,
  );
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

  /** Build N consecutive pairs from bank starting at offset. */
  function pickFromOffset(offset) {
    const picked = [];
    const usedKeys = new Set();
    for (let round = 0; round < pairs.length * 2 && picked.length < count; round += 1) {
      const p = pairs[(offset + round) % pairs.length];
      const pk = pairKey(p[0], p[1]);
      if (usedKeys.has(pk)) continue;
      usedKeys.add(pk);
      picked.push([String(p[0]), String(p[1])]);
    }
    return picked.slice(0, count);
  }

  for (let attempt = 0; attempt < pairs.length; attempt += 1) {
    const offset = (baseStart + attempt) % pairs.length;
    const picked = pickFromOffset(offset);
    if (picked.length < count) continue;
    const castSig = picked.map(([a, b]) => pairKey(a, b)).sort().join('|');
    if (!combinedExclude.has(castSig)) {
      return { pairs: picked, castSignature: castSig };
    }
  }

  // Last resort: deterministic unique suffix pair
  const fallback = pickFromOffset((baseStart + pairs.length - 1) % pairs.length);
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
  if (cell.casts.length > 40) cell.casts = cell.casts.slice(-40);
  cell.updatedAt = new Date().toISOString();
  saveUsageStore(store);
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
