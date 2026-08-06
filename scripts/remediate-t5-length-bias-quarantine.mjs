#!/usr/bin/env node
/**
 * Remediate Lesen T5 length-bias quarantine (16 length-only + 5 mixed diagnostic).
 *
 *   node scripts/remediate-t5-length-bias-quarantine.mjs --dry-run
 *   node scripts/remediate-t5-length-bias-quarantine.mjs
 *   node scripts/remediate-t5-length-bias-quarantine.mjs --stamp-only
 *   node scripts/remediate-t5-length-bias-quarantine.mjs --llm-only
 *   node scripts/remediate-t5-length-bias-quarantine.mjs --mixed-diagnostic
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson, poolVerifiedDir } from './lib/batchPaths.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import {
  collectMcqLengthBiasIssues,
  checkMcqQuestionLengthBias,
} from './lib/mcqLengthBias.mjs';
import {
  repairMcqLengthBiasBatch,
  failsLengthBiasGate,
} from './lib/mcqLengthBiasRepair.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import { assertBatchGermanExamContent } from './lib/qualityGates/germanContentLanguageGate.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { maybeAutoPublishExams } from './lib/autoPublishExamsLib.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
} from './lib/generationCostLog.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { batchHasOfficialQuarantine } = require(
  path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
);

const OUT = path.join(ROOT, 'batches/ready/gate-logs/t5-length-bias-remediation.json');

const dryRun = process.argv.includes('--dry-run');
const stampOnlyFlag = process.argv.includes('--stamp-only');
const llmOnlyFlag = process.argv.includes('--llm-only');
const mixedDiagFlag = process.argv.includes('--mixed-diagnostic');

function poolFileAbs(name) {
  return listPoolVerifiedJson('B1').find((abs) => path.basename(abs) === name);
}

function classifyT5Files() {
  const files = listPoolVerifiedJson('B1')
    .map((abs) => path.basename(abs))
    .filter((f) => /^lesen-t5-gemini-\d+\.json$/i.test(f));

  const stampOnly = [];
  const llmActive = [];
  const mixed = [];
  const other = [];

  for (const file of files.sort()) {
    const abs = poolFileAbs(file);
    if (!abs) continue;
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const qs = batch.questions || [];
    const nLen = qs.filter((q) => q._lengthBiasQuarantine).length;
    const nLex = qs.filter((q) => q._lexicalCueingQuarantine).length;
    if (!nLen && !nLex) continue;
    if (nLen && nLex) {
      mixed.push(file);
      continue;
    }
    if (!nLen) continue;
    const gateIssues = collectMcqLengthBiasIssues(batch, { gate: true, level: 'B1' });
    if (gateIssues.length === 0) stampOnly.push(file);
    else llmActive.push(file);
  }

  return { stampOnly, llmActive, mixed };
}

function clearStaleLengthStamps(batch, level = 'B1') {
  const out = structuredClone(batch);
  const cleared = [];
  const stillBad = [];
  for (const q of out.questions || []) {
    if (!q._lengthBiasQuarantine) continue;
    const r = checkMcqQuestionLengthBias(q, { gate: false, level });
    if (!r.bad) {
      delete q._lengthBiasQuarantine;
      cleared.push(q.id);
    } else {
      stillBad.push({ id: q.id, detail: r.detail });
    }
  }
  return { batch: out, cleared, stillBad };
}

function batchToRecord(batch, file) {
  const rec = buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    teil: 5,
    idPrefix: 'remediate',
  });
  rec.id = path.basename(file, '.json');
  return rec;
}

function assessOfficialReady(batch, file) {
  const quarantine = batchHasOfficialQuarantine(batch);
  const lbGate = collectMcqLengthBiasIssues(batch, { gate: true, level: 'B1' });
  const langGate = assertBatchGermanExamContent(batch, { lang: 'de', file });
  return { quarantine, lbIssues: lbGate.length, langOk: langGate.ok, langDetail: langGate.findings?.[0]?.detail };
}

async function gatePartReady(batch, file) {
  const rec = batchToRecord(batch, file);
  const gate = await isPartPoolReady(rec, { semantic: false, skipSem2: true });
  return gate.ok ? { ok: true } : { ok: false, issue: gate.issue || gate.blocking?.[0]?.message };
}

async function callLlm(opts) {
  const res = await generateContent({
    ...opts,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
    jsonMode: true,
  });
  const usage = parseUsageMetadata(res.usageMetadata || res.usage);
  const costUsd = costUsdFromTokens(
    usage.promptTokens,
    usage.outputTokensBilled,
    usage.cachedContentTokenCount,
  );
  return { text: res.text, costUsd };
}

function collectRepairIssues(batch) {
  const issues = collectMcqLengthBiasIssues(batch, { gate: true, level: 'B1' });
  for (const q of batch.questions || []) {
    if (!q._lengthBiasQuarantine) continue;
    if (issues.some((i) => i.startsWith(`${q.id}:`))) continue;
    const r = checkMcqQuestionLengthBias(q, { gate: false, level: 'B1' });
    if (r.detail) issues.push(r.detail);
  }
  return issues;
}

async function runLlmLengthBiasRepair(batch, file) {
  const issues = collectRepairIssues(batch);
  if (!issues.length) return { batch, costUsd: 0, repaired: false, issues: [] };

  let costUsd = 0;
  const tracked = wrapSurgicalCallLlm(async (opts) => {
    const r = await callLlm(opts);
    costUsd += r.costUsd;
    return r;
  });

  const repaired = await repairMcqLengthBiasBatch(batch, 5, issues, tracked, {
    module: 'lesen',
    level: 'B1',
  });

  let out = repaired || batch;
  const cleared = clearStaleLengthStamps(out);
  out = cleared.batch;

  const langGate = assertBatchGermanExamContent(out, { lang: 'de', file: `repair:${file}` });
  if (!langGate.ok) {
    return {
      batch: out,
      costUsd,
      repaired: !!repaired,
      q5Blocked: true,
      q5Detail: langGate.findings?.[0]?.detail,
      issues,
    };
  }

  return { batch: out, costUsd, repaired: !!repaired, issues, cleared: cleared.cleared, stillBad: cleared.stillBad };
}

async function processStampOnlyFile(file) {
  const abs = poolFileAbs(file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = assessOfficialReady(batch, file);
  const { batch: cleared, cleared: ids, stillBad } = clearStaleLengthStamps(batch);

  if (stillBad.length) {
    return {
      file,
      phase: 'stamp-only',
      outcome: 'reclassified_to_llm',
      stillBad,
      before,
    };
  }

  const langGate = assertBatchGermanExamContent(cleared, { lang: 'de', file });
  if (!langGate.ok) {
    return { file, phase: 'stamp-only', outcome: 'q5_block', detail: langGate.findings?.[0]?.detail, before };
  }

  const partGate = await gatePartReady(cleared, file);
  const after = assessOfficialReady(cleared, file);
  const officialReady = !after.quarantine && after.langOk && partGate.ok;

  if (officialReady && !dryRun) {
    const tagged = {
      ...cleared,
      _lengthBiasRemediatedAt: new Date().toISOString(),
      _lengthBiasRemediatedVia: 'stamp-clear',
    };
    writePoolVerified(file, tagged, 'B1');
    await syncPoolVerifiedBatch({ file, batch: tagged, level: 'B1', opts: { lang: 'de' } });
  }

  return {
    file,
    phase: 'stamp-only',
    outcome: officialReady ? 'official-ready' : 'not-ready',
    clearedIds: ids,
    partGate,
    before,
    after,
    officialReady,
  };
}

async function processLlmFile(file) {
  const abs = poolFileAbs(file);
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = assessOfficialReady(batch, file);
  const repair = await runLlmLengthBiasRepair(batch, file);
  batch = repair.batch;

  if (repair.q5Blocked) {
    return {
      file,
      phase: 'llm',
      outcome: 'q5_block',
      detail: repair.q5Detail,
      costUsd: repair.costUsd,
      before,
    };
  }

  const partGate = await gatePartReady(batch, file);
  const after = assessOfficialReady(batch, file);
  const officialReady =
    !after.quarantine && after.lbIssues === 0 && after.langOk && partGate.ok;

  if (officialReady && !dryRun) {
    const tagged = {
      ...batch,
      _lengthBiasRemediatedAt: new Date().toISOString(),
      _lengthBiasRemediatedVia: 'mcqLengthBiasRepair',
    };
    writePoolVerified(file, tagged, 'B1');
    await syncPoolVerifiedBatch({ file, batch: tagged, level: 'B1', opts: { lang: 'de' } });
  }

  return {
    file,
    phase: 'llm',
    outcome: officialReady ? 'official-ready' : repair.repaired ? 'partial-still-quarantined' : 'repair-failed',
    costUsd: repair.costUsd || 0,
    repaired: repair.repaired,
    stillBad: repair.stillBad,
    partGate,
    before,
    after,
    officialReady,
  };
}

async function diagnoseMixedFile(file) {
  const abs = poolFileAbs(file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const beforeLb = collectMcqLengthBiasIssues(batch, { gate: true, level: 'B1' }).length;
  const beforeLex = (batch.questions || []).filter((q) => q._lexicalCueingQuarantine).length;
  const repair = await runLlmLengthBiasRepair(batch, file);
  const afterLb = collectMcqLengthBiasIssues(repair.batch, { gate: true, level: 'B1' }).length;
  const afterLex = (repair.batch.questions || []).filter((q) => q._lexicalCueingQuarantine).length;
  const stillOfficialQuarantine = batchHasOfficialQuarantine(repair.batch);
  return {
    file,
    phase: 'mixed-diagnostic',
    dryRun: true,
    beforeLb,
    afterLb,
    lbImproved: afterLb < beforeLb,
    beforeLex,
    afterLex,
    stillOfficialQuarantine,
    costUsd: repair.costUsd || 0,
    note: 'no pool write — lexical-cueing still blocks official',
  };
}

async function countOfficialReadyT5() {
  const require2 = createRequire(import.meta.url);
  const { batchHasOfficialQuarantine: hasQ } = require2(
    path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
  );
  const files = listPoolVerifiedJson('B1').filter((f) => /lesen-t5/i.test(path.basename(f)));
  let ready = 0;
  const readyFiles = [];
  for (const abs of files) {
    const file = path.basename(abs);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (hasQ(batch)) continue;
    const gate = await gatePartReady(batch, file);
    if (gate.ok) {
      ready++;
      readyFiles.push(file);
    }
  }
  return { ready, readyFiles, total: files.length };
}

console.log(`\n══ T5 length-bias remediation ${dryRun ? '(dry-run)' : ''} ══\n`);

const classes = classifyT5Files();
console.log('Classification:');
console.log(`  stamp-only candidates: ${classes.stampOnly.length}`, classes.stampOnly);
console.log(`  LLM active: ${classes.llmActive.length}`, classes.llmActive);
console.log(`  mixed (diagnostic): ${classes.mixed.length}`, classes.mixed);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  classification: classes,
  stampOnlyResults: [],
  llmResults: [],
  mixedDiagnostic: [],
  totalCostUsd: 0,
};

const runStamp = !llmOnlyFlag && !mixedDiagFlag;
const runLlm = !stampOnlyFlag && !mixedDiagFlag;
const runMixed = mixedDiagFlag || (!stampOnlyFlag && !llmOnlyFlag);

if (runStamp) {
  console.log('\n── Part 1: stamp-only clear ──');
  for (const file of classes.stampOnly) {
    console.log(`\n  ${file}`);
    const r = await processStampOnlyFile(file);
    report.stampOnlyResults.push(r);
    console.log(`    → ${r.outcome}${r.officialReady ? ' ✓' : ''}`);
    if (r.outcome === 'reclassified_to_llm') {
      if (!classes.llmActive.includes(file)) classes.llmActive.push(file);
    }
  }
}

if (runLlm) {
  console.log('\n── Part 2: LLM length-bias repair ──');
  const llmTargets = [...new Set(classes.llmActive)].sort();
  for (const file of llmTargets) {
    console.log(`\n  ${file}`);
    const r = await processLlmFile(file);
    report.llmResults.push(r);
    report.totalCostUsd += r.costUsd || 0;
    console.log(`    → ${r.outcome}${r.officialReady ? ' ✓' : ''} ($${(r.costUsd || 0).toFixed(4)})`);
  }
}

if (runMixed && classes.mixed.length) {
  console.log('\n── Part 3: mixed diagnostic (no write) ──');
  for (const file of classes.mixed) {
    console.log(`\n  ${file}`);
    const r = await diagnoseMixedFile(file);
    report.mixedDiagnostic.push(r);
    report.totalCostUsd += r.costUsd || 0;
    console.log(
      `    LB ${r.beforeLb}→${r.afterLb} improved=${r.lbImproved} lexical=${r.beforeLex} officialStillBlocked=${r.stillOfficialQuarantine}`,
    );
  }
}

const stockBefore = { note: 'see prior audit lesen_5=7' };
const stockAfter = await countOfficialReadyT5();
report.stockAfter = stockAfter;

// Capacity via assemble dry-run output file if present, else spawn
let capacity = null;
try {
  const capPath = path.join(ROOT, 'batches/ready/assembled-from-verified/capacity-report.json');
  const { execSync } = await import('node:child_process');
  execSync('node scripts/assemble-from-pool-verified.mjs --dry-run --mode official', {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
  });
  if (fs.existsSync(capPath)) {
    capacity = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  }
} catch {
  /* best effort */
}

report.capacity = capacity
  ? { lesen5: capacity.stock?.lesen_5, totalExams: capacity.capacity, bottleneck: capacity.bottlenecks?.[0] }
  : null;

const autoPub = await maybeAutoPublishExams({
  lang: 'de',
  level: 'B1',
  mode: 'official',
  trigger: 't5-length-bias-remediation',
  dryRun: true,
  skipAssemble: false,
});
report.autoPublishDryRun = {
  capacity: autoPub.capacity,
  liveSlots: autoPub.liveSlots,
  assembledSlots: autoPub.assembledSlots,
  slotsToPublish: autoPub.slotsToPublish,
  wouldPublish: autoPub.slotsToPublish?.length || 0,
  skipped: autoPub.skipped,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n══ Summary ══');
console.log(`  T5 official-ready: ${stockAfter.ready} / ${stockAfter.total}`);
console.log(`  Disjoint official exams (capacity): ${capacity?.capacity ?? '?'}`);
console.log(`  Auto-publish would add slots: ${report.autoPublishDryRun.wouldPublish}`);
console.log(`  LLM cost: $${report.totalCostUsd.toFixed(4)}`);
console.log(`  Report: ${path.relative(ROOT, OUT)}`);

const failed = [
  ...report.stampOnlyResults.filter((r) => r.outcome !== 'official-ready' && r.outcome !== 'reclassified_to_llm'),
  ...report.llmResults.filter((r) => !r.officialReady && r.outcome !== 'partial-still-quarantined'),
].length;

if (failed && !dryRun) process.exit(1);
