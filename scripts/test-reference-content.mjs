#!/usr/bin/env node
/** Vocabulary & phrases loaders + reference view helpers. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ok(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function mountFetch(contentType) {
  const base = path.join(ROOT, 'content', contentType);
  globalThis.fetch = async (url) => {
    const u = String(url);
    let rel = null;
    if (u.includes(`content/${contentType}/`)) {
      rel = u.split(`content/${contentType}/`)[1];
    }
    if (!rel) return { ok: false, json: async () => null };
    const file = path.join(base, rel.replace(/\//g, path.sep));
    if (!fs.existsSync(file)) return { ok: false, json: async () => null };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
}

function loadContentLoaderFactory() {
  const src = fs.readFileSync(path.join(ROOT, 'js/library/contentLoader.js'), 'utf8');
  const sandbox = { module: { exports: {} }, createContentLoader: null };
  vm.runInContext(src + '\ncreateContentLoader = module.exports.createContentLoader;', vm.createContext(sandbox));
  return sandbox.createContentLoader || sandbox.module.exports.createContentLoader;
}

function loadGrammarViewHelpers() {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/grammar/grammarView.js'), 'utf8');
  const start = src.indexOf('function grammarEsc');
  const end = src.indexOf('function renderToolbar');
  const block = src.slice(start, end);
  const sandbox = { GrammarView: {}, _state: { contentType: 'vocabulary' } };
  vm.createContext(sandbox);
  vm.runInContext(
    `${block}
function renderVocabItem(item, query) {
  return '<div class="ref-item-card">' + item.word + '</div>';
}
function renderPhraseItem(item, query) {
  return '<div class="ref-item-card">' + item.phrase + '</div>';
}
function renderItemsSection(section, query) {
  return '<section id="grammar-' + section.id + '"><h2>' + section.title + '</h2></section>';
}
function renderBlock() { return ''; }
function renderSection(section, query) {
  if (section.items?.length) return renderItemsSection(section, query);
  return '';
}
function renderGrammarDocument(doc, query) {
  if (!doc?.sections) return '';
  const q = String(query || '').trim();
  let sections = doc.sections;
  if (q.length >= 2) sections = sections.filter((s) => sectionMatches(s, q));
  return sections.map((s) => renderSection(s, q)).join('');
}
`,
    sandbox,
  );
  return sandbox;
}

const createContentLoader = loadContentLoaderFactory();
const VocabularyLoader = createContentLoader({
  contentType: 'vocabulary',
  bases: ['content/vocabulary'],
  defaultManifest: { metaLanguages: ['en', 'es'], defaultMetaLanguage: 'en', published: {} },
});
const PhrasesLoader = createContentLoader({
  contentType: 'phrases',
  bases: ['content/phrases'],
  defaultManifest: { metaLanguages: ['en', 'es'], defaultMetaLanguage: 'en', published: {} },
});

mountFetch('vocabulary');
const vA2 = await VocabularyLoader.getContent('de', 'A2', 'en');
ok('vocabulary de/en/A2 loads', vA2.status === 'ok' && vA2.doc?.sections?.length >= 5);
ok('vocabulary A2 has items', vA2.doc.sections[0].items?.length >= 8);

VocabularyLoader.resetCache();
const vB1 = await VocabularyLoader.getContent('de', 'B1', 'en');
ok('vocabulary de/en/B1 loads', vB1.status === 'ok');

VocabularyLoader.resetCache();
const vPrep = await VocabularyLoader.getContent('de', 'A1', 'en');
ok('vocabulary A1 draft → coming soon', vPrep.status === 'preparation' && !vPrep.doc);

mountFetch('phrases');
PhrasesLoader.resetCache();
const pA2 = await PhrasesLoader.getContent('de', 'A2', 'es');
ok('phrases de/es/A2 loads', pA2.status === 'ok' && pA2.doc?.sections?.length >= 5);
ok('phrases items have register', pA2.doc.sections[0].items?.[0]?.register);

PhrasesLoader.resetCache();
const pB1 = await PhrasesLoader.getContent('de', 'B1', 'en');
ok('phrases de/en/B1 loads', pB1.status === 'ok');

const gv = loadGrammarViewHelpers();
gv._state.contentType = 'vocabulary';
const html = gv.renderGrammarDocument(vB1.doc, '');
ok('view renders vocabulary sections', html.includes('grammar-umwelt'));

const searched = gv.renderGrammarDocument(vB1.doc, 'Klimawandel');
ok('search filters vocabulary', searched.includes('Klimawandel') && !searched.includes('grammar-arbeit_beruf'));

ok('sectionMatches finds phrase', (() => { gv._state.contentType = 'phrases'; return gv.sectionMatches(pB1.doc.sections[0], 'Meinung'); })());

console.log('\nReference content tests passed.');
