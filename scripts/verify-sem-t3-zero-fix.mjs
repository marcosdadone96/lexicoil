#!/usr/bin/env node
/**
 * Verify SEM-1 accepts T3 batches with valid "0" keys (post-fix).
 *   node scripts/verify-sem-t3-zero-fix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { clearSemanticCache } from './lib/semanticValidator.mjs';

loadEnvFile();

const BATCHES = [
  'batches/generated/lesen-t3-gemini-063.json',
  'batches/generated/lesen-t3-gemini-064.json',
  'batches/generated/lesen-t3-gemini-066.json',
];

async function auditBatch(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return { file: rel, skip: true };
  clearSemanticCache();
  const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
  batch._requestedTopic = batch.topicTag || 'Freizeit';
  const rec = buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    topicTag: batch.topicTag || 'Freizeit',
  });
  const gate = await isPartPoolReady(rec, { semantic: true });
  const sem = (gate.blocking || []).filter((f) => String(f.id || '').startsWith('SEM-'));
  return {
    file: rel,
    ok: gate.ok,
    semIssues: sem.map((f) => `${f.id}: ${f.detail || f.message || ''}`.slice(0, 120)),
  };
}

console.log('\n══ SEM-1 T3 "0" fix verification ══\n');
let pass = 0;
let fail = 0;
for (const f of BATCHES) {
  const r = await auditBatch(f);
  if (r.skip) {
    console.log(`⚠ SKIP ${f} (missing)`);
    continue;
  }
  if (r.ok) {
    pass++;
    console.log(`✅ ${path.basename(f)} — SEM-1 OK`);
  } else {
    fail++;
    console.log(`❌ ${path.basename(f)} — SEM-1 FAIL`);
    r.semIssues.forEach((s) => console.log(`   ${s}`));
  }
}
console.log(`\nResult: ${pass}/${pass + fail} batches pass SEM-1\n`);
process.exit(fail > 0 ? 1 : 0);
