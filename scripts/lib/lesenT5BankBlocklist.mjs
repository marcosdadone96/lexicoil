/**
 * lesenT5BankBlocklist.mjs — Blocklist global de pasajes T5 publicados (banco + pool).
 *
 * Cierra el hueco arquitectónico: exclude-molds por celda no veía el banco completo.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  allStagingScanDirs,
  bankQuestionsPath,
  listJsonInStagingRoot,
} from './batchPaths.mjs';
import { ROOT } from './loadEnv.mjs';
import { normalizeComparableText } from './qualityGates/dedupNormalize.mjs';
import { detectT5Subtype } from './lesenSubtypeRotation.mjs';

let _cacheKey = null;
let _cacheEntries = null;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function passagePreview(title, text, max = 72) {
  const base = String(title || text || '').replace(/\s+/g, ' ').trim();
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

function pushEntry(map, entry) {
  if (!entry?.hash || entry.hash.length < 16) return;
  const prev = map.get(entry.hash);
  if (!prev || (entry.tier || 0) > (prev.tier || 0)) {
    map.set(entry.hash, entry);
  }
}

function tierForSource(source) {
  const s = String(source || '').replace(/\\/g, '/');
  if (s.startsWith('library/')) return 60;
  if (s.includes('/ready/pool-verified/')) return 50;
  if (s.includes('/ready/pool-content-ok-lesen/')) return 35;
  if (s.includes('/generated/')) return 20;
  if (s.includes('/needs-regeneration/')) return 10;
  return 0;
}

function loadPassageFromBatchFile(abs, relSource) {
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return [];
  }
  const out = [];
  for (const p of batch.passages || []) {
    const norm = normalizeComparableText(p.text);
    if (norm.length < 40) continue;
    const id = String(p.id || '');
    if (Number(p.teil) !== 5 && !id.startsWith('gen-l5-')) continue;
    if (Number(p.teil) && Number(p.teil) !== 5) continue;
    out.push({
      hash: sha256Hex(norm),
      passageId: id || null,
      title: String(p.title || '').trim(),
      preview: passagePreview(p.title, p.text),
      source: relSource,
      textSubtype: detectT5Subtype({ passages: [p], textSubtype: batch._textSubtype }),
      tier: tierForSource(relSource),
    });
  }
  return out;
}

/**
 * All published / staged Lesen T5 passage fingerprints (global, not per topic cell).
 * @param {object} [opts]
 * @param {boolean} [opts.reload]
 */
export function loadGlobalT5BlocklistEntries(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const cacheKey = `${lang}:${level}`;
  if (!opts.reload && _cacheKey === cacheKey && _cacheEntries) {
    return _cacheEntries;
  }

  const byHash = new Map();

  const bankPath = opts.bankPath || bankQuestionsPath(lang, level);
  if (fs.existsSync(bankPath)) {
    const bankRel = path.relative(ROOT, bankPath).replace(/\\/g, '/');
    let bank;
    try {
      bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    } catch {
      bank = { passages: [] };
    }
    for (const p of bank.passages || []) {
      if (String(p.module || '').toLowerCase() !== 'lesen') continue;
      const id = String(p.id || '');
      if (!id.startsWith('gen-l5-')) continue;
      const norm = normalizeComparableText(p.text);
      if (norm.length < 40) continue;
      pushEntry(byHash, {
        hash: sha256Hex(norm),
        passageId: id,
        title: String(p.title || '').trim(),
        preview: passagePreview(p.title, p.text),
        source: `${bankRel}::${id}`,
        textSubtype: detectT5Subtype({ passages: [p] }),
        tier: 60,
      });
    }
  }

  for (const root of allStagingScanDirs(level)) {
    if (!fs.existsSync(root)) continue;
    for (const abs of listJsonInStagingRoot(root)) {
      const base = path.basename(abs);
      if (!/^lesen-t5-.*\.json$/i.test(base)) continue;
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      for (const e of loadPassageFromBatchFile(abs, rel)) {
        pushEntry(byHash, e);
      }
    }
  }

  _cacheKey = cacheKey;
  _cacheEntries = [...byHash.values()].sort((a, b) => (b.tier - a.tier) || a.title.localeCompare(b.title));
  return _cacheEntries;
}

/** Reset cached blocklist (tests). */
export function resetGlobalT5BlocklistCache() {
  _cacheKey = null;
  _cacheEntries = null;
}

export function buildT5PublishedBlocklistPromptBlock(entries = [], opts = {}) {
  const max = opts.maxEntries ?? 24;
  const list = (entries || []).slice(0, max);
  if (!list.length) return '';
  const lines = [
    `\n## TEXTOS PUBLICADOS PROHIBIDOS (Lesen Teil 5 — banco + pool global)\n`,
    `Los siguientes pasajes normativos **ya existen**. NO los reproduzcas ni parafrasees de forma idéntica:\n`,
  ];
  for (const e of list) {
    lines.push(`- «${e.title || e.passageId || '?'}» — ${e.preview}\n`);
  }
  if ((entries || []).length > max) {
    lines.push(`- … y ${entries.length - max} textos más en el banco/pool.\n`);
  }
  lines.push(
    `Inventa institución, título y reglas **nuevos**. Copiar ≥1 párrafo completo de estos textos invalida la generación.\n`,
  );
  return lines.join('');
}

/**
 * @param {object} batch
 * @param {object} [opts]
 */
export function assertLesenT5NotBankDuplicate(batch, opts = {}) {
  const teil = Number(batch?.questions?.[0]?.teil ?? batch?.passages?.[0]?.teil ?? 0);
  if (teil !== 5) return { ok: true };

  const entries = loadGlobalT5BlocklistEntries(opts);
  const hashSet = new Map(entries.map((e) => [e.hash, e]));

  for (const p of batch.passages || []) {
    const norm = normalizeComparableText(p.text);
    if (norm.length < 40) continue;
    const hash = sha256Hex(norm);
    const hit = hashSet.get(hash);
    if (hit) {
      return {
        ok: false,
        issue:
          `Lesen T5: pasaje idéntico (hash) con «${hit.source}» — regurgitación de banco/pool`,
        hash,
        matchSource: hit.source,
        matchTitle: hit.title,
        passageId: p.id || hit.passageId,
      };
    }
  }
  return { ok: true };
}
