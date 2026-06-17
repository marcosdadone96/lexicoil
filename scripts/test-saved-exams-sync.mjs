#!/usr/bin/env node
/**
 * Unit tests for saved exams sync (tombstones + Supabase upsert/delete).
 * Integration: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TEST_USER_ID (UUID).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sb = require(path.join(ROOT, 'netlify/functions/lib/supabaseAdmin.js'));

const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function mergeTombstones(local, server) {
  const map = new Map();
  for (const t of [...(server || []), ...(local || [])]) {
    if (!t || t.id == null) continue;
    const id = String(t.id);
    const prev = map.get(id);
    const ts = Number(t.deletedAt) || 0;
    const prevTs = Number(prev?.deletedAt) || 0;
    if (!prev || ts >= prevTs) map.set(id, { id, deletedAt: ts });
  }
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  return [...map.values()].filter((t) => t.deletedAt >= cutoff);
}

function savedExamTs(e) {
  return Date.parse(e?.savedAt) || Number(e?.id) || 0;
}

function isSavedExamTombstoned(e, tombstones) {
  const id = e?.id || e?.data?._savedId;
  if (!id) return true;
  const examTs = savedExamTs(e);
  for (const t of tombstones || []) {
    if (String(t.id) === String(id) && Number(t.deletedAt) >= examTs) return true;
  }
  return false;
}

function mergeSavedExamsForGet(blobExams, sbExams, tombstones) {
  const map = new Map();
  for (const e of [...(sbExams || []), ...(blobExams || [])]) {
    if (!e) continue;
    const id = e.id || e.data?._savedId;
    if (!id) continue;
    const sid = String(id);
    const prev = map.get(sid);
    const ts = savedExamTs(e);
    const prevTs = prev ? savedExamTs(prev) : 0;
    if (!prev || ts >= prevTs) map.set(sid, e);
  }
  return [...map.values()].filter((e) => !isSavedExamTombstoned(e, tombstones)).slice(0, 50);
}

console.log('\n=== test-saved-exams-sync ===\n');

const mig = readFileSync(path.join(ROOT, 'supabase/migrations/003_saved_exams.sql'), 'utf8');
assert.match(mig, /lc_user_saved_exams/);
assert.match(mig, /saved_exams_no_client/);
console.log('OK  migration 003_saved_exams.sql present');

assert.equal(typeof sb.upsertSavedExams, 'function');
assert.equal(typeof sb.getSavedExams, 'function');
assert.equal(typeof sb.deleteSavedExams, 'function');
console.log('OK  supabaseAdmin saved exam exports');

const examId = 1710000000001;
const sample = {
  id: examId,
  savedAt: '3/10/2024',
  topic: 'Umwelt',
  level: 'B1',
  lang: 'de',
  mode: 'official',
  status: 'in_progress',
  source: 'pool',
  goalId: null,
  data: { topic: 'Umwelt', level: 'B1', lang: 'de', _savedId: examId, sections: [] },
  answers: { q1: 'A' },
  gapAnswers: { g1: 'test' },
  fieldValues: { write1: 'hello' },
  markedWords: ['Baum'],
};

const tombstones = [{ id: String(examId), deletedAt: Date.now() }];
const merged = mergeSavedExamsForGet([sample], [sample], tombstones);
assert.equal(merged.length, 0, 'tombstoned exam excluded from GET merge');
console.log('OK  tombstone filters deleted saved exam');

const mergedUnion = mergeSavedExamsForGet([], [sample], []);
assert.equal(mergedUnion.length, 1);
assert.deepEqual(mergedUnion[0].answers, { q1: 'A' });
assert.deepEqual(mergedUnion[0].fieldValues, { write1: 'hello' });
console.log('OK  GET merge returns full exam_data fields');

const newer = Date.now();
const tsMerged = mergeTombstones(
  [{ id: '1', deletedAt: newer - 1000 }],
  [{ id: '1', deletedAt: newer }],
);
assert.equal(tsMerged.length, 1);
assert.equal(tsMerged[0].deletedAt, newer);
console.log('OK  mergeTombstones keeps latest deletedAt');

const userId = process.env.TEST_USER_ID;

if (sb.isConfigured() && userId) {
  console.log('\nIntegration (Supabase)…');
  const ok = await sb.upsertSavedExams(userId, [sample]);
  assert.ok(ok, 'upsert saved exam');
  const rows = await sb.getSavedExams(userId, 50);
  const found = rows.find((e) => String(e.id) === String(examId));
  assert.ok(found, 'row present after upsert');
  assert.deepEqual(found.answers, { q1: 'A' });
  assert.deepEqual(found.markedWords, ['Baum']);
  console.log('OK  upsert + get returns full exam_data');

  const delOk = await sb.deleteSavedExams(userId, tombstones);
  assert.ok(delOk, 'delete saved exam');
  const after = await sb.getSavedExams(userId, 50);
  assert.ok(!after.find((e) => String(e.id) === String(examId)), 'row gone after delete');
  console.log('OK  delete removes row from lc_user_saved_exams');
} else {
  console.log('\nSKIP integration (set TEST_USER_ID + Supabase env to run live test)');
}

console.log('\nAll tests passed.\n');
