/**
 * pool-caps-scan.mjs
 * Scan every record in the reusable seed pool for mid-sentence capitalisation
 * errors using the two-tier decapitalizeMidSentence detector.
 *
 * Usage:  node scripts/pool-caps-scan.mjs
 */
import fs from 'fs';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';

const POOL_FILE = new URL('../library/reusable-seed/de_B1.json', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');  // fix Windows /C:/... → C:/...

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || []);

// ── helpers ──────────────────────────────────────────────────────────────────

function collectTexts(obj, fieldPath, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectTexts(v, `${fieldPath}[${i}]`, acc));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const fp = `${fieldPath}.${k}`;
    if (typeof v === 'string' && v.length > 4) {
      acc.push({ field: fp, text: v });
    } else if (v && typeof v === 'object') {
      collectTexts(v, fp, acc);
    }
  }
}

function findChangedTokens(orig, result) {
  // Tokenise both strings and diff token-by-token.
  const re = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
  const tok = (s) => { const a = []; let m; re.lastIndex = 0; while ((m = re.exec(s)) !== null) a.push({ val: m[0], pos: m.index }); return a; };
  const oa = tok(orig);
  const ra = tok(result);
  const hits = [];
  const len = Math.min(oa.length, ra.length);
  for (let i = 0; i < len; i++) {
    if (oa[i].val !== ra[i].val) {
      const p = oa[i].pos;
      const ctx = orig.slice(Math.max(0, p - 35), p + oa[i].val.length + 35).replace(/\n/g, ' ');
      hits.push({ word: oa[i].val, fix: ra[i].val, ctx });
    }
  }
  return hits;
}

// ── scan ─────────────────────────────────────────────────────────────────────

const cellErrors  = {};   // cell → [{partId, hits:[]}]
const cleanParts  = [];
const dirtyParts  = [];
let   totalErrors = 0;

for (const rec of records) {
  const cell   = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const partId = rec.id || rec.recordId || '(no-id)';

  const texts = [];
  collectTexts(rec, '', texts);

  const partHits = [];

  for (const { field, text } of texts) {
    const { result, count } = decapitalizeMidSentence(text);
    if (count === 0) continue;
    for (const h of findChangedTokens(text, result)) {
      partHits.push({ field, ...h });
      totalErrors++;
    }
  }

  if (!cellErrors[cell]) cellErrors[cell] = [];

  if (partHits.length === 0) {
    cleanParts.push({ cell, partId });
  } else {
    dirtyParts.push({ cell, partId, hits: partHits });
    cellErrors[cell].push({ partId, hits: partHits });
  }
}

// ── report ────────────────────────────────────────────────────────────────────

const BAR = '═'.repeat(72);
console.log(`\n${BAR}`);
console.log(`POOL CAPITALIZATION SCAN  ·  ${records.length} partes en pool`);
console.log(`Errores CHK-14b: ${totalErrors}  |  Partes con errores: ${dirtyParts.length}  |  Limpias: ${cleanParts.length}`);
console.log(`${BAR}\n`);

// Per-cell totals
const cellInfo = {};
for (const rec of records) {
  const cell = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  if (!cellInfo[cell]) cellInfo[cell] = { total: 0, dirty: 0, errCount: 0 };
  cellInfo[cell].total++;
}
for (const [cell, parts] of Object.entries(cellErrors)) {
  for (const p of parts) {
    cellInfo[cell].dirty++;
    cellInfo[cell].errCount += p.hits.length;
  }
}

console.log('── RESUMEN POR CELDA ──────────────────────────────────────────────────────');
for (const [cell, info] of Object.entries(cellInfo).sort(([a], [b]) => a.localeCompare(b))) {
  const clean = info.total - info.dirty;
  const flag  = info.dirty > 0 ? '⚠ ' : '✓ ';
  console.log(
    `  ${flag}${cell.padEnd(16)} ${String(info.total).padStart(2)} partes` +
    `  ${String(info.dirty).padStart(2)} con errores` +
    `  ${String(clean).padStart(2)} limpias` +
    `  ${String(info.errCount).padStart(3)} palabras`
  );
}

// Dirty detail
if (dirtyParts.length > 0) {
  console.log('\n── ERRORES DETALLADOS ─────────────────────────────────────────────────────');
  for (const { cell, partId, hits } of dirtyParts.sort((a, b) => a.cell.localeCompare(b.cell))) {
    console.log(`\n  [${cell}] ${partId}  (${hits.length} error${hits.length > 1 ? 'es' : ''})`);
    // deduplicate by word to avoid noise from repeated signTexts
    const seen = new Set();
    for (const h of hits) {
      const key = `${h.word}@${h.ctx.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    "${h.word}" → "${h.fix}"`);
      console.log(`    ctx: ...${h.ctx}...`);
      console.log(`    campo: ${h.field}`);
    }
  }
}

// Clean parts — exam candidates
console.log('\n── PARTES 100% LIMPIAS — candidatas para examen ─────────────────────────');
const byCell = {};
for (const { cell, partId } of cleanParts) {
  if (!byCell[cell]) byCell[cell] = [];
  byCell[cell].push(partId);
}
for (const [cell, ids] of Object.entries(byCell).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${cell} (${ids.length}): ${ids.join(' · ')}`);
}
console.log('');
