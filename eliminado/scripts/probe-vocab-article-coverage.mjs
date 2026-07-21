#!/usr/bin/env node
/**
 * Probe article/gender coverage for nouns in a flashcard list (localStorage export or inline JSON).
 * Usage: node scripts/probe-vocab-article-coverage.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ctx = { console, window: {} };
vm.createContext(ctx);
vm.runInContext(
  require('fs').readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'),
  ctx,
);
vm.runInContext(
  require('fs').readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'),
  ctx,
);
const ManualVocab = ctx.ManualVocab || ctx.window?.ManualVocab;
const ArticleLexicon = ctx.ArticleLexicon || ctx.window?.ArticleLexicon;
ArticleLexicon.loadSync(
  JSON.parse(require('fs').readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8')),
);

// Operator screenshot sample (16 words — 3 visible + typical deck mix)
const SAMPLE = [
  { word: 'Schüler', translations: { en: 'student' }, manual: true },
  { word: 'Waschen', translations: { en: 'washing' }, manual: true },
  { word: 'abnimmt', translations: { en: 'decreases' } },
  { word: 'Gerät', translations: { en: 'device' } },
  { word: 'Geräten', translations: { en: 'devices' }, surface: 'Geräten' },
  { word: 'Unterschied', translations: { en: 'difference' } },
  { word: 'Freund', translations: { en: 'friend' } },
  { word: 'Freundin', translations: { en: 'friend (f)' } },
  { word: 'Haus', translations: { en: 'house' } },
  { word: 'Küche', translations: { en: 'kitchen' } },
  { word: 'anbieten', translations: { en: 'to offer' } },
  { word: 'Vorschlag', translations: { en: 'suggestion' } },
  { word: 'Museum', translations: { en: 'museum' } },
  { word: 'Wochenende', translations: { en: 'weekend' } },
  { word: 'Bus', translations: { en: 'bus' } },
  { word: 'Pizza', translations: { en: 'pizza' } },
];

function articleLabel(fc) {
  const g = fc.gender || fc.article || '';
  if (g === 'm' || g === 'der') return 'der';
  if (g === 'f' || g === 'die') return 'die';
  if (g === 'n' || g === 'das') return 'das';
  return null;
}

function runProbe(words) {
  const rows = [];
  let nounCount = 0;
  let nounWithArticle = 0;
  let nounMissing = 0;

  for (const raw of words) {
    const fc = JSON.parse(JSON.stringify(raw));
    ManualVocab.enrichFlashcard(fc, 'de');
    const pos = fc.type || fc.pos || 'other';
    const art = articleLabel(fc);
    const inLex = ArticleLexicon?.lookupGender
      ? ArticleLexicon.lookupGender(fc.word, 'de')
      : null;
    rows.push({
      word: fc.word,
      pos,
      gender: fc.gender || null,
      article: art,
      lexiconHit: inLex,
      manual: !!raw.manual,
    });
    if (pos === 'noun') {
      nounCount++;
      if (art) nounWithArticle++;
      else nounMissing++;
    }
  }

  return { rows, nounCount, nounWithArticle, nounMissing, total: words.length };
}

const { rows, nounCount, nounWithArticle, nounMissing, total } = runProbe(SAMPLE);

console.log('\n── Article probe (sample deck, enrichFlashcard path) ──\n');
for (const r of rows) {
  const flag = r.pos === 'noun' ? (r.article ? 'OK' : 'MISSING') : '—';
  console.log(
    `${flag.padEnd(8)} ${r.word.padEnd(14)} ${String(r.pos).padEnd(10)} art=${r.article || '—'} lex=${r.lexiconHit || '—'}`,
  );
}
console.log(`\nTotal: ${total} | Nouns: ${nounCount} | With article: ${nounWithArticle} | Missing: ${nounMissing}`);
