/**
 * Exam toolbar "Übersetzen: EN ES FR IT" — single active button (radio behavior).
 * Run: node scripts/lib/__tests__/examLangToolbar.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

global.VOCAB_UI_LANG_CODES = ['en', 'es', 'fr', 'it'];
global.clampVocabUiLang = (code, fb = 'en') => {
  const c = String(code || '').toLowerCase();
  return VOCAB_UI_LANG_CODES.includes(c) ? c : fb;
};
global.S = { ui: 'en', fcLang: 'en', vocabLang: 'en', subject: 'de' };

const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
};
store.set('lc_ui_lang', 'en');

function makeClassList() {
  const set = new Set(['vt-lb', 'ex-lb']);
  return {
    _set: set,
    add(c) {
      set.add(c);
    },
    remove(c) {
      set.delete(c);
    },
    toggle(c, on) {
      if (on) set.add(c);
      else set.delete(c);
    },
    contains(c) {
      return set.has(c);
    },
  };
}

function makeBtn(code, withDataLang) {
  const classList = makeClassList();
  if (code === 'en') classList.add('active');
  return {
    classList,
    dataset: withDataLang ? { lang: code } : {},
    getAttribute(name) {
      if (name === 'onclick') return `setVocabUiLang('${code}',this)`;
      return null;
    },
    _code: code,
  };
}

const codes = ['en', 'es', 'fr', 'it'];
const exButtons = codes.map((c) => makeBtn(c, false));

global.document = {
  getElementById() {
    return null;
  },
  querySelectorAll(sel) {
    if (sel.includes('.ex-lb')) return exButtons;
    return [];
  },
  querySelector() {
    return null;
  },
};

const VM = require(path.join(ROOT, 'js/i18n/vocabModuleLocale.js'));

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function activeCodes() {
  return exButtons.filter((b) => b.classList.contains('active')).map((b) => b._code);
}

console.log('\n── Cause: .ex-lb without data-lang was skipped by refreshTranslationLangChrome ──');

test('initial state: only EN active', () => {
  assert.deepEqual(activeCodes(), ['en']);
});

const sequence = ['en', 'es', 'fr', 'it'];
for (const code of sequence) {
  test(`click ${code.toUpperCase()}: only ${code.toUpperCase()} active`, () => {
    const btn = exButtons.find((b) => b._code === code);
    VM.setVocabUiLang(code, btn);
    assert.deepEqual(activeCodes(), [code], `got ${activeCodes().join(',')}`);
    assert.equal(store.get('lc_ui_lang'), code);
  });
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);
