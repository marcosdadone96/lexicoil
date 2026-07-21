#!/usr/bin/env node
/**
 * Verify L2 mcq_distinct pipeline:
 *   - Checker determinista bloquea 073 (Q3/Q6)
 *   - SEM-2 mcq_distinct advise-only (no blocking)
 *   - Triage → repairKind=mcq_distinct
 *
 *   node scripts/verify-sem2-mcq-distinct.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { checkMcqDistinctBatch } from './lib/mcqDistinctCheck.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import {
  clearSemanticCache,
  clearTemplateRegistry,
  validatePartSemantics,
} from './lib/semanticValidator.mjs';
import { SEM2_BLOCK_AXES } from './lib/holisticJudge.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';

loadEnvFile();

function loadBatch(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

async function main() {
  console.log('\n══ L2 mcq_distinct (determinista + SEM-2 advise) ══\n');
  clearSemanticCache();
  clearTemplateRegistry();

  const batch071 = loadBatch('batches/generated/lesen-t2-gemini-071.json');
  const batch073 = loadBatch('batches/generated/lesen-t2-gemini-073.json');

  const det071 = checkMcqDistinctBatch(batch071, 2);
  const det073 = checkMcqDistinctBatch(batch073, 2);
  const q3q6 = new Set(det073.findings.map((f) => f.itemId));

  const sem1_071 = await validatePartSemantics(
    buildLesenSeedRecordFromBatch(batch071, { lang: 'de', level: 'B1', topicTag: 'Technik' }),
  );

  const triage073 = classifyAndRepair(batch073, {
    gate: 'calidad',
    issue: det073.findings[0]?.detail || 'duplicate options',
    issues: det073.findings.map(
      (f) => `${f.itemId}: opciones no excluyentes — ${f.pair} (${f.reason})`,
    ),
  });

  const c1 = det071.ok === true;
  const c2 = q3q6.has('gen-q-2-0232c450-3') && q3q6.has('gen-q-2-0232c450-6');
  const c3 = sem1_071.ok === true;
  const c4 = SEM2_BLOCK_AXES.size === 0;
  const c5 = triage073.repairKind === 'mcq_distinct';

  console.log(`${c1 ? '✅' : '❌'} 071 checker determinista: 0 findings`);
  console.log(`${c2 ? '✅' : '❌'} 073 checker determinista: Q3+Q6`);
  console.log(`${c3 ? '✅' : '❌'} 071 SEM-1 OK (sin regresión)`);
  console.log(`${c4 ? '✅' : '❌'} SEM-2 mcq_distinct advise-only (SEM2_BLOCK vacío)`);
  console.log(`${c5 ? '✅' : '❌'} 073 triage → repairKind=mcq_distinct`);

  const ok = [c1, c2, c3, c4, c5].filter(Boolean).length;
  console.log(`\nResult: ${ok}/5\n`);
  process.exit(ok === 5 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
