#!/usr/bin/env node
/**
 * Simulates 2 concurrent pool publishes — both records must survive.
 * Run: node scripts/test-pool-publish-concurrency.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLesenRecordToPool } from './lib/publishToPool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = path.join(ROOT, 'batches', 'ready', 'gate-logs');
const poolFile = path.join(tmpDir, 'concurrency-test-pool.json');

function baseRecord(id, teil) {
  return {
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil,
    topicTag: 'Arbeit',
    instruction: 'Test',
    passage: { title: `T${teil} ${id}`, text: `Unique passage text for ${id} with enough tokens for dedup checks and worker safety.` },
    questions: [
      { id: `q-${id}`, type: 'richtig_falsch', question: 'Test?', correct: 'richtig', teil },
    ],
    itemCount: 1,
    targetCount: 1,
    complete: true,
    verified: true,
  };
}

if (fs.existsSync(poolFile)) fs.unlinkSync(poolFile);
if (fs.existsSync(`${poolFile}.lock`)) fs.unlinkSync(`${poolFile}.lock`);

const a = baseRecord('concurrent-a', 1);
const b = baseRecord('concurrent-b', 2);

const t0 = Date.now();
const [ra, rb] = await Promise.all([
  appendLesenRecordToPool(a, { poolFile, skipLock: false, store: null }),
  appendLesenRecordToPool(b, { poolFile, skipLock: false, store: null }),
]);

const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
const ids = pool.records.map((r) => r.id).sort();
const ok = ra?.ok && rb?.ok && ids.includes('concurrent-a') && ids.includes('concurrent-b');

const out = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - t0,
  ra,
  rb,
  recordIds: ids,
  recordCount: pool.records.length,
  ok,
  mechanism: 'file_exclusive_lock + optional_blob_cas_lock',
};

fs.writeFileSync(path.join(tmpDir, 'pool-publish-concurrency-2026-07-13.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 1);
