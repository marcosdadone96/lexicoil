#!/usr/bin/env node
/**
 * Remediate length-bias official quarantine for any B1 Lesen/Hören Teil.
 *
 *   node scripts/remediate-length-bias-cell.mjs --module lesen --teil 2
 *   node scripts/remediate-length-bias-cell.mjs --module horen --teil 2 --max 5
 *   node scripts/remediate-length-bias-cell.mjs --cells lesen_2,horen_2 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import {
  collectMcqLengthBiasIssues,
  checkMcqQuestionLengthBias,
} from './lib/mcqLengthBias.mjs';
import { repairMcqLengthBiasBatch } from './lib/mcqLengthBiasRepair.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import { assertBatchGermanExamContent } from './lib/qualityGates/germanContentLanguageGate.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
} from './lib/generationCostLog.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { batchHasOfficialQuarantine } = require(
  path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'),
);

const dryRun = process.argv.includes('--dry-run');
const stampOnlyFlag = process.argv.includes('--stamp-only');
const llmOnlyFlag = process.argv.includes('--llm-only');

function parseArgs() {
  const out = { cells: [], module: null, teil: null, max: 999, level: 'B1' };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--module') out.module = String(process.argv[++i]).toLowerCase();
    else if (a === '--teil') out.teil = Number(process.argv[++i]);
    else if (a === '--cells') out.cells = String(process.argv[++i]).split(',').map((s) => s.trim());
    else if (a === '--max') out.max = Math.max(1, Number(process.argv[++i]) || 999);
    else if (a === '--level') out.level = String(process.argv[++i]).toUpperCase();
  }
  if (!out.cells.length && out.module && out.teil) {
    out.cells = [`${out.module}_${out.teil}`];
  }
  if (!out.cells.length) {
    console.error('Usage: --module lesen --teil 2   OR   --cells lesen_2,horen_2');
    process.exit(1);
  }
  return out;
}

const args = parseArgs();
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs',
  `length-bias-remediation-${args.cells.join('-')}-${Date.now()}.json`,
);

function fileRe(cell) {
  const [mod, teil] = cell.split('_');
  return new RegExp(`^${mod}-t${teil}-`, 'i');
}

function poolFileAbs(name, level) {
  return listPoolVerifiedJson(level).find((abs) => path.basename(abs) === name);
}

function classifyCellFiles(cell, level) {
  const re = fileRe(cell);
  const files = listPoolVerifiedJson(level)
    .map((abs) => path.basename(abs))
    .filter((f) => re.test(f))
    .sort();

  const stampOnly = [];
  const llmActive = [];
  const mixed = [];

  for (const file of files) {
    const abs = poolFileAbs(file, level);
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
    const gateIssues = collectMcqLengthBiasIssues(batch, { gate: true, level });
    if (gateIssues.length === 0) stampOnly.push(file);
    else llmActive.push(file);
  }

  return { stampOnly, llmActive, mixed, cell };
}

function batchToRecord(batch, file, module, teil, level) {
  const mod = String(module).toLowerCase();
  if (mod === 'lesen') {
    const rec = buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level,
      teil,
      idPrefix: 'remediate',
    });
    rec.id = path.basename(file, '.json');
    return rec;
  }
  return {
    id: path.basename(file, '.json'),
    module: mod,
    teil,
    lang: 'de',
    level,
    questions: batch.questions || [],
    passage: batch.passage || null,
    segments: batch.segments,
    complete: true,
    verified: true,
  };
}

function clearStaleLengthStamps(batch, level) {
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

async function gatePartReady(batch, file, module, teil, level) {
  const rec = batchToRecord(batch, file, module, teil, level);
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

function collectRepairIssues(batch, level) {
  const issues = collectMcqLengthBiasIssues(batch, { gate: true, level });
  for (const q of batch.questions || []) {
    if (!q._lengthBiasQuarantine) continue;
    if (issues.some((i) => i.startsWith(`${q.id}:`))) continue;
    const r = checkMcqQuestionLengthBias(q, { gate: false, level });
    if (r.detail) issues.push(r.detail);
  }
  return issues;
}

async function runLlmLengthBiasRepair(batch, file, module, level) {
  const issues = collectRepairIssues(batch, level);
  if (!issues.length) return { batch, costUsd: 0, repaired: false, issues: [] };

  let costUsd = 0;
  const tracked = wrapSurgicalCallLlm(async (opts) => {
    const r = await callLlm(opts);
    costUsd += r.costUsd;
    return r;
  });

  const repaired = await repairMcqLengthBiasBatch(batch, 5, issues, tracked, {
    module: String(module).toLowerCase(),
    level,
  });

  let out = repaired || batch;
  const cleared = clearStaleLengthStamps(out, level);
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

async function processStampOnlyFile(file, cell, level) {
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const abs = poolFileAbs(file, level);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { batch: cleared, cleared: ids, stillBad } = clearStaleLengthStamps(batch, level);

  if (stillBad.length) {
    return { file, cell, phase: 'stamp-only', outcome: 'reclassified_to_llm', stillBad };
  }

  const langGate = assertBatchGermanExamContent(cleared, { lang: 'de', file });
  if (!langGate.ok) {
    return { file, cell, phase: 'stamp-only', outcome: 'q5_block', detail: langGate.findings?.[0]?.detail };
  }

  const partGate = await gatePartReady(cleared, file, module, teil, level);
  const officialReady = !batchHasOfficialQuarantine(cleared) && langGate.ok && partGate.ok;

  if (officialReady && !dryRun) {
    const tagged = {
      ...cleared,
      _lengthBiasRemediatedAt: new Date().toISOString(),
      _lengthBiasRemediatedVia: 'stamp-clear',
    };
    writePoolVerified(file, tagged, level);
    await syncPoolVerifiedBatch({ file, batch: tagged, level, opts: { lang: 'de' } });
  }

  return { file, cell, phase: 'stamp-only', outcome: officialReady ? 'official-ready' : 'not-ready', officialReady, partGate };
}

async function processLlmFile(file, cell, level) {
  const [module, teilStr] = cell.split('_');
  const teil = Number(teilStr);
  const abs = poolFileAbs(file, level);
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const repair = await runLlmLengthBiasRepair(batch, file, module, level);
  batch = repair.batch;

  if (repair.q5Blocked) {
    return { file, cell, phase: 'llm', outcome: 'q5_block', detail: repair.q5Detail, costUsd: repair.costUsd || 0 };
  }

  const partGate = await gatePartReady(batch, file, module, teil, level);
  const lbIssues = collectMcqLengthBiasIssues(batch, { gate: true, level }).length;
  const officialReady =
    !batchHasOfficialQuarantine(batch) && lbIssues === 0 && partGate.ok;

  if (officialReady && !dryRun) {
    const tagged = {
      ...batch,
      _lengthBiasRemediatedAt: new Date().toISOString(),
      _lengthBiasRemediatedVia: 'mcqLengthBiasRepair',
    };
    writePoolVerified(file, tagged, level);
    await syncPoolVerifiedBatch({ file, batch: tagged, level, opts: { lang: 'de' } });
  }

  return {
    file,
    cell,
    phase: 'llm',
    outcome: officialReady ? 'official-ready' : repair.repaired ? 'partial-still-quarantined' : 'repair-failed',
    costUsd: repair.costUsd || 0,
    officialReady,
    partGate,
  };
}

console.log(`\n══ Length-bias remediation ${args.cells.join(', ')} ${dryRun ? '(dry-run)' : ''} ══\n`);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  cells: args.cells,
  results: [],
  totalCostUsd: 0,
  officialReadyCount: 0,
};

let processed = 0;

for (const cell of args.cells) {
  const { stampOnly, llmActive } = classifyCellFiles(cell, args.level);
  console.log(`${cell}: stamp-only=${stampOnly.length} llm=${llmActive.length}`);

  if (!llmOnlyFlag) {
    for (const file of stampOnly) {
      if (processed >= args.max) break;
      console.log(`  [stamp] ${file}`);
      const r = await processStampOnlyFile(file, cell, args.level);
      report.results.push(r);
      if (r.officialReady) report.officialReadyCount++;
      console.log(`    → ${r.outcome}`);
      processed++;
    }
  }

  if (!stampOnlyFlag) {
    for (const file of llmActive) {
      if (processed >= args.max) break;
      console.log(`  [llm] ${file}`);
      const r = await processLlmFile(file, cell, args.level);
      report.results.push(r);
      report.totalCostUsd += r.costUsd || 0;
      if (r.officialReady) report.officialReadyCount++;
      console.log(`    → ${r.outcome}${r.officialReady ? ' ✓' : ''} ($${(r.costUsd || 0).toFixed(4)})`);
      processed++;
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\nOfficial-ready from this run: ${report.officialReadyCount}`);
console.log(`LLM cost: $${report.totalCostUsd.toFixed(4)}`);
console.log(`Report: ${path.relative(ROOT, OUT)}`);
