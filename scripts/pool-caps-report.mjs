/**
 * pool-caps-report.mjs — read-only 3-way capitalization report (no pool changes).
 *
 * 1. Nivel 1 fixes decapitalizeMidSentence would apply (by cell)
 * 2. Known gap: ein/eine + Adj.Cap + Noun (not fixed today)
 * 3. Ambiguous Nivel 2: Glaube, Essen, Stimme, Junge, Kochen mid-sentence
 *
 * Usage: node scripts/pool-caps-report.mjs
 */
import fs from 'fs';
import {
  decapitalizeMidSentence,
  NEVER_NOUN_WORDS,
  ADJ_NEEDS_ARTICLE_GUARD,
} from './lib/capitalizeNouns.mjs';

const POOL_FILE = new URL('../library/reusable-seed/de_B1.json', import.meta.url)
  .pathname.replace(/^\/([A-Za-z]:)/, '$1');

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || []);

const AMBIGUOUS = new Set(['glaube', 'essen', 'stimme', 'junge', 'kochen']);
const INDEF_ART = new Set(['ein', 'eine', 'einen', 'einem', 'einer', 'eines']);

const SENTENCE_END_RE =
  /[.!?:]\s*['"„«‚\u2018\u201c\u00ab]?\s*$|[\u2013\u2014–—]\s*$|[„«‚\u2018\u201c\u00ab)]\s*$|(?<!\w)['"]\s*$/;
const TOKEN_RE = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;

function collectTexts(obj, acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) {
    obj.forEach((v) => collectTexts(v, acc));
    return acc;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.length > 4) acc.push(v);
    else if (v && typeof v === 'object') collectTexts(v, acc);
  }
  return acc;
}

function tokenize(text) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });
  }
  return tokens;
}

function isCapWord(val) {
  const fc = val[0];
  return (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';
}

function nextWordToken(tokens, fromIdx) {
  for (let j = fromIdx; j < tokens.length; j++) {
    if (tokens[j].isWord) return tokens[j];
  }
  return null;
}

function findChanged(orig, result) {
  const oa = tokenize(orig);
  const ra = tokenize(result);
  const hits = [];
  for (let i = 0; i < Math.min(oa.length, ra.length); i++) {
    if (oa[i].val !== ra[i].val) {
      const p = oa[i].pos;
      hits.push({
        word: oa[i].val,
        fix: ra[i].val,
        ctx: orig.slice(Math.max(0, p - 30), p + oa[i].val.length + 30).replace(/\n/g, ' '),
      });
    }
  }
  return hits;
}

function scanGapAndAmbiguous(text) {
  const tokens = tokenize(text);
  const gaps = [];
  const amb = [];
  let prevContent = '';
  let lastWord = '';

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.isWord) {
      prevContent += tok.val;
      continue;
    }

    if (isCapWord(tok.val)) {
      const lc = tok.val.toLowerCase();
      const mid = prevContent.length > 0 && !SENTENCE_END_RE.test(prevContent);

      if (mid && AMBIGUOUS.has(lc)) {
        amb.push({
          word: tok.val,
          lc,
          lastWord,
          ctx: text.slice(Math.max(0, tok.pos - 30), tok.pos + tok.val.length + 30).replace(/\n/g, ' '),
        });
      }

      if (mid && ADJ_NEEDS_ARTICLE_GUARD.has(lc) && INDEF_ART.has(lastWord.toLowerCase())) {
        const nxt = nextWordToken(tokens, i + 1);
        if (nxt && isCapWord(nxt.val) && !NEVER_NOUN_WORDS.has(nxt.val.toLowerCase())) {
          gaps.push({
            word: tok.val,
            fix: lc,
            article: lastWord,
            noun: nxt.val,
            ctx: text
              .slice(Math.max(0, tok.pos - 25), nxt.pos + nxt.val.length + 15)
              .replace(/\n/g, ' '),
          });
        }
      }
    }

    prevContent += tok.val;
    lastWord = tok.val;
  }
  return { gaps, amb };
}

const l1PartsByCell = {};
const l1HitsByCell = {};
let l1PartsTotal = 0;
let l1HitsTotal = 0;

const gapCases = [];
const gapParts = new Set();
const gapByCell = {};

const ambCases = [];
const ambParts = new Set();
const ambByCell = {};

for (const rec of records) {
  const cell = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const partId = rec.id || rec.recordId || '(no-id)';
  const texts = collectTexts(rec);

  const seenL1 = new Set();
  let partL1Hits = 0;

  const seenGap = new Set();
  const seenAmb = new Set();

  for (const text of texts) {
    const { result, count } = decapitalizeMidSentence(text);
    if (count > 0) {
      for (const h of findChanged(text, result)) {
        const key = `${h.word}|${h.ctx.slice(0, 50)}`;
        if (!seenL1.has(key)) {
          seenL1.add(key);
          partL1Hits++;
          l1HitsTotal++;
        }
      }
    }

    const { gaps, amb } = scanGapAndAmbiguous(text);
    for (const g of gaps) {
      const key = `${g.word}|${g.noun}|${g.ctx.slice(0, 50)}`;
      if (!seenGap.has(key)) {
        seenGap.add(key);
        gapCases.push({ cell, partId, ...g });
        gapParts.add(partId);
        gapByCell[cell] = (gapByCell[cell] || 0) + 1;
      }
    }
    for (const a of amb) {
      const key = `${a.word}|${a.ctx.slice(0, 50)}`;
      if (!seenAmb.has(key)) {
        seenAmb.add(key);
        ambCases.push({ cell, partId, ...a });
        ambParts.add(partId);
        ambByCell[cell] = (ambByCell[cell] || 0) + 1;
      }
    }
  }

  if (partL1Hits > 0) {
    l1PartsTotal++;
    l1PartsByCell[cell] = (l1PartsByCell[cell] || 0) + 1;
    l1HitsByCell[cell] = (l1HitsByCell[cell] || 0) + partL1Hits;
  }
}

const BAR = '═'.repeat(72);
console.log(`\n${BAR}`);
console.log('POOL CAPS REPORT (read-only) · Nivel 1 decap actual · sin cambios');
console.log(`Pool: ${records.length} partes`);
console.log(BAR);

console.log('\n── 1. NIVEL 1 CORREGIRÍA (decapitalizeMidSentence) ──');
console.log(`  Partes: ${l1PartsTotal}`);
console.log(`  Casos (tokens únicos por parte/campo): ${l1HitsTotal}`);
console.log('  Por celda (partes | casos):');
for (const cell of Object.keys(l1PartsByCell).sort()) {
  console.log(
    `    ${cell.padEnd(14)} ${String(l1PartsByCell[cell]).padStart(3)} partes | ${String(l1HitsByCell[cell]).padStart(4)} casos`,
  );
}

console.log('\n── 2. HUECO ein/eine + Adj.Cap + Noun (NO corregido) ──');
console.log(`  Casos: ${gapCases.length}`);
console.log(`  Partes: ${gapParts.size}`);
console.log('  Por celda (casos):');
for (const cell of Object.keys(gapByCell).sort()) {
  console.log(`    ${cell.padEnd(14)} ${gapByCell[cell]}`);
}
if (gapCases.length) {
  console.log('  Ejemplos:');
  for (const g of gapCases.slice(0, 10)) {
    console.log(`    [${g.cell}] ${g.article} ${g.word} ${g.noun}  …${g.ctx}…`);
  }
}

console.log('\n── 3. AMBIGUOS Nivel 2 (Glaube/Essen/Stimme/Junge/Kochen) ──');
console.log(`  Casos mid-sentence: ${ambCases.length}`);
console.log(`  Partes: ${ambParts.size}`);
console.log('  Por celda (casos):');
for (const cell of Object.keys(ambByCell).sort()) {
  console.log(`    ${cell.padEnd(14)} ${ambByCell[cell]}`);
}
const ambByWord = {};
for (const a of ambCases) ambByWord[a.lc] = (ambByWord[a.lc] || 0) + 1;
console.log('  Por palabra:', ambByWord);
if (ambCases.length) {
  console.log('  Ejemplos:');
  for (const a of ambCases.slice(0, 12)) {
    console.log(`    [${a.cell}] ${a.word}  …${a.ctx}…`);
  }
}
console.log('');
