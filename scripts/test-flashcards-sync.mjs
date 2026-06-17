#!/usr/bin/env node
/**
 * Unit tests for flashcard sync (lang mapping + tombstone deletes).
 * Integration: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TEST_USER_ID (UUID).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sb = require(path.join(ROOT, 'netlify/functions/lib/supabaseAdmin.js'));

const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function fcKey(fc) {
  const w = String(fc?.word || '').trim().toLowerCase();
  const lang = String(fc?.sourceLang || fc?.lang || '').trim().toLowerCase();
  return `${w}|${lang}`;
}

function isFcTombstoned(fc, tombstones) {
  const key = fcKey(fc);
  const fcTs = Number(fc.savedAt || fc.nextReview || 0);
  for (const t of tombstones || []) {
    if (String(t.key) === key && Number(t.deletedAt) >= fcTs) return true;
  }
  return false;
}

function mergeFlashcardsForGet(blobCards, sbCards, tombstones) {
  const map = new Map();
  for (const fc of [...(sbCards || []), ...(blobCards || [])]) {
    if (!fc || !fc.word) continue;
    const key = fcKey(fc);
    const prev = map.get(key);
    const ts = Number(fc.savedAt || fc.nextReview || 0);
    const prevTs = Number(prev?.savedAt || prev?.nextReview || 0);
    if (!prev || ts >= prevTs) map.set(key, fc);
  }
  return [...map.values()].filter((fc) => !isFcTombstoned(fc, tombstones)).slice(0, 500);
}

function mapWriteLang(f) {
  return f.lang || f.sourceLang || '';
}

function mapReadFc(f) {
  return { ...f, lang: f.lang, sourceLang: f.lang };
}

console.log('\n=== test-flashcards-sync ===\n');

assert.equal(typeof sb.deleteFlashcards, 'function');
console.log('OK  deleteFlashcards exported');

const deFc = {
  id: 'fc_test_de',
  word: 'Baum',
  sourceLang: 'de',
  savedAt: Date.now(),
  translations: { en: 'tree' },
};
const enFc = {
  id: 'fc_test_en',
  word: 'Baum',
  sourceLang: 'en',
  savedAt: Date.now(),
  translations: { es: 'tree' },
};

assert.equal(mapWriteLang(deFc), 'de');
assert.equal(mapWriteLang({ word: 'x', lang: '', sourceLang: 'de' }), 'de');
console.log('OK  write maps lang from sourceLang');

const readDe = mapReadFc({ word: 'Baum', lang: 'de' });
assert.equal(readDe.sourceLang, 'de');
assert.equal(fcKey(readDe), 'baum|de');
console.log('OK  read adds sourceLang for stable merge key');

const mergedBoth = mergeFlashcardsForGet([deFc], [enFc], []);
assert.equal(mergedBoth.length, 2, 'de/en same word coexist');
console.log('OK  de/en same word coexist without collision');

const tombstones = [{ key: 'baum|de', deletedAt: Date.now() }];
const afterDel = mergeFlashcardsForGet([deFc, enFc], [], tombstones);
assert.equal(afterDel.length, 1);
assert.equal(afterDel[0].sourceLang, 'en');
console.log('OK  tombstone removes only matching lang');

const userId = process.env.TEST_USER_ID;

if (sb.isConfigured() && userId) {
  console.log('\nIntegration (Supabase)…');
  const ok = await sb.upsertFlashcards(userId, [{
    lang: mapWriteLang(deFc),
    level: 'B1',
    word: deFc.word,
    translation: 'tree',
  }]);
  assert.ok(ok, 'upsert flashcard');
  const rows = await sb.getFlashcards(userId);
  const found = rows.find(
    (r) => String(r.word).toLowerCase() === 'baum' && r.lang === 'de',
  );
  assert.ok(found, 'German flashcard stored with lang=de');
  console.log('OK  upsert stores lang=de');

  const delOk = await sb.deleteFlashcards(userId, [{ lang: 'de', word: 'baum' }]);
  assert.ok(delOk, 'delete flashcard');
  const after = await sb.getFlashcards(userId);
  assert.ok(
    !after.find((r) => String(r.word).toLowerCase() === 'baum' && r.lang === 'de'),
    'row gone after delete',
  );
  console.log('OK  delete removes row from lc_user_flashcards');
} else {
  console.log('\nSKIP integration (set TEST_USER_ID + Supabase env to run live test)');
}

console.log('\nAll tests passed.\n');
