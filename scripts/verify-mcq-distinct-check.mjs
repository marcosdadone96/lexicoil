#!/usr/bin/env node
/**
 * Verifica checker determinista mcq_distinct (CHK-28 / calidad):
 *   - 073: Q3/Q6 detectadas 10/10 (determinista)
 *   - partes limpias: 0 falsos positivos
 *   - SEM-2 mcq_distinct: advise-only (no blocking)
 *
 *   node scripts/verify-mcq-distinct-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { checkMcqDistinctBatch, checkMcqDistinctIssues } from './lib/mcqDistinctCheck.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';
import { SEM2_BLOCK_AXES } from './lib/holisticJudge.mjs';

loadEnvFile();

const RUNS = 10;
const ANCHOR_073 = 'batches/generated/lesen-t2-gemini-073.json';
const CLEAN_FILES = [
  'batches/generated/pilot-gate-control/pilot-t2-freizeit.json',
  'batches/generated/lesen-t2-gemini-071.json',
];

function loadBatch(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function expectQ3Q6(findings) {
  const ids = new Set(findings.map((f) => f.itemId));
  return ids.has('gen-q-2-0232c450-3') && ids.has('gen-q-2-0232c450-6');
}

async function main() {
  console.log('\n══ Checker determinista mcq_distinct (L2) ══\n');

  const batch073 = loadBatch(ANCHOR_073);
  let hits073 = 0;
  const runResults = [];

  for (let i = 0; i < RUNS; i++) {
    const { ok, findings } = checkMcqDistinctBatch(batch073, 2);
    const hit = !ok && expectQ3Q6(findings);
    if (hit) hits073++;
    runResults.push({ run: i + 1, ok: hit, count: findings.length, ids: findings.map((f) => f.itemId) });
  }

  console.log(`073 × ${RUNS} corridas: ${hits073}/${RUNS} con Q3+Q6`);
  for (const r of runResults) {
    console.log(`  run ${r.run}: ${r.ok ? '✅' : '❌'} findings=${r.count} [${r.ids.join(', ')}]`);
  }

  const quality073 = checkLesenBatchQuality(batch073, 2);
  const calidadBlocks = !quality073.ok && quality073.issues.some((i) => /opciones no excluyentes/i.test(i));
  console.log(`\n073 calidad gate: ${calidadBlocks ? '✅' : '❌'} bloquea mcq_distinct (antes de SEM)`);

  let cleanFp = 0;
  for (const rel of CLEAN_FILES) {
    const batch = loadBatch(rel);
    const { ok, findings } = checkMcqDistinctBatch(batch, 2);
    const label = path.basename(rel);
    if (!ok) {
      cleanFp++;
      console.log(`\n⚠ FP en ${label}:`);
      for (const f of findings) console.log(`  - ${f.itemId} ${f.pair}: ${f.reason}`);
    } else {
      console.log(`\n✅ ${label}: 0 findings`);
    }
  }

  const triage = classifyAndRepair(batch073, {
    gate: 'calidad',
    issue: checkMcqDistinctIssues(batch073, 2).issues[0],
    issues: checkMcqDistinctIssues(batch073, 2).issues,
  });
  console.log(`\n073 triage → repairKind=${triage.repairKind} (${triage.repaired})`);

  console.log(`\nSEM-2 mcq_distinct: advise-only (SEM2_BLOCK_AXES=${[...SEM2_BLOCK_AXES].join(',') || '∅'})`);

  const rec073 = buildLesenSeedRecordFromBatch(batch073, { lang: 'de', level: 'B1', topicTag: 'Technik' });
  const struct = await isPartPoolReady(rec073, { semantic: false });
  const chk28 = struct.blocking.filter((f) => f.id === 'CHK-28');
  console.log(`\n073 POOL-2 estructural CHK-28: ${chk28.length} finding(s) (independiente de SEM)`);
  for (const f of chk28) console.log(`  - [${f.scope}] ${f.message}`);

  const pass =
    hits073 === RUNS &&
    cleanFp === 0 &&
    calidadBlocks &&
    triage.repairKind === 'mcq_distinct' &&
    SEM2_BLOCK_AXES.size === 0 &&
    chk28.length >= 2;

  console.log(`\nResult: ${pass ? 'PASS ✅' : 'FAIL ❌'}\n`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
