#!/usr/bin/env node
/**
 * §2 verb form canonicalization — save path + resolveForSave + POS-noise guard.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './lib/loadEnv.mjs';

function loadStack() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.normWordType = (pos) => {
    const p = String(pos || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (p.startsWith('verb') || p === 'v') return 'verb';
    if (p.startsWith('noun') || p === 'n') return 'noun';
    return p || 'other';
  };
  vm.createContext(ctx);
  for (const rel of [
    'js/engine/validation/lemmatizer.js',
    'js/engine/separableResolve.js',
    'js/data/verbConjugation.js',
    'js/data/manualVocab.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx);
  }
  return ctx;
}

const ctx = loadStack();
const VC = ctx.VerbConjugation;
const SR = ctx.SeparableResolve;
const MV = ctx.ManualVocab;

function saveVerb(word, extra = {}) {
  const fc = {
    word,
    type: 'verb',
    pos: 'verb',
    sourceLang: 'de',
    ...extra,
  };
  MV.enrichFlashcard(fc, 'de');
  VC.canonicalizeForDeck(fc, 'de');
  return fc;
}

console.log('\n=== test-verb-form-canonicalize ===\n');

// 1) abnimmt → abnehmen (finite + separable)
{
  const fc = saveVerb('abnimmt');
  console.log('OK  abnimmt save:', { word: fc.word, surface: fc.surface, verbLemma: fc.verbLemma });
  assert.equal(fc.word, 'abnehmen');
  assert.equal(fc.surface, 'abnimmt');
  assert.equal(fc.verbLemma, 'abnehmen');
}

// 2) Bezahlen → bezahlen (capitalized infinitive)
{
  const fc = saveVerb('Bezahlen');
  console.log('OK  Bezahlen save:', { word: fc.word, surface: fc.surface, verbLemma: fc.verbLemma });
  assert.equal(fc.word, 'bezahlen');
  assert.equal(fc.verbLemma, 'bezahlen');
}

// 3) planen / tauschen unchanged
{
  const plan = saveVerb('planen');
  const tausch = saveVerb('tauschen');
  console.log('OK  planen unchanged:', plan.word);
  console.log('OK  tauschen unchanged:', tausch.word);
  assert.equal(plan.word, 'planen');
  assert.equal(tausch.word, 'tauschen');
  assert.equal(plan.surface, undefined);
}

// 4) Gruppen must NOT become fake infinitive
{
  const fc = saveVerb('Gruppen');
  console.log('OK  Gruppen not canonicalized:', { word: fc.word, verbLemma: fc.verbLemma });
  assert.equal(fc.word, 'Gruppen');
  assert.notEqual(fc.word, 'gruppen');
}

function migrationHit(word, extra = {}) {
  const fc = { word, type: 'verb', pos: 'verb', sourceLang: 'de', ...extra };
  VC.enrichVerbConjugation(fc, 'de');
  return VC.migrationEligible(fc, 'de');
}

// 5) konzentrierter (adj mis-tag) must NOT canonicalize — §2b noise
{
  const fc = saveVerb('konzentrierter');
  console.log('OK  konzentrierter not canonicalized:', { word: fc.word });
  assert.equal(fc.word, 'konzentrierter');
}

// 6) §2b guards — migrationEligible must reject POS noise / fake lemmas
{
  assert.equal(migrationHit('ermöglicht'), null, 'Partizip II: fake ermöglichten lemma');
  assert.equal(migrationHit('alle'), null, 'determiner alle→allen');
  assert.equal(migrationHit('ohne'), null, 'preposition ohne→ohnen');
  assert.equal(migrationHit('kompliziert'), null, 'Partizip II kompliziert→kompliziern');
  assert.equal(migrationHit('schnelle'), null, 'adjective schnelle→schnellen');
  assert.equal(migrationHit('Laufen', { article: 'das', gender: 'n' }), null, 'nominalized das Laufen');
  assert.equal(migrationHit('bietet')?.target, 'bieten', 'real finite bietet→bieten');
  assert.equal(migrationHit('passt'), null, 'passt maps to passen not pasen');
  assert.equal(migrationHit('Bezahlen')?.target, 'bezahlen', 'P1 Bezahlen→bezahlen');
  assert.equal(migrationHit('abnimmt')?.target, 'abnehmen', 'P0 abnimmt→abnehmen');
  console.log('OK  §2b migrationEligible guards');
}

// 7) das Laufen must NOT canonicalize on save
{
  const fc = saveVerb('Laufen', { article: 'das', gender: 'n' });
  assert.equal(fc.word, 'Laufen');
  console.log('OK  Laufen (das) not canonicalized on save');
}

// B) resolveForSave uses toLemma — no abnimmen
{
  const resolved = SR.resolveForSave('abnimmt', 'Sie nimmt schnell ab.');
  console.log('OK  resolveForSave abnimmt:', resolved);
  assert.equal(resolved.word, 'abnehmen');
  assert.notEqual(resolved.word, 'abnimmen');
}

console.log('\nAll passed.\n');
