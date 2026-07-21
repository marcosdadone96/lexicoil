#!/usr/bin/env node
/**
 * Session smoke: separables, 4-lang translate, articles + AI gender fallback.
 * Run: $env:NODE_OPTIONS="--use-system-ca"; node scripts/smoke-translations-articles-session.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VOCAB_TEST_BASE || 'http://127.0.0.1:8888';

const { freeTranslate, isJunkTranslation, resolveGermanGender } = require(
  path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'),
);
const SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));

const ctx = { console, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
const ManualVocab = ctx.ManualVocab || ctx.window?.ManualVocab;
const ArticleLexicon = ctx.ArticleLexicon || ctx.window?.ArticleLexicon;
ArticleLexicon.loadSync(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8')),
);

const report = { runAt: new Date().toISOString(), base: BASE, cases: [] };

function row(id, ok, detail) {
  report.cases.push({ id, ok, ...detail });
  console.log(`${ok ? '✅' : '❌'} ${id}:`, JSON.stringify(detail));
}

async function vocabCache(from, to, text, context = '') {
  const params = new URLSearchParams({ from, to, text });
  if (context) params.set('context', context.slice(0, 500));
  const res = await fetch(`${BASE}/.netlify/functions/vocab-cache?${params}`);
  return res.json().catch(() => ({}));
}

async function genderApi(word) {
  const params = new URLSearchParams({ action: 'gender', from: 'de', text: word });
  const res = await fetch(`${BASE}/.netlify/functions/vocab-cache?${params}`);
  return res.json().catch(() => ({}));
}

// ── (a) Separable reunify + translation ──
const ctxAn = 'Das neue Programm bietet kostenlose Kurse in Parks an.';
const reun = SeparableResolve.resolveForSave('bietet', ctxAn);
const enGloss = SeparableResolve.localGloss(reun.word, 'en', 'de');
row('1a-separable-reunify', reun.word === 'anbieten' && reun.reunified, {
  surface: 'bietet',
  lemma: reun.word,
  reunified: reun.reunified,
  enLocal: enGloss?.translation_en || null,
});

// ── (b) 4 languages, anti-spam ──
const langs = ['en', 'es', 'fr', 'it'];
const ctxB = ctxAn;
let serverOk = false;
try {
  const ping = await fetch(`${BASE}/`);
  serverOk = ping.ok || ping.status === 404;
} catch (_) {
  serverOk = false;
}

for (const to of langs) {
  let translation = null;
  let source = null;
  if (serverOk) {
    const hit = await vocabCache('de', to, 'anbieten', ctxB);
    translation = hit.translation || null;
    source = hit.source || (hit.found ? 'cache' : hit.reason);
  } else {
    const hit = await freeTranslate('anbieten', 'de', to, ctxB);
    translation = hit.translation;
    source = hit.source || hit.reason;
  }
  const junk = isJunkTranslation(translation);
  row(`1b-translate-${to}`, !!translation && !junk, { translation, source, junk });
}

// ── (c) Lexicon articles ──
for (const [word, expectArt] of [
  ['Vorschlag', 'der'],
  ['Küche', 'die'],
]) {
  const fc = { word, translations: { en: 'x' } };
  ManualVocab.enrichFlashcard(fc, 'de');
  row(`1c-article-${word.toLowerCase()}`, fc.article === expectArt, {
    word: fc.word,
    article: fc.article,
    gender: fc.gender,
    lexicon: ArticleLexicon.lookupGender(word, 'de'),
  });
}

// ── (d) AI gender safety net (rare noun) ──
const rare = 'Glasfaserkabelkanal';
const lexHit = ArticleLexicon.lookupGender(rare, 'de');
let aiArticle = null;
let aiSource = null;
if (serverOk) {
  const g = await genderApi(rare);
  aiArticle = g.article;
  aiSource = g.source || g.reason;
} else {
  const g = await resolveGermanGender(rare);
  aiArticle = g.article;
  aiSource = g.source || g.reason;
}
const fcRare = { word: rare, translations: { en: 'desk lamp' } };
ManualVocab.enrichFlashcard(fcRare, 'de');
const needsAi = ManualVocab.needsAiGenderFallback(fcRare, 'de');
row('1d-ai-gender-rare', !lexHit && needsAi && /^(der|die|das)$/.test(aiArticle || ''), {
  word: rare,
  lexiconBefore: lexHit,
  needsAiFallback: needsAi,
  aiArticle,
  aiSource,
  expected: 'der (compuesto; DWDS: der Kabelkanal / der Kanal)',
});

const outPath = path.join(ROOT, 'batches/ready/gate-logs/smoke-translations-articles-2026-07-13.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('\nReport:', outPath);
const failed = report.cases.filter((c) => !c.ok).length;
if (failed) process.exit(1);
