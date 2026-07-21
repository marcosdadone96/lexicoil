#!/usr/bin/env node
/**
 * sem2-calibrate.mjs — Calibración SEM-2 (juez holístico) contra verdad conocida.
 *
 * Modo advise-only: no bloquea; mide precisión por eje vs conjunto de control.
 *
 *   node scripts/sem2-calibrate.mjs
 *   node scripts/sem2-calibrate.mjs --dry-run
 *   node scripts/sem2-calibrate.mjs --group anchors
 *
 * Requiere GEMINI_API_KEY + SEMANTIC_USE_GEMINI=1 (o ANTHROPIC_API_KEY).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { checkLexical } from './lib/lexicalCheck.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import {
  validatePartHolistic,
  clearHolisticJudgeCache,
  buildHolisticPromptForPart,
  HOLISTIC_AXES,
  isSelfContradictoryHolisticFinding,
} from './lib/holisticJudge.mjs';

loadEnvFile();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const GROUP_FILTER = args.includes('--group') ? args[args.indexOf('--group') + 1] : null;
const PAUSE_MS = Number(process.env.SEM2_CALIBRATE_PAUSE_MS || 1200);
const OUT_DIR = path.join(ROOT, 'batches/generated/sem2-calibration');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @typedef {{ id: string, group: string, verdict: 'clean'|'dirty', topicTag?: string, file?: string, poolId?: string, expectAxes?: string[], note?: string, selfContradictionWatch?: boolean }} ControlCase */

/** @type {ControlCase[]} */
const CONTROL_CASES = [
  // ── Anchors (veredicto humano explícito) ──
  {
    id: 'anchor-l2-071-fp',
    group: 'anchors',
    file: 'batches/generated/lesen-t2-gemini-071.json',
    verdict: 'clean',
    topicTag: 'Technik',
    note: 'SEM-1 autocontradicción conocida — debe pasar',
    selfContradictionWatch: true,
  },
  {
    id: 'anchor-l2-073-dup',
    group: 'anchors',
    file: 'batches/generated/lesen-t2-gemini-073.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['mcq_distinct', 'ambiguity'],
    note: 'Opciones b/c duplicadas reales Q3/Q6',
  },
  {
    id: 'anchor-l1-157-vocab',
    group: 'anchors',
    file: 'batches/generated/lesen-t1-gemini-157.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['vocab_level', 'topic_fit'],
    note: 'modifizieren, Gelassenheit, Angehörige; topicTag contradictorio',
  },

  // ── Pilot gate-clean ──
  {
    id: 'pilot-t1-technik',
    group: 'clean-pilot',
    file: 'batches/generated/pilot-gate-control/pilot-t1-technik.json',
    verdict: 'clean',
    topicTag: 'Technik',
  },
  {
    id: 'pilot-t2-freizeit',
    group: 'clean-pilot',
    file: 'batches/generated/pilot-gate-control/pilot-t2-freizeit.json',
    verdict: 'clean',
    topicTag: 'Freizeit',
  },
  {
    id: 'pilot-t4-technik',
    group: 'clean-pilot',
    file: 'batches/generated/pilot-gate-control/pilot-t4-technik.json',
    verdict: 'clean',
    topicTag: 'Technik',
  },

  // ── P3 T4 ──
  {
    id: 'l4-028-clean',
    group: 'clean-pilot',
    file: 'batches/generated/lesen-t4-gemini-028.json',
    verdict: 'clean',
    topicTag: 'Freizeit',
  },
  {
    id: 'l4-029-dirty',
    group: 'dirty-topic',
    file: 'batches/generated/lesen-t4-gemini-029.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['topic_fit'],
    note: 'Homeoffice debate × Technik',
  },
  {
    id: 'l4-030-dirty',
    group: 'dirty-topic',
    file: 'batches/generated/lesen-t4-gemini-030.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['topic_fit'],
  },

  // ── P1 topic mismatch ──
  {
    id: 'l2-075-topic',
    group: 'dirty-topic',
    file: 'batches/generated/lesen-t2-gemini-075.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['topic_fit'],
    note: 'CHK-26 dos temas T2',
  },

  // ── Rejected T1 (word-match / calidad) ──
  {
    id: 'l1-073-rejected',
    group: 'dirty-content',
    file: 'batches/generated/.rejected/lesen-t1-gemini-073.json',
    verdict: 'dirty',
    topicTag: 'Technik',
    expectAxes: ['paraphrase'],
    note: 'Rejected batch — word matching',
  },
];

function loadPoolRecords() {
  const poolFile = path.join(ROOT, 'library/reusable-seed/de_B1.json');
  if (!fs.existsSync(poolFile)) return [];
  const { records } = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
  return records || [];
}

function enrichPoolCases() {
  const records = loadPoolRecords();
  const cleanL2 = records.filter(
    (r) => r.module === 'lesen' && r.teil === 2 && r.verified && r.complete !== false,
  ).slice(0, 3);
  for (const r of cleanL2) {
    CONTROL_CASES.push({
      id: `pool-clean-${r.id}`,
      group: 'clean-pool',
      poolId: r.id,
      verdict: 'clean',
      topicTag: r.topicTag,
      note: 'Pool struct SEM-1 clean group L2',
    });
  }

  const dirtyL4 = records.filter(
    (r) => r.module === 'lesen' && r.teil === 4 && r.verified,
  );
  // Pick 2 that fail CHK-7 structurally (known from sem1-calibrate)
  for (const r of dirtyL4.slice(0, 2)) {
    CONTROL_CASES.push({
      id: `pool-l4-${r.id}`,
      group: 'dirty-pool-l4',
      poolId: r.id,
      verdict: 'dirty',
      topicTag: r.topicTag,
      expectAxes: ['correctness', 'ambiguity'],
      note: 'Pool L4 known CHK-7 dirty',
    });
  }
}

enrichPoolCases();

function loadCasePart(c) {
  if (c.file) {
    const p = path.join(ROOT, c.file);
    if (!fs.existsSync(p)) return null;
    const batch = JSON.parse(fs.readFileSync(p, 'utf8'));
    batch._requestedTopic = c.topicTag || batch.topicTag || batch.passages?.[0]?.topicTag;
    const teil = batch.questions?.[0]?.teil || batch.passages?.[0]?.teil || 1;
    return buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: 'B1',
      topicTag: c.topicTag || batch.topicTag || 'Technik',
      teil,
    });
  }
  if (c.poolId) {
    const rec = loadPoolRecords().find((r) => r.id === c.poolId);
    if (!rec) return null;
    return { ...rec, _requestedTopic: c.topicTag || rec.topicTag };
  }
  return null;
}

async function inferExpectedAxes(part, batchLike) {
  const axes = new Set();
  const batch = batchLike || {
    passages: part.passages || (part.passage ? [part.passage] : []),
    questions: part.questions || [],
  };
  const teil = part.teil || batch.questions?.[0]?.teil || 1;

  const lex = checkLexical(batch);
  if (!lex.ok) axes.add('vocab_level');

  const qual = checkLesenBatchQuality(batch, teil);
  if (!qual.ok) {
    for (const issue of qual.issues || []) {
      if (/palabras idénticas|word.?match|copia literal/i.test(issue)) axes.add('paraphrase');
      if (/persona|sie|er|pronomb/i.test(issue)) axes.add('persona');
      if (/opciones.*excluy|parafraseen el mismo|sinónim/i.test(issue)) axes.add('mcq_distinct');
    }
  }

  const gate = await isPartPoolReady(part, { semantic: false });
  for (const f of gate.blocking || []) {
    if (f.id === 'CHK-16') axes.add('paraphrase');
    if (f.id === 'CHK-10') axes.add('absolute');
    if (f.id === 'CHK-18') axes.add('explanation');
    if (f.id === 'CHK-26' || f.id === 'CHK-27') axes.add('topic_fit');
    if (f.id === 'CHK-7') axes.add('correctness');
  }

  return [...axes];
}

function axisApplicable(axis, part) {
  const teil = Number(part.teil);
  const mod = String(part.module || '').toLowerCase();
  if (mod === 'schreiben' || mod === 'sprechen') return false;
  if (axis === 'persona' || axis === 'absolute') return mod === 'lesen' && teil === 1;
  if (axis === 'mcq_distinct') return mod === 'lesen' && teil === 2;
  if (axis === 'topic_fit') return true;
  return true;
}

function judgeHitOnAxis(findings, axis, minConf = 0.65) {
  return findings.filter(
    (f) => f.axis === axis && (f.confidence ?? 0) >= minConf && f.severity !== 'noise',
  );
}

function initAxisStats() {
  const s = {};
  for (const ax of HOLISTIC_AXES) {
    s[ax] = { tp: 0, fp: 0, fn: 0, tn: 0, applicable: 0 };
  }
  return s;
}

async function main() {
  const cases = GROUP_FILTER
    ? CONTROL_CASES.filter((c) => c.group === GROUP_FILTER)
    : CONTROL_CASES;

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  SEM-2 CALIBRACIÓN — juez holístico (advise-only)            ║`);
  console.log(`║  Casos: ${String(cases.length).padStart(2)} · ejes: ${HOLISTIC_AXES.length}                              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  if (DRY_RUN) {
    for (const c of cases.slice(0, 3)) {
      const part = loadCasePart(c);
      if (!part) { console.log(`SKIP ${c.id} (missing)`); continue; }
      const prompt = buildHolisticPromptForPart(part, { topicTag: c.topicTag });
      console.log(`\n── ${c.id} (${c.verdict}) ──\n${prompt?.slice(0, 800)}…\n`);
    }
    process.exit(0);
  }

  const useGemini = !!process.env.SEMANTIC_USE_GEMINI && !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasKey = useGemini
    ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    : !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    console.error('API key missing. Set GEMINI_API_KEY + SEMANTIC_USE_GEMINI=1');
    process.exit(1);
  }
  console.log(`Provider: ${useGemini ? 'Gemini' : 'Claude'} · pause=${PAUSE_MS}ms\n`);

  const axisStats = initAxisStats();
  const partResults = [];
  let cleanTotal = 0;
  let cleanFp = 0;
  let dirtyTotal = 0;
  let dirtyTp = 0;
  let selfContradictions = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const part = loadCasePart(c);
    if (!part) {
      console.log(`  SKIP ${c.id} — archivo/registro no encontrado`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${cases.length}] ${c.id} … `);
    clearHolisticJudgeCache();

    const result = await validatePartHolistic(part, {
      adviseOnly: true,
      topicTag: c.topicTag,
      noCache: true,
    });

    if (result._llmError) {
      console.log(`⚠ LLM error: ${result.error}`);
      partResults.push({ ...c, error: result.error });
      if (i < cases.length - 1) await sleep(PAUSE_MS);
      continue;
    }

    const expectedAxes = [
      ...(c.expectAxes || []),
      ...(c.verdict === 'dirty' && !c.expectAxes?.length
        ? await inferExpectedAxes(part)
        : []),
    ];
    const uniqueExpected = [...new Set(expectedAxes)];

    const hitAxes = [...new Set(result.findings.map((f) => f.axis))];
    const wouldBlock = result.wouldBlock || 0;
    const blockAxes = [...new Set(result.blocking.map((f) => f.axis))];

    if (c.selfContradictionWatch) {
      for (const f of result.findings) {
        if (isSelfContradictoryHolisticFinding(f)) selfContradictions++;
      }
    }

    if (c.verdict === 'clean') {
      cleanTotal++;
      if (wouldBlock > 0 || result.findings.some((f) => f.severity === 'block')) cleanFp++;
    } else {
      dirtyTotal++;
      const caught = wouldBlock > 0
        || uniqueExpected.some((ax) => judgeHitOnAxis(result.findings, ax).length > 0);
      if (caught) dirtyTp++;
    }

    // Per-axis confusion matrix
    for (const axis of HOLISTIC_AXES) {
      if (!axisApplicable(axis, part)) continue;
      axisStats[axis].applicable++;

      const positive = judgeHitOnAxis(result.findings, axis).length > 0;
      const shouldPositive = c.verdict === 'dirty' && uniqueExpected.includes(axis);

      if (shouldPositive && positive) axisStats[axis].tp++;
      else if (!shouldPositive && positive) axisStats[axis].fp++;
      else if (shouldPositive && !positive) axisStats[axis].fn++;
      else axisStats[axis].tn++;
    }

    const status = c.verdict === 'clean'
      ? (wouldBlock === 0 ? '✅ clean OK' : `⚠ FP wouldBlock=${wouldBlock} [${blockAxes.join(',')}]`)
      : (wouldBlock > 0 || hitAxes.some((a) => uniqueExpected.includes(a))
        ? `✅ dirty caught [${hitAxes.join(',')}]`
        : `❌ dirty MISSED (expected ${uniqueExpected.join(',') || '?'})`);

    console.log(status);
    for (const f of result.findings.slice(0, 4)) {
      console.log(
        `       ${f.axis.padEnd(14)} ${f.verdict}/${f.severity} conf=${(f.confidence ?? 0).toFixed(2)} ` +
        `${f.itemId}: ${f.detail.slice(0, 70)}`,
      );
    }

    partResults.push({
      id: c.id,
      group: c.group,
      verdict: c.verdict,
      note: c.note,
      expectedAxes: uniqueExpected,
      wouldBlock,
      hitAxes,
      findings: result.findings,
      partVerdict: result.partVerdict,
    });

    if (i < cases.length - 1) await sleep(PAUSE_MS);
  }

  // ── Summary ──
  console.log('\n════════════════ PART-LEVEL ════════════════');
  console.log(`Clean: ${cleanTotal - cleanFp}/${cleanTotal} sin wouldBlock (${cleanFp} falsos positivos part-level)`);
  console.log(`Dirty: ${dirtyTp}/${dirtyTotal} detectadas`);
  console.log(`Autocontradicciones (071-watch): ${selfContradictions} (objetivo: 0)`);

  console.log('\n════════════════ POR EJE ════════════════════');
  console.log(`${'Eje'.padEnd(16)} ${'Appl'.padStart(4)} ${'TP'.padStart(3)} ${'FP'.padStart(3)} ${'FN'.padStart(3)} ${'Prec'.padStart(6)} ${'Rec'.padStart(6)} ${'Veredicto v1'}`);
  console.log('─'.repeat(72));

  const axisVerdicts = [];

  for (const axis of HOLISTIC_AXES) {
    const s = axisStats[axis];
    if (s.applicable === 0) continue;
    const prec = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : null;
    const rec = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : null;
    const precStr = prec == null ? '  n/a' : `${(prec * 100).toFixed(0)}%`.padStart(6);
    const recStr = rec == null ? '  n/a' : `${(rec * 100).toFixed(0)}%`.padStart(6);

    let v1 = 'advise-only';
    if (prec != null && rec != null) {
      if (prec >= 0.85 && rec >= 0.70) v1 = 'BLOCK';
      else if (prec >= 0.70 && rec >= 0.50) v1 = 'hybrid';
      else if (prec < 0.60 || (s.fp >= 2 && s.tp <= 1)) v1 = 'noisy → advise';
      else v1 = 'advise-only';
    } else if (s.tp === 0 && s.fp === 0 && s.fn === 0) {
      v1 = 'no data';
    }

    axisVerdicts.push({ axis, ...s, precision: prec, recall: rec, v1Recommendation: v1 });
    console.log(
      `${axis.padEnd(16)} ${String(s.applicable).padStart(4)} ${String(s.tp).padStart(3)} ${String(s.fp).padStart(3)} ${String(s.fn).padStart(3)} ${precStr} ${recStr}  ${v1}`,
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, `report-${Date.now()}.json`);
  const report = {
    ts: new Date().toISOString(),
    mode: 'advise-only',
    casesRun: partResults.length,
    partLevel: {
      cleanTotal,
      cleanFalsePositives: cleanFp,
      dirtyTotal,
      dirtyTruePositives: dirtyTp,
      selfContradictions,
    },
    axisStats: axisVerdicts,
    parts: partResults,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\nReporte: ${path.relative(ROOT, reportPath)}`);
  console.log('\nDECISIÓN: activar BLOCK solo en ejes con Prec≥85% y Rec≥70% en este conjunto.');
  console.log('Si correctness FP en 071 > 0 → ajustar filtro autocontradicción antes de bloquear.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
