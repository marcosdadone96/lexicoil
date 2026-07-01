/**
 * Article + spelling suggestion tests.
 * Run: node scripts/test-noun-articles.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(rel, extra = {}) {
  const code = readFileSync(join(root, rel), 'utf8');
  const ctx = { window: {}, console, ...extra };
  ctx.window = ctx;
  vm.runInNewContext(code, ctx);
  return ctx;
}

function normWordType(t) {
  const m = { noun: 'noun', verb: 'verb', n: 'noun', v: 'verb' };
  return m[String(t || '').toLowerCase()] || String(t || '').toLowerCase();
}

const lexCtx = load('js/data/articleLexicon.js', { normWordType });
const AL = lexCtx.ArticleLexicon;

const cases = [
  ['Menschen', 'de', 'die', true],
  ['Mädchen', 'de', 'das', false],
  ['Häuser', 'de', 'die', true],
  ['Gemüseauflauf', 'de', 'der', false],
  ['Ernährung', 'de', 'die', false],
];

for (const [word, lang, article, plural] of cases) {
  const hit = AL.lookupArticle(word, lang);
  if (!hit || hit.article !== article) {
    throw new Error(`${word} expected ${article}, got ${hit?.article}`);
  }
  if (!!hit.plural !== plural) {
    throw new Error(`${word} plural=${hit.plural} expected ${plural}`);
  }
}

const fc = { word: 'Menschen', type: 'noun', gender: 'n', article: 'das', sourceLang: 'de' };
AL.applyToFlashcard(fc, 'de');
if (fc.article !== 'die' || !fc.plural) {
  throw new Error(`applyToFlashcard did not fix Menschen: ${fc.article} plural=${fc.plural}`);
}

console.log('test-noun-articles.mjs: all passed');
