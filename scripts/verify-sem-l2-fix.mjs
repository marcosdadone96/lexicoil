#!/usr/bin/env node
/**
 * Verify L2 SEM fix: 071 passes, 073 still blocks (duplicate options).
 *   node scripts/verify-sem-l2-fix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { clearSemanticCache, clearTemplateRegistry } from './lib/semanticValidator.mjs';

loadEnvFile();

async function auditBatch(rel, expectOk) {
  clearSemanticCache();
  clearTemplateRegistry();
  const full = path.join(ROOT, rel);
  const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
  batch._requestedTopic = batch.topicTag || 'Technik';
  const rec = buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    topicTag: batch.topicTag || 'Technik',
  });
  const gate = await isPartPoolReady(rec, { semantic: true });
  const sem = (gate.blocking || []).filter((f) => String(f.id || '').startsWith('SEM-'));
  const pass = gate.ok === expectOk;
  console.log(`${pass ? '✅' : '❌'} ${path.basename(rel)} — expected ${expectOk ? 'OK' : 'FAIL'}, got ${gate.ok ? 'OK' : 'FAIL'}`);
  if (sem.length) {
    sem.forEach((s) => console.log(`   ${s.id} [${s.scope || '?'}]: ${(s.message || s.detail || '').slice(0, 120)}`));
  }
  return pass;
}

console.log('\n══ L2 SEM fix verification ══\n');
let ok = 0;
if (await auditBatch('batches/generated/lesen-t2-gemini-071.json', true)) ok++;
if (await auditBatch('batches/generated/lesen-t2-gemini-073.json', false)) ok++;
console.log(`\nResult: ${ok}/2 checks passed\n`);
process.exit(ok === 2 ? 0 : 1);
