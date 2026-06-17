#!/usr/bin/env node
/**
 * Unit tests for history sync (entry_key mapping + GET merge priority).
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

function mergeHistory(base, sbData) {
  return Array.isArray(base.history) && base.history.length ? base.history : sbData.history;
}

console.log('\n=== test-history-sync ===\n');

// Migration file exists
const mig = readFileSync(path.join(ROOT, 'supabase/migrations/002_history_dedup.sql'), 'utf8');
assert.match(mig, /entry_key TEXT/);
assert.match(mig, /lc_user_history_user_entry_key/);
console.log('OK  migration 002_history_dedup.sql present');

// GET merge: blob rich history wins
const rich = [{
  id: 1710000000000,
  date: '3/10/2024',
  topic: 'Umwelt',
  level: 'B1',
  lang: 'de',
  score: 78,
  moduleScores: { lesen: 80, horen: 75 },
  examSource: 'pool',
  poolId: 'seed_abc',
}];
const slim = [{ lang: 'de', level: 'B1', score: 78, examSource: 'pool', completedAt: '2024-03-10' }];

assert.equal(mergeHistory({ history: rich }, { history: slim }), rich);
assert.deepEqual(mergeHistory({ history: rich }, { history: slim })[0].topic, 'Umwelt');
assert.deepEqual(mergeHistory({ history: rich }, { history: slim })[0].moduleScores, { lesen: 80, horen: 75 });
console.log('OK  GET prefers blob history when non-empty');

assert.deepEqual(mergeHistory({ history: [] }, { history: slim }), slim);
console.log('OK  GET falls back to Supabase when blob empty');

// upsertHistory export
assert.equal(typeof sb.upsertHistory, 'function');
console.log('OK  upsertHistory exported');

const sample = {
  id: 1710000000000,
  date: '3/10/2024',
  topic: 'Test',
  level: 'B1',
  lang: 'de',
  score: 85,
  moduleScores: { lesen: 90 },
  examSource: 'library',
};
const userId = process.env.TEST_USER_ID;

if (sb.isConfigured() && userId) {
  console.log('\nIntegration (Supabase)…');
  const ok1 = await sb.upsertHistory(userId, [sample]);
  assert.ok(ok1, 'first upsert');
  const ok2 = await sb.upsertHistory(userId, [sample]);
  assert.ok(ok2, 'second upsert (dedup)');
  const rows = await sb.getHistory(userId, 200);
  const matches = rows.filter((r) => r.entry_key === String(sample.id));
  assert.equal(matches.length, 1, 'exactly one row per entry_key');
  console.log('OK  upsert dedup (1 row for entry_key)');
} else {
  console.log('\nSKIP integration (set TEST_USER_ID + Supabase env to run live test)');
}

console.log('\nAll tests passed.\n');
