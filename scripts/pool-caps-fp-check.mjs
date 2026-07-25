/**
 * pool-caps-fp-check.mjs
 * Pre-fix diagnostic: identify which of the current CHK-14b "errors" are
 * false positives because the preceding token is a prep-article contraction
 * (im, am, beim, vom, zum, zur, ins, ans, …) that signals substantivisation.
 *
 * Usage: node scripts/pool-caps-fp-check.mjs
 */
import fs from 'fs';
import { NEVER_NOUN_WORDS, ADJ_NEEDS_ARTICLE_GUARD } from './lib/capitalizeNouns.mjs';

const POOL_FILE = new URL('../library/reusable-seed/de_B1.json', import.meta.url)
  .pathname.replace(/^\/([A-Za-z]:)/, '$1');

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || []);

// ── constants mirrored from capitalizeNouns.mjs ───────────────────────────────

const KNOWN_ARTICLES = new Set([
  'das','dem','des','die','der','den',
  'ein','eine','einem','einer','eines','einen',
  'kein','keine','keinem','keiner','keines','keinen',
  'dieses','diese','diesem','diesen',
  'jenes','jene','jenem','jenen',
  'welches','welche','welchem','welchen',
  'manches','manche','manchem','manchen',
  'solches','solche','solchem','solchen',
  'etwas','nichts','alles','vieles','weniges',
  'als',
]);

// Contractions missing from current guard — the FP candidates
const CONTRACTIONS = new Set([
  'im',   // in dem
  'am',   // an dem  (also used adverbially, flagged separately)
  'beim', // bei dem
  'vom',  // von dem
  'zum',  // zu dem
  'zur',  // zu der
  'ins',  // in das
  'ans',  // an das
  'aufs', // auf das
  'ums',  // um das
  'fürs', // für das
  'durchs','hinters','übers','unters','vors',
]);

const SENTENCE_END_RE = /[.!?:]\s*$/;

function collectTexts(obj, fp, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach((v,i) => collectTexts(v, `${fp}[${i}]`, acc)); return; }
  for (const [k, v] of Object.entries(obj)) {
    const p = `${fp}.${k}`;
    if (typeof v === 'string' && v.length > 4) acc.push({ field: p, text: v });
    else if (v && typeof v === 'object') collectTexts(v, p, acc);
  }
}

// Scan a text and return every capitalised NEVER_NOUN_WORDS token found mid-sentence,
// together with the immediately preceding word token and a classification.
function scanText(text) {
  const re = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(text)) !== null) tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });

  const hits = [];
  let prevContent = '';
  let lastWord    = '';

  for (const tok of tokens) {
    if (!tok.isWord) { prevContent += tok.val; continue; }

    const fc = tok.val[0];
    const isCap = (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';

    if (isCap) {
      const lc = tok.val.toLowerCase();
      const midSentence = prevContent.length > 0 && !SENTENCE_END_RE.test(prevContent);

      if (midSentence && ADJ_NEEDS_ARTICLE_GUARD.has(lc)) {
        const prevLc = lastWord.toLowerCase();
        const byArticle     = KNOWN_ARTICLES.has(prevLc);
        const byContraction = CONTRACTIONS.has(prevLc);
        const ctx = text.slice(Math.max(0, tok.pos - 35), tok.pos + tok.val.length + 35)
                        .replace(/\n/g, ' ');

        let classification;
        if (byArticle)     classification = 'ALREADY_GUARDED';   // existing code handles
        else if (byContraction) classification = 'FP_CONTRACTION'; // new FP
        else               classification = 'TRUE_ERROR';

        hits.push({ word: tok.val, fix: lc, prevWord: lastWord, classification, ctx });
      }
    }

    prevContent += tok.val;
    lastWord     = tok.val;
  }
  return hits;
}

// ── scan ─────────────────────────────────────────────────────────────────────

const allHits = { ALREADY_GUARDED: [], FP_CONTRACTION: [], TRUE_ERROR: [] };

for (const rec of records) {
  const cell   = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const partId = rec.id || rec.recordId || '(no-id)';
  const texts  = [];
  collectTexts(rec, '', texts);

  for (const { field, text } of texts) {
    for (const hit of scanText(text)) {
      allHits[hit.classification].push({ cell, partId, field, ...hit });
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────────

const BAR = '═'.repeat(72);
console.log(`\n${BAR}`);
console.log('FP PRE-CHECK — contracciones preposicionales como article guard');
console.log(BAR);

const fp  = allHits.FP_CONTRACTION;
const err = allHits.TRUE_ERROR;
const ok  = allHits.ALREADY_GUARDED;

console.log(`\n  ALREADY_GUARDED (artículo explícito, código actual ya los protege): ${ok.length}`);
console.log(`  FP_CONTRACTION  (contracción im/am/zum/…, son SUSTANTIVACIONES reales): ${fp.length}`);
console.log(`  TRUE_ERROR      (sin artículo ni contracción, capitalización errónea):  ${err.length}`);
console.log(`  TOTAL detectado por ADJ_NEEDS_ARTICLE_GUARD:                           ${ok.length + fp.length + err.length}\n`);

if (fp.length > 0) {
  console.log('── FALSOS POSITIVOS por contracción (NO tocar) ───────────────────────────');
  for (const h of fp) {
    console.log(`  [${h.cell}] ${h.partId}`);
    console.log(`    "${h.prevWord} ${h.word}" → debería QUEDAR en mayúscula`);
    console.log(`    ctx: ...${h.ctx}...`);
    console.log(`    campo: ${h.field}\n`);
  }
}

if (err.length > 0) {
  console.log('── ERRORES REALES (sin artículo ni contracción, se pueden corregir) ─────');
  const byCell = {};
  for (const h of err) {
    if (!byCell[h.cell]) byCell[h.cell] = [];
    byCell[h.cell].push(h);
  }
  for (const [cell, hits] of Object.entries(byCell).sort()) {
    console.log(`\n  ${cell}:`);
    const seen = new Set();
    for (const h of hits) {
      const key = `${h.partId}|${h.word}|${h.ctx.slice(0,25)}`;
      if (seen.has(key)) continue; seen.add(key);
      console.log(`    [${h.partId.slice(-12)}] prev="${h.prevWord}" → "${h.word}" en "${h.ctx.slice(0,60)}"`);
    }
  }
}
console.log('');
