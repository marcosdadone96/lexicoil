import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  vocabModuleStrings,
  resolveVocabUiLang,
  listeningGameStrings,
  vocabHintLangName,
} from '../../../js/i18n/vocabModuleLocale.js';

const VOCAB_UI_LANG_CODES = ['en', 'es', 'fr', 'it'];

function mockStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    _store: store,
  };
}

describe('vocabModuleLocale', () => {
  it('defaults to en when lc_ui_lang is unset', () => {
    const ls = mockStorage();
    global.localStorage = ls;
    assert.equal(resolveVocabUiLang(), 'en');
  });

  it('reads lc_ui_lang and clamps to product langs', () => {
    const ls = mockStorage();
    ls.setItem('lc_ui_lang', 'es');
    global.localStorage = ls;
    assert.equal(resolveVocabUiLang(), 'es');
    ls.setItem('lc_ui_lang', 'pt');
    assert.equal(resolveVocabUiLang(), 'en');
  });

  it('provides distinct UI strings for en and es quiz chrome', () => {
    const en = vocabModuleStrings('en');
    const es = vocabModuleStrings('es');
    assert.equal(en.questionOf(1, 10), 'Question 1 of 10');
    assert.equal(es.questionOf(1, 10), 'Pregunta 1 de 10');
    assert.equal(en.whichWord, 'Which word matches this clue?');
    assert.equal(es.whichWord, '¿Qué palabra encaja con esta pista?');
    assert.notEqual(en.correct, es.correct);
  });

  it('covers all four module langs for listening UI', () => {
    for (const code of VOCAB_UI_LANG_CODES) {
      const s = listeningGameStrings(code);
      assert.ok(s.title, code);
      assert.ok(s.intro, code);
      assert.ok(typeof s.score === 'function', code);
    }
  });

  it('localizes hint type labels via vocabHintLangName', () => {
    const ls = mockStorage();
    ls.setItem('lc_ui_lang', 'es');
    global.localStorage = ls;
    assert.equal(vocabHintLangName('de'), 'alemán');
    ls.setItem('lc_ui_lang', 'fr');
    assert.equal(vocabHintLangName('es'), 'espagnol');
  });
});
