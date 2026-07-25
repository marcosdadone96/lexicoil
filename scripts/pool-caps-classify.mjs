/**
 * pool-caps-classify.mjs — classify each detected error as TRUE or FP.
 *
 * FP reasons:
 *   QUOTE_OR_DASH  – word immediately follows opening quote or dialogue dash
 *   LIST_MARKER    – word immediately follows a list option (a), b), 1., …)
 *   PREP_SUBST     – word follows a preposition that substantivises it
 *                    (für Neues, nach Gutem, …)
 */
import fs from 'fs';
import { decapitalizeMidSentence, ADJ_NEEDS_ARTICLE_GUARD } from './lib/capitalizeNouns.mjs';

const SKIP_IDS = new Set(['gen-h4-009']);

const POOL_FILE = new URL('../library/reusable-seed/de_B1.json', import.meta.url)
  .pathname.replace(/^\/([A-Za-z]:)/, '$1');

const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
const records = Array.isArray(pool) ? pool : (pool.records || []);

// ── FP classification helpers ─────────────────────────────────────────────────

// Characters that START a new clause that the current SENTENCE_END_RE misses
const OPEN_QUOTE_CHARS = new Set([
  '\u2013','\u2014',              // – —  (en/em dash, dialogue turns)
  '\u201e','\u00ab','\u201a',    // „ « ‚  (German/French opening quotes)
  '\u2018','\u201c','\u00bb',    // ' " »  (other opening quotes)
  "'", '"',                       // ASCII straight quotes
  '(',                            // parenthetical
]);

// Prepositions (uncontracted) that can substantivise an adjective WITHOUT an article
// e.g. "offen für Neues", "nach Gutem streben", "mit Neuem beginnen"
const SUBST_PREPS = new Set([
  'für','nach','mit','ohne','durch','über','unter','vor','hinter',
  'neben','zwischen','gegen','um','trotz','wegen','statt','dank',
]);

function lastNonSpaceChar(str) {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] !== ' ' && str[i] !== '\t' && str[i] !== '\n' && str[i] !== '\r') return str[i];
  }
  return '';
}

function classifyHit(prevContent, lastWord) {
  const lastCh = lastNonSpaceChar(prevContent);
  const lw     = (lastWord || '').toLowerCase();

  if (OPEN_QUOTE_CHARS.has(lastCh))  return 'QUOTE_OR_DASH';
  if (/[a-zA-Z0-9][).]$/.test(prevContent.trimEnd())) return 'LIST_MARKER';
  if (SUBST_PREPS.has(lw))           return 'PREP_SUBST';
  return null;
}

// ── Scanner (mirrors decapitalizeMidSentence logic exactly) ───────────────────

const SENT_END_RE = /[.!?:]\s*$/;
const TOKEN_RE    = /([A-Za-zÄÖÜäöüß]+)|([^A-Za-zÄÖÜäöüß]+)/g;
import { NEVER_NOUN_WORDS, PURE_ADVERBS } from './lib/capitalizeNouns.mjs';

const PURE_ADVERBS_SET = PURE_ADVERBS;

const SUBSTANTIVISING_ARTICLES = new Set([
  'das','dem','des','die','der','den',
  'ein','eine','einem','einer','eines','einen',
  'kein','keine','keinem','keiner','keines','keinen',
  'dieses','diese','diesem','diesen','jenes','jene','jenem','jenen',
  'welches','welche','welchem','welchen',
  'manches','manche','manchem','manchen','solches','solche','solchem','solchen',
  'etwas','nichts','alles','vieles','weniges','als',
  'im','am','beim','vom','zum','zur','ins','ans','aufs','ums','fürs',
]);

function scanText(text) {
  const tokens = []; let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) tokens.push({ val: m[0], isWord: !!m[1], pos: m.index });

  const hits = [];
  let prevContent = '', lastWord = '';

  for (const tok of tokens) {
    if (!tok.isWord) { prevContent += tok.val; continue; }
    const fc  = tok.val[0];
    const cap = (fc >= 'A' && fc <= 'Z') || fc === 'Ä' || fc === 'Ö' || fc === 'Ü';

    if (cap) {
      const lc  = tok.val.toLowerCase();
      const mid = prevContent.length > 0 && !SENT_END_RE.test(prevContent);
      if (mid && NEVER_NOUN_WORDS.has(lc)) {
        const prevLc = lastWord.toLowerCase();
        const isPureAdv = PURE_ADVERBS_SET.has(lc);
        const isArticle = SUBSTANTIVISING_ARTICLES.has(prevLc);
        // Would decapitalizer change it?
        const wouldChange = isPureAdv || (!isArticle && ADJ_NEEDS_ARTICLE_GUARD.has(lc));
        if (wouldChange) {
          const fpReason = classifyHit(prevContent, lastWord);
          const sentS = Math.max(0,
            text.lastIndexOf('.', tok.pos-1)+1, text.lastIndexOf('!', tok.pos-1)+1,
            text.lastIndexOf('?', tok.pos-1)+1);
          let sentE = tok.pos + tok.val.length;
          while (sentE < text.length && !['.','!','?'].includes(text[sentE])) sentE++;
          const sentence = text.slice(sentS, sentE+1).replace(/\n/g,' ').trim();
          hits.push({ word: tok.val, fix: lc, lastWord, lastChar: lastNonSpaceChar(prevContent), fpReason, sentence });
        }
      }
    }

    prevContent += tok.val;
    lastWord = tok.val;
  }
  return hits;
}

// ── collect ───────────────────────────────────────────────────────────────────

function collectTexts(obj, fp, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach((v, i) => collectTexts(v, `${fp}[${i}]`, acc)); return; }
  for (const [k, v] of Object.entries(obj)) {
    const p = `${fp}.${k}`;
    if (typeof v === 'string' && v.length > 4) acc.push({ field: p, text: v });
    else if (v && typeof v === 'object') collectTexts(v, p, acc);
  }
}

const allHits = [];

for (const rec of records) {
  const partId = rec.id || rec.recordId || '(no-id)';
  if (SKIP_IDS.has(partId)) continue;
  const cell  = `${rec.module || '?'} T${rec.teil ?? '?'}`;
  const texts = [];
  collectTexts(rec, '', texts);

  const seen = new Map();
  for (const { field, text } of texts) {
    for (const h of scanText(text)) {
      const key = `${h.word}||${h.sentence.slice(0,60)}`;
      if (!seen.has(key)) seen.set(key, { ...h, fields: [field], cell, partId });
      else seen.get(key).fields.push(field);
    }
  }
  for (const v of seen.values()) allHits.push(v);
}

// ── report ────────────────────────────────────────────────────────────────────

const trueErrors = allHits.filter(h => !h.fpReason);
const fps        = allHits.filter(h =>  h.fpReason);
const fpByType   = type => fps.filter(f => f.fpReason === type);

console.log('\n══════════════════════════════════════════════════════════════════════════');
console.log('CLASIFICACIÓN DE ERRORES CHK-14b  (excluye gen-h4-009)');
console.log('══════════════════════════════════════════════════════════════════════════\n');
console.log(`  Total detectado:          ${allHits.length}`);
console.log(`  TRUE_ERROR (corregibles): ${trueErrors.length}`);
console.log(`  FALSO_POSITIVO (NO tocar): ${fps.length}`);
console.log(`    QUOTE_OR_DASH (inicio cita/diálogo):  ${fpByType('QUOTE_OR_DASH').length}`);
console.log(`    LIST_MARKER   (primer palabra opción): ${fpByType('LIST_MARKER').length}`);
console.log(`    PREP_SUBST    (sustantivación tras prep): ${fpByType('PREP_SUBST').length}`);

console.log('\n── TRUE ERRORS ─────────────────────────────────────────────────────────────');
if (trueErrors.length === 0) {
  console.log('  (ninguno)');
} else {
  for (const h of trueErrors) {
    console.log(`\n  [${h.cell}] ${h.partId}`);
    console.log(`    "${h.word}" → "${h.fix}"  |  prev="${h.lastWord}"  lastChar='${h.lastChar}'`);
    console.log(`    Frase: ${h.sentence.slice(0,110)}`);
    if (h.fields.length > 1) console.log(`    ⚑ campos: ${h.fields.join(' + ')}`);
  }
}

console.log('\n── FALSOS POSITIVOS ────────────────────────────────────────────────────────');
for (const h of fps) {
  const short = h.sentence.slice(0,90);
  console.log(`  [${h.fpReason}] "${h.word}" | prev="${h.lastWord}" char='${h.lastChar}' | ${short}`);
}
console.log('');
