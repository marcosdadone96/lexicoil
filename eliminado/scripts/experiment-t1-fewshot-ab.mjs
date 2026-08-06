#!/usr/bin/env node
/**
 * A/B: Lesen T1 Technik — prompt reglas (control) vs few-shot + reglas mínimas.
 *
 *   node scripts/experiment-t1-fewshot-ab.mjs
 *   node scripts/experiment-t1-fewshot-ab.mjs --count 10
 *   node scripts/experiment-t1-fewshot-ab.mjs --count 2   # smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkLexical } from './lib/lexicalCheck.mjs';

loadEnvFile();

const TEIL = 1;
const TOPIC = 'Technik';
const COUNT = Number(process.argv.find((_, i, a) => a[i - 1] === '--count') || 10);
const OUT_DIR = path.join(ROOT, 'batches/generated/experiment-t1-fewshot-ab');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');

const SEMANTIC_CHK = new Set(['CHK-6', 'CHK-7', 'CHK-10', 'CHK-16', 'CHK-18', 'CHK-26', 'CHK-27']);
const B2_PATTERN = /vocabulario B2|CHK-6|C1\/C2/i;

function batchToRecord(batch, topic = TOPIC) {
  const tag = batch.passages?.[0]?.topicTag || topic;
  return {
    module: 'lesen',
    teil: TEIL,
    topicTag: tag,
    _requestedTopic: topic,
    passages: batch.passages,
    questions: batch.questions,
  };
}

async function passesGoldGate(batch) {
  const rec = batchToRecord(batch, batch.passages?.[0]?.topicTag || TOPIC);
  const gate = await isPartPoolReady(rec, { semantic: false });
  return gate.ok && (batch.passages?.length || 0) >= 1 && (batch.questions?.length || 0) >= 6;
}

async function loadGoldExamples(max = 5) {
  const seen = new Set();
  const technik = [];
  const otherT1 = [];

  async function tryAdd(source, batch, bucket) {
    const key = batch.passages?.[0]?.id || source;
    if (seen.has(key)) return;
    seen.add(key);
    if (!(await passesGoldGate(batch))) return;
    bucket.push({ source, batch, topic: batch.passages?.[0]?.topicTag || '?' });
  }

  await tryAdd(
    'pilot-gate-control/pilot-t1-technik.json',
    JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/generated/pilot-gate-control/pilot-t1-technik.json'), 'utf8')),
    technik,
  );

  if (fs.existsSync(GENERATED_DIR)) {
    for (const name of fs.readdirSync(GENERATED_DIR)) {
      if (!/^lesen-t1-.*\.json$/i.test(name)) continue;
      const batch = JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, name), 'utf8'));
      const tag = String(batch.passages?.[0]?.topicTag || '').toLowerCase();
      const bucket = tag === TOPIC.toLowerCase() ? technik : otherT1;
      await tryAdd(name, batch, bucket);
    }
  }

  const seedPath = path.join(ROOT, 'library/reusable-seed/de_B1.bank.json');
  if (fs.existsSync(seedPath)) {
    const bank = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    for (const rec of bank.records || []) {
      if (rec.module !== 'lesen' || rec.teil !== TEIL) continue;
      const tag = rec.topicTag || rec.passage?.topicTag || '?';
      const batch = {
        passages: rec.passages || (rec.passage ? [rec.passage] : []),
        questions: rec.questions || [],
      };
      if (!batch.passages.length || batch.questions.length < 6) continue;
      const bucket = String(tag).toLowerCase() === TOPIC.toLowerCase() ? technik : otherT1;
      await tryAdd(`seed:${rec.id}`, batch, bucket);
    }
  }

  const ordered = [...technik, ...otherT1];
  return ordered.slice(0, max);
}

async function scorePart(batch) {
  const quality = checkLesenBatchQuality(batch, TEIL);
  const lexical = checkLexical(batch);
  const rec = batchToRecord(batch);
  const pool2 = await isPartPoolReady(rec, { semantic: false });
  const full = await isPartPoolReady(rec, { semantic: true });

  const blocking = full.blocking || [];
  const byId = {};
  for (const f of blocking) {
    byId[f.id] = (byId[f.id] || 0) + 1;
  }

  const semFindings = blocking.filter((f) => String(f.id || '').startsWith('SEM-'));
  const semanticStruct = blocking.filter((f) => SEMANTIC_CHK.has(f.id));

  const b2Issues = [
    ...(lexical.issues || []).filter((i) => B2_PATTERN.test(i)),
    ...blocking.filter((f) => f.id === 'CHK-6').map((f) => f.message),
  ];
  const wordMatch = [
    ...blocking.filter((f) => f.id === 'CHK-16').map((f) => f.message),
    ...(quality.issues || []).filter((i) => /word.?match|parafrase|palabras.*igual/i.test(i)),
  ];
  const absolute = blocking.filter((f) => f.id === 'CHK-10').map((f) => f.message);
  const explanation = blocking.filter((f) => f.id === 'CHK-18').map((f) => f.message);
  const coherence = [
    ...semFindings.filter((f) => /CORRECTNESS|AMBIGUITY|correct/i.test(String(f.id + f.message))),
    ...(quality.issues || []).filter((i) => /persona|sie|er|incoher|contradic/i.test(i)),
  ];

  const defectCount =
    (quality.issues?.length || 0) +
    (lexical.issues?.length || 0) +
    blocking.length;

  return {
    qualityOk: quality.ok,
    lexicalOk: lexical.ok,
    pool2Ok: pool2.ok,
    fullOk: full.ok,
    qualityIssues: quality.issues?.length || 0,
    lexicalIssues: lexical.issues?.length || 0,
    blockingCount: blocking.length,
    defectCount,
    b2: b2Issues.length,
    wordMatch: wordMatch.length,
    absolute: absolute.length,
    explanation: explanation.length,
    coherence: coherence.length,
    sem1: semFindings.length,
    semanticStruct: semanticStruct.length,
    chkIds: Object.keys(byId),
    blocking,
    scoreEstimate: quality.scoreEstimate ?? 0,
  };
}

async function runArm(arm, opts, count) {
  const { session, args: sessionArgs } = createLesenFactorySession({
    lang: 'de',
    level: 'B1',
    writeFile: true,
    maxApiCalls: 120,
    fixRetries: 2,
  });
  sessionArgs.fromCoverage = true;
  sessionArgs.wordCount = 10;
  sessionArgs.topic = TOPIC;
  sessionArgs._resolvedTopic = TOPIC;
  sessionArgs.semantic = true;
  sessionArgs.skipDedup = true;

  if (arm === 'fewshot') {
    sessionArgs.fewShotExamples = opts.goldBatches;
    sessionArgs.minimalPromptRules = true;
  } else {
    sessionArgs.fewShotExamples = null;
    sessionArgs.minimalPromptRules = false;
  }

  const sessionWrap = { session, args: sessionArgs };
  const rows = [];

  for (let i = 0; i < count; i++) {
    console.log(`\n── ${arm} ${i + 1}/${count} ──`);
    const apiBefore = session.apiCallsUsed;
    const gen = await generateLesenPart({
      teil: TEIL,
      topic: TOPIC,
      writeFile: true,
      session: sessionWrap,
      fixRetries: 2,
      semantic: true,
      skipDedup: true,
      fewShotExamples: arm === 'fewshot' ? opts.goldBatches : null,
      minimalPromptRules: arm === 'fewshot',
    });

    const row = {
      arm,
      index: i + 1,
      genOk: gen.ok,
      attempts: gen.attempts ?? null,
      firstTryPublish: gen.ok && (gen.attempts ?? 99) === 1,
      apiCalls: session.apiCallsUsed - apiBefore,
      reason: gen.reason || null,
      ms: gen.ms,
    };

    if (gen.ok && gen.batch) {
      row.score = await scorePart(gen.batch);
      row.file = gen.file;
      console.log(
        `  OK attempts=${row.attempts} defects=${row.score.defectCount} ` +
        `fullGate=${row.score.fullOk} b2=${row.score.b2} wm=${row.score.wordMatch} sem=${row.score.sem1}`,
      );
    } else {
      row.score = null;
      console.log(`  FAIL: ${row.reason}`);
    }
    rows.push(row);
  }

  return { rows, apiTotal: session.apiCallsUsed };
}

function summarizeArm(rows) {
  const n = rows.length;
  const genOk = rows.filter((r) => r.genOk).length;
  const firstTry = rows.filter((r) => r.firstTryPublish).length;
  const scored = rows.filter((r) => r.score);
  const avg = (fn) => (scored.length ? scored.reduce((s, r) => s + fn(r.score), 0) / scored.length : 0);

  return {
    n,
    genOk,
    genOkRate: genOk / n,
    firstTryPublish: firstTry,
    firstTryRate: firstTry / n,
    fullGatePass: scored.filter((r) => r.score.fullOk).length,
    fullGateRate: scored.filter((r) => r.score.fullOk).length / n,
    avgDefects: avg((s) => s.defectCount),
    avgB2: avg((s) => s.b2),
    avgWordMatch: avg((s) => s.wordMatch),
    avgAbsolute: avg((s) => s.absolute),
    avgCoherence: avg((s) => s.coherence),
    avgSem1: avg((s) => s.sem1),
    avgQualityIssues: avg((s) => s.qualityIssues),
    avgScoreEstimate: avg((s) => s.scoreEstimate),
    avgAttempts: rows.filter((r) => r.genOk).reduce((s, r) => s + (r.attempts || 0), 0) / (genOk || 1),
  };
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  A/B T1×Technik: reglas (${COUNT}) vs few-shot (${COUNT})              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  const gold = await loadGoldExamples(5);
  console.log(`Gold examples (${gold.length}, Technik×T1 generación; estilo T1 cross-tema):`);
  for (const g of gold) console.log(`  · ${g.source} [${g.topic}]`);

  if (gold.length < 3) {
    console.error('\n⚠ Necesitamos ≥3 ejemplos gold; abortando.');
    process.exit(1);
  }

  const goldBatches = gold.map((g) => g.batch);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n══ BRAZO A: control (reglas completas) ══');
  const control = await runArm('control', { goldBatches }, COUNT);

  console.log('\n══ BRAZO B: few-shot + reglas mínimas ══');
  const fewshot = await runArm('fewshot', { goldBatches }, COUNT);

  const sumA = summarizeArm(control.rows);
  const sumB = summarizeArm(fewshot.rows);

  const report = {
    ts: new Date().toISOString(),
    teil: TEIL,
    topic: TOPIC,
    countPerArm: COUNT,
    goldSources: gold.map((g) => ({ source: g.source, topic: g.topic })),
    control: { summary: sumA, rows: control.rows },
    fewshot: { summary: sumB, rows: fewshot.rows },
    delta: {
      firstTryRate: sumB.firstTryRate - sumA.firstTryRate,
      fullGateRate: sumB.fullGateRate - sumA.fullGateRate,
      avgDefects: sumB.avgDefects - sumA.avgDefects,
      avgB2: sumB.avgB2 - sumA.avgB2,
      avgWordMatch: sumB.avgWordMatch - sumA.avgWordMatch,
      avgSem1: sumB.avgSem1 - sumA.avgSem1,
    },
    apiCalls: { control: control.apiTotal, fewshot: fewshot.apiTotal },
  };

  const outFile = path.join(OUT_DIR, `report-${Date.now()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n════════════════ RESUMEN A/B ════════════════');
  console.log(`                    Control    Few-shot    Δ`);
  console.log(`Gen OK              ${pct(sumA.genOkRate)}       ${pct(sumB.genOkRate)}       ${pct(sumB.genOkRate - sumA.genOkRate)}`);
  console.log(`1ª publish          ${pct(sumA.firstTryRate)}       ${pct(sumB.firstTryRate)}       ${pct(sumB.firstTryRate - sumA.firstTryRate)}`);
  console.log(`Full gate (POOL+SEM) ${pct(sumA.fullGateRate)}       ${pct(sumB.fullGateRate)}       ${pct(sumB.fullGateRate - sumA.fullGateRate)}`);
  console.log(`Defectos/parte (avg) ${sumA.avgDefects.toFixed(1)}        ${sumB.avgDefects.toFixed(1)}        ${(sumB.avgDefects - sumA.avgDefects).toFixed(1)}`);
  console.log(`B2 vocab (avg)      ${sumA.avgB2.toFixed(1)}        ${sumB.avgB2.toFixed(1)}        ${(sumB.avgB2 - sumA.avgB2).toFixed(1)}`);
  console.log(`Word-match (avg)    ${sumA.avgWordMatch.toFixed(1)}        ${sumB.avgWordMatch.toFixed(1)}        ${(sumB.avgWordMatch - sumA.avgWordMatch).toFixed(1)}`);
  console.log(`SEM-1 (avg)         ${sumA.avgSem1.toFixed(1)}        ${sumB.avgSem1.toFixed(1)}        ${(sumB.avgSem1 - sumA.avgSem1).toFixed(1)}`);
  console.log(`Intentos (avg OK)   ${sumA.avgAttempts.toFixed(1)}        ${sumB.avgAttempts.toFixed(1)}`);
  console.log(`\nReporte: ${path.relative(ROOT, outFile)}`);
}

function pct(x) {
  return `${(x * 100).toFixed(0)}%`.padStart(4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
