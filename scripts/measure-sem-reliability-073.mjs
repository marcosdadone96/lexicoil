#!/usr/bin/env node
/**
 * Recall real mcq_distinct (SEM-2) y ambiguity (SEM-1) en lesen-t2-gemini-073.json
 *
 *   node scripts/measure-sem-reliability-073.mjs
 *   node scripts/measure-sem-reliability-073.mjs --runs 10
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import {
  validatePartSemantics,
  clearSemanticCache,
  clearTemplateRegistry,
} from './lib/semanticValidator.mjs';
import {
  runSem2Judge,
  clearHolisticJudgeCache,
  AXIS_BLOCK_THRESHOLDS,
} from './lib/holisticJudge.mjs';

loadEnvFile();

const RUNS = Number(process.argv.find((_, i, a) => a[i - 1] === '--runs') || 10);
const PAUSE_MS = Number(process.env.SEM_RELIABILITY_PAUSE_MS || 800);
const BATCH_REL = 'batches/generated/lesen-t2-gemini-073.json';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadRec() {
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, BATCH_REL), 'utf8'));
  batch._requestedTopic = 'Technik';
  return buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    topicTag: 'Technik',
  });
}

/** SEM-2: mcq_distinct con conf ≥ umbral de block. */
function sem2Caught(result) {
  const th = AXIS_BLOCK_THRESHOLDS.mcq_distinct ?? 0.88;
  return (result.blocking || []).some((f) => f.axis === 'mcq_distinct' && (f.confidence ?? 0) >= th)
    || (result.findings || []).some(
      (f) => f.axis === 'mcq_distinct' && f.severity === 'block',
    );
}

/** SEM-1: ambiguity/correctness por opciones duplicadas / parafraseo idéntico. */
function sem1CaughtDuplicate(result) {
  if (!result.issues?.length) return false;
  return result.issues.some((iss) => {
    const d = String(iss.detail || '').toLowerCase();
    const kind = String(iss.kind || '').toLowerCase();
    if (!['ambiguity', 'correctness'].includes(kind)) return false;
    return (
      /opciones?\s+[abc]\)|opción\s+[abc]\)|parafrasean|idénticas?|mismo contenido|prácticamente lo mismo|sinónim|verbessern|besser machen|distinción|diferenciación/i.test(d)
    );
  });
}

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(0)}%` : 'n/a';
}

function combinedProb(p1, p2) {
  return 1 - (1 - p1) * (1 - p2);
}

async function main() {
  const hasKey =
    (!!process.env.SEMANTIC_USE_GEMINI && !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY))
    || !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    console.error('Requiere GEMINI_API_KEY + SEMANTIC_USE_GEMINI=1 o ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const rec = loadRec();
  console.log(`\n══ Recall real × ${RUNS} — ${path.basename(BATCH_REL)} ══`);
  console.log(`Ground truth: opciones b/c duplicadas Q3/Q6 (ancla conocida)\n`);

  const sem1Runs = [];
  const sem2Runs = [];
  const combinedRuns = [];

  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  run ${i + 1}/${RUNS} … `);

    clearSemanticCache();
    clearTemplateRegistry();
    clearHolisticJudgeCache();

    const sem1 = await validatePartSemantics(rec, { skipTemplate: true });
    const sem2 = await runSem2Judge(rec, { topicTag: 'Technik', noCache: true });

    const c1 = sem1CaughtDuplicate(sem1);
    const c2 = sem2Caught(sem2);
    const both = c1 || c2;

    sem1Runs.push({
      run: i + 1,
      caught: c1,
      issues: (sem1.issues || []).map((x) => ({ kind: x.kind, itemId: x.itemId, detail: x.detail?.slice(0, 100) })),
    });
    sem2Runs.push({
      run: i + 1,
      caught: c2,
      blocking: (sem2.blocking || []).length,
      findings: (sem2.findings || []).filter((f) => f.axis === 'mcq_distinct').map((f) => ({
        conf: f.confidence,
        itemId: f.itemId,
        detail: f.detail?.slice(0, 80),
      })),
    });
    combinedRuns.push({ run: i + 1, sem1: c1, sem2: c2, combined: both });

    console.log(`SEM-1=${c1 ? '✓' : '·'} SEM-2=${c2 ? '✓' : '·'} union=${both ? '✓' : '✗'}`);

    if (i < RUNS - 1) await sleep(PAUSE_MS);
  }

  const sem1Hits = sem1Runs.filter((r) => r.caught).length;
  const sem2Hits = sem2Runs.filter((r) => r.caught).length;
  const unionHits = combinedRuns.filter((r) => r.combined).length;
  const bothHits = combinedRuns.filter((r) => r.sem1 && r.sem2).length;
  const onlySem1 = combinedRuns.filter((r) => r.sem1 && !r.sem2).length;
  const onlySem2 = combinedRuns.filter((r) => !r.sem1 && r.sem2).length;
  const neither = combinedRuns.filter((r) => !r.combined).length;

  const p1 = sem1Hits / RUNS;
  const p2 = sem2Hits / RUNS;
  const pUnion = unionHits / RUNS;
  const pIndep = combinedProb(p1, p2);

  console.log('\n════════════════ RESULTADOS ════════════════');
  console.log(`SEM-1 (ambiguity dup)     ${sem1Hits}/${RUNS}  recall=${pct(sem1Hits, RUNS)}`);
  console.log(`SEM-2 (mcq_distinct)      ${sem2Hits}/${RUNS}  recall=${pct(sem2Hits, RUNS)}`);
  console.log(`Unión (SEM-1 ∨ SEM-2)     ${unionHits}/${RUNS}  recall=${pct(unionHits, RUNS)}`);
  console.log(`  solo SEM-1: ${onlySem1} · solo SEM-2: ${onlySem2} · ambos: ${bothHits} · ninguno: ${neither}`);
  console.log(`P(combined) independiente ≈ ${pct(Math.round(pIndep * RUNS), RUNS)} (${(pIndep * 100).toFixed(1)}%)`);
  console.log(`  fórmula: 1 − (1−${(p1 * 100).toFixed(0)}%)×(1−${(p2 * 100).toFixed(0)}%)`);

  let verdict = '';
  if (p2 >= 0.8) verdict = 'SEM-2 aceptable (≥8/10) con SEM-1 de red';
  else if (p2 >= 0.5) verdict = 'SEM-2 poco fiable — reforzar prompt o umbral';
  else verdict = 'SEM-2 no fiable en producción — no confiar solo en mcq_distinct';

  if (pUnion >= 0.9) verdict += ' · L2 cerrado en práctica (unión ≥90%)';
  else if (pUnion >= 0.7) verdict += ' · L2 parcialmente cerrado (unión 70–89%)';
  else verdict += ' · L2 NO cerrado (unión <70%)';

  console.log(`\nVeredicto: ${verdict}\n`);

  const outPath = path.join(ROOT, 'batches/generated/sem2-calibration/reliability-073.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      batch: BATCH_REL,
      runs: RUNS,
      sem1Recall: p1,
      sem2Recall: p2,
      unionRecall: pUnion,
      combinedIndependent: pIndep,
      sem1Runs,
      sem2Runs,
      combinedRuns,
    }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Reporte: ${path.relative(ROOT, outPath)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
