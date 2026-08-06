/**
 * Unified UI/translation language — regression matrix (EN/ES/FR/IT).
 * Simulates pagato bug: lc_ui_lang=en but stale S.vocabLang=it must not win.
 * Run: node scripts/test-ui-lang-unified.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

global.VOCAB_UI_LANG_CODES = ['en', 'es', 'fr', 'it'];
global.clampVocabUiLang = (code, fb = 'en') => {
  const c = String(code || '').toLowerCase();
  return VOCAB_UI_LANG_CODES.includes(c) ? c : fb;
};
global.S = { ui: 'en', fcLang: 'en', vocabLang: 'it', subject: 'de', vocabCache: {} };

const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
};

const VM = require(path.join(ROOT, 'js/i18n/vocabModuleLocale.js'));

function vocabTranslationOf(data, lang) {
  const tk = `translation_${lang}`;
  return String(data[tk] || data.translation_en || '').trim();
}

const bezahlt = {
  word: 'bezahlt',
  translation_en: 'paid',
  translation_es: 'pagado',
  translation_fr: 'payé',
  translation_it: 'pagato',
};

let passed = 0;
let failed = 0;
function ok(desc, cond) {
  if (cond) {
    console.log('  ✅', desc);
    passed++;
  } else {
    console.error('  ❌', desc);
    failed++;
  }
}

console.log('\n── Pagato bug reproduction ──');
store.set('lc_ui_lang', 'en');
store.set('lc_pref_xlat', 'en');
VM.syncUiLangMirrors(VM.resolveVocabUiLang());
ok('S.vocabLang synced to en (was it)', S.vocabLang === 'en');
ok('translationLang() is en', VM.translationLang() === 'en');
ok('bezahlt gloss is paid not pagato', vocabTranslationOf(bezahlt, VM.translationLang()) === 'paid');

console.log('\n── setVocabUiLang syncs all mirrors ──');
for (const code of ['en', 'es', 'fr', 'it']) {
  store.set('lc_ui_lang', code);
  store.set('lc_pref_xlat', code);
  VM.syncUiLangMirrors(code);
  ok(`${code}: lc_ui_lang`, store.get('lc_ui_lang') === code);
  ok(`${code}: S.fcLang`, S.fcLang === code);
  ok(`${code}: S.vocabLang`, S.vocabLang === code);
  ok(`${code}: translation reads ${code}`, VM.translationLang() === code);
  const gloss = vocabTranslationOf(bezahlt, VM.translationLang());
  ok(`${code}: bezahlt → ${gloss}`, gloss === bezahlt[`translation_${code}`]);
}

console.log('\n── Stale session cannot override lc_ui_lang ──');
S.vocabLang = 'it';
S.fcLang = 'it';
store.set('lc_ui_lang', 'en');
store.set('lc_pref_xlat', 'en');
ok('translationLang still en with stale S.vocabLang=it', VM.translationLang() === 'en');
VM.syncUiLangMirrors(VM.translationLang());
ok('syncUiLangMirrors fixes S.vocabLang', S.vocabLang === 'en');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed ? 1 : 0);
