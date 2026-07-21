#!/usr/bin/env node
/**
 * Article/gender assignment regression tests (shared ManualVocab + ArticleLexicon path).
 * Run: node scripts/lib/__tests__/article-gender.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const ctx = { console, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/articleLexicon.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/manualVocab.js'), 'utf8'), ctx);
const ManualVocab = ctx.ManualVocab || ctx.window?.ManualVocab;
const ArticleLexicon = ctx.ArticleLexicon || ctx.window?.ArticleLexicon;
ArticleLexicon.loadSync(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicon/de-gender.json'), 'utf8')));

let passed = 0;
let failed = 0;
function assertEq(label, a, b) {
  try {
    assert.strictEqual(a, b);
    console.log('  ✅', label);
    passed += 1;
  } catch (_) {
    console.log('  ❌', label, 'got', a, 'expected', b);
    failed += 1;
  }
}

function enrich(word) {
  const fc = { word, translations: { en: 'x' } };
  ManualVocab.enrichFlashcard(fc, 'de');
  return fc;
}

console.log('\n── P1: lookup priority (Schüler singular) ──');
assertEq('Schüler → der/m', enrich('Schüler').article, 'der');
assertEq('Schüler lexicon m', ArticleLexicon.lookupGender('Schüler', 'de'), 'm');
assertEq('Schülerinnen → die (plural or fem)', enrich('Schülerinnen').article, 'die');

console.log('\n── P2: six known missing nouns ──');
for (const [w, art] of [
  ['Gerät', 'das'],
  ['Unterschied', 'der'],
  ['Küche', 'die'],
  ['Vorschlag', 'der'],
  ['Wochenende', 'das'],
  ['Pizza', 'die'],
]) {
  assertEq(`${w} → ${art}`, enrich(w).article, art);
}

console.log('\n── P3: -en dative plural not verb ──');
assertEq('Geräten → noun', enrich('Geräten').type, 'noun');
assertEq('Geräten → das', enrich('Geräten').article, 'das');
assertEq('anbieten still verb', enrich('anbieten').type, 'verb');

console.log('\n── shared path: manual vs tap-to-save ──');
const manual = enrich('Schüler');
const tap = enrich('Gerät');
assertEq('manual Schüler noun', manual.type, 'noun');
assertEq('tap Gerät noun', tap.type, 'noun');

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
