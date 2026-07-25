/**
 * pool-caps-list.mjs
 * List all CHK-14b errors in the pool for human review — no changes applied.
 * Excludes gen-h4-009 (marked for regeneration).
 *
 * Usage: node scripts/pool-caps-list.mjs
 */
import fs from 'fs';
import { decapitalizeMidSentence } from './lib/capitalizeNouns.mjs';

const SKIP_IDS = new Set(['gen-h4-009']);

const POOL_FILE = new URL('../library/reusable-seed/de_B1.json', import.meta.url)
  .pathname.replace(/^\/([A-Za-z]:)/, '$1');

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || []);

function collectTexts(obj, fp, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach((v, i) => collectTexts(v, `${fp}[${i}]`, acc)); return; }
  for (const [k, v] of Object.entries(obj)) {
    const p = `${fp}.${k}`;
    if (typeof v === 'string' && v.length > 4) acc.push({ field: p, text: v });
    else if (v && typeof v === 'object') collectTexts(v, p, acc);
  }
}

function findChangedTokens(orig, result) {
  const re = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
  const tok = (s) => { const a = []; let m; re.lastIndex = 0; while ((m = re.exec(s)) !== null) a.push({ val: m[0], pos: m.index }); return a; };
  const oa = tok(orig), ra = tok(result);
  const hits = [];
  for (let i = 0; i < Math.min(oa.length, ra.length); i++) {
    if (oa[i].val !== ra[i].val) {
      const p = oa[i].pos;
      // Full sentence context: find sentence start and end around the token
      const sentStart = Math.max(0, orig.lastIndexOf('.', p - 1) + 1,
                                     orig.lastIndexOf('!', p - 1) + 1,
                                     orig.lastIndexOf('?', p - 1) + 1);
      const sentEnd = (() => {
        let e = p + oa[i].val.length;
        while (e < orig.length && orig[e] !== '.' && orig[e] !== '!' && orig[e] !== '?') e++;
        return Math.min(orig.length, e + 1);
      })();
      const sentence = orig.slice(sentStart, sentEnd).replace(/\n/g, ' ').trim();
      hits.push({ word: oa[i].val, fix: ra[i].val, sentence });
    }
  }
  return hits;
}

const BAR = '─'.repeat(72);
let errorCount = 0;
let partCount  = 0;

console.log('\n══════════════════════════════════════════════════════════════════════════');
console.log('LISTA COMPLETA DE ERRORES CHK-14b — solo revisión, sin cambios');
console.log('══════════════════════════════════════════════════════════════════════════\n');
console.log('⚠  gen-h4-009 EXCLUIDO (marcado para regeneración — 12 errores en passage.text)\n');

const byCell = {};

for (const rec of records) {
  const partId = rec.id || rec.recordId || '(no-id)';
  if (SKIP_IDS.has(partId)) continue;

  const cell   = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const texts  = [];
  collectTexts(rec, '', texts);

  // Deduplicate hits: same (word, sentence) pair can appear in text+transcript
  const seen = new Map(); // key → {field, word, fix, sentence, fields:[]}
  for (const { field, text } of texts) {
    const { result, count } = decapitalizeMidSentence(text);
    if (count === 0) continue;
    for (const h of findChangedTokens(text, result)) {
      const key = `${h.word}||${h.sentence.slice(0, 60)}`;
      if (seen.has(key)) {
        seen.get(key).fields.push(field);
      } else {
        seen.set(key, { ...h, fields: [field] });
      }
    }
  }

  if (seen.size === 0) continue;

  if (!byCell[cell]) byCell[cell] = [];
  byCell[cell].push({ partId, hits: [...seen.values()] });
  errorCount += seen.size;
  partCount++;
}

for (const [cell, parts] of Object.entries(byCell).sort()) {
  const cellTotal = parts.reduce((s, p) => s + p.hits.length, 0);
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`${cell}  —  ${parts.length} parte(s), ${cellTotal} error(es)`);
  console.log('═'.repeat(72));

  for (const { partId, hits } of parts) {
    console.log(`\n  PARTE: ${partId}`);
    console.log(BAR);
    let n = 1;
    for (const h of hits) {
      const fieldShort = h.fields.join(' + ').replace(/\./g, '').replace(/\[(\d+)\]/g, '[$1]');
      console.log(`  ${String(n++).padStart(2)}. "${h.word}" → "${h.fix}"`);
      console.log(`      Campo(s): ${fieldShort}`);
      if (h.fields.length > 1) console.log(`      ⚑  Duplicado en ${h.fields.length} campos — se corregirá en todos`);
      console.log(`      Frase:    ${h.sentence}`);
    }
  }
}

console.log(`\n${'═'.repeat(72)}`);
console.log(`TOTAL (excluye gen-h4-009): ${errorCount} error(es) únicos en ${partCount} parte(s)`);
console.log('Pendiente de visto bueno antes de aplicar correcciones.');
console.log('═'.repeat(72) + '\n');
