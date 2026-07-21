/**
 * Manual evidence script: EN vs ES consistency across vocab modules (UI strings + hintLang).
 * Run: node scripts/test-vocab-ui-lang.mjs
 */
import { vocabModuleStrings, resolveVocabUiLang } from '../js/i18n/vocabModuleLocale.js';

const mock = { store: new Map() };
global.localStorage = {
  getItem: (k) => mock.store.get(k) ?? null,
  setItem: (k, v) => mock.store.set(k, String(v)),
};

function sample(module, lang) {
  mock.store.set('lc_ui_lang', lang);
  const ui = vocabModuleStrings(resolveVocabUiLang());
  const hintLang = resolveVocabUiLang();
  switch (module) {
    case 'quiz':
      return {
        hintLang,
        prog: ui.questionOf(2, 10),
        prompt: ui.whichWord,
        feedback: ui.correct,
        hintLabel: ui.synonym,
      };
    case 'flashcards':
      return { hintLang, srs: [ui.again, ui.hard, ui.good, ui.easy], card: ui.cardOf(1, 5) };
    case 'phrases':
      return { hintLang, gap: ui.completePhrase, order: ui.putInOrder, ok: ui.perfectOrder };
    case 'listening':
      return { hintLang, title: ui.listeningTitle, intro: ui.listeningIntroMono.slice(0, 48) + '…' };
    default:
      return {};
  }
}

const modules = ['quiz', 'flashcards', 'phrases', 'listening'];
console.log('=== Vocab UI lang matrix (lc_ui_lang drives UI + AI hintLang) ===\n');
for (const lang of ['en', 'es']) {
  console.log(`--- ${lang.toUpperCase()} ---`);
  for (const m of modules) {
    console.log(`  ${m}:`, JSON.stringify(sample(m, lang)));
  }
  console.log('');
}
