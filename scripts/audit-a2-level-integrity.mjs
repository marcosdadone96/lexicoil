#!/usr/bin/env node
/**
 * Scan assembled A2 verified exams: CHK-LEVEL + MIXED pool eligibility simulation.
 */
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkExamLevelIntegrity, isExamPublishable } from './audit-pass-2.mjs';
import { inferBatchLevel, batchDeclaresUniformLevel } from './lib/batchPaths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASM = path.join(ROOT, 'batches/ready/assembled-from-verified');

const files = fs
  .readdirSync(ASM)
  .filter((f) => /^assembled-exam-a2-verified-e\d+\.json$/i.test(f))
  .sort();

console.log('=== A2 assembled level integrity scan ===\n');

for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(ASM, f), 'utf8'));
  const expected = String(doc.level || 'A2').toUpperCase();
  const level = checkExamLevelIntegrity(doc, { expectedLevel: expected });
  const gate = isExamPublishable({ exam: doc.exam, level: expected }, { expectedLevel: expected });
  const sources = doc._meta?.sources || {};
  let mixedSources = 0;
  for (const [cell, src] of Object.entries(sources)) {
    const poolPath = path.join(ROOT, 'batches/ready/pool-verified/A2', src);
    if (!fs.existsSync(poolPath)) continue;
    const batch = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
    if (inferBatchLevel(batch) === 'MIXED' || !batchDeclaresUniformLevel(batch, 'A2')) mixedSources++;
  }
  console.log(f);
  console.log('  declared level:', expected);
  console.log('  CHK-LEVEL:', level.ok ? 'PASS' : `FAIL (${level.findings.length})`);
  if (!level.ok) {
    for (const x of level.findings.slice(0, 4)) console.log('   ·', x.message);
  }
  console.log('  gate1:', gate.ok ? 'PASS' : `FAIL (${gate.blocking.length})`);
  if (!gate.ok) {
    for (const x of gate.blocking.slice(0, 4)) console.log('   ·', `[${x.id}]`, x.message?.slice(0, 100));
  }
  console.log('  pool sources failing uniform A2:', mixedSources);
  console.log('');
}
