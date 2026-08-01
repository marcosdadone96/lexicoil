#!/usr/bin/env node
/**
 * Close the 13 A2 pool-verified files with IMPORTANT findings (~$1.16 budget).
 *   node scripts/repair-a2-pool-important-close.mjs --dry-run
 *   node scripts/repair-a2-pool-important-close.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { inferBatchLevel } from './lib/batchPaths.mjs';
import { collectMcqLengthBiasIssues } from './lib/mcqLengthBias.mjs';
import { repairMcqLengthBiasBatch } from './lib/mcqLengthBiasRepair.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
} from './lib/generationCostLog.mjs';
import { checkMcqDistinctBatch } from './lib/mcqDistinctCheck.mjs';
import { repairL2McqDistinctBatch } from './lib/l2McqDistinctRepair.mjs';
import { findKeyExplanationMismatches } from './lib/keyExplanationGate.mjs';
import { repairExplanationBatch } from './lib/explanationRepair.mjs';
import { antiRuns } from './lib/balanceMcq.mjs';

loadEnvFile();

const apply = process.argv.includes('--apply');
const poolDir = poolVerifiedDir('A2');

const TARGET = [
  'horen-t1-cur-health.json',
  'horen-t4-cur-health.json',
  'horen-t4-cur-work.json',
  'lesen-t1-cur-health.json',
  'lesen-t1-cur-society.json',
  'lesen-t2-cur-education.json',
  'lesen-t2-cur-health.json',
  'lesen-t2-cur-society.json',
  'lesen-t2-cur-work.json',
  'lesen-t3-cur-education.json',
  'lesen-t3-cur-society.json',
  'lesen-t4-cur-education.json',
  'lesen-t4-cur-work.json',
];

const CHK33_FILES = new Set([
  'horen-t1-cur-health.json',
  'lesen-t1-cur-health.json',
  'lesen-t1-cur-society.json',
  'lesen-t2-cur-work.json',
  'lesen-t3-cur-education.json',
  'lesen-t3-cur-society.json',
]);

const CHK28_FILES = [
  'lesen-t2-cur-education.json',
  'lesen-t2-cur-health.json',
  'lesen-t2-cur-society.json',
  'lesen-t2-cur-work.json',
];

const VALID_TITLE_END_RE = /[.!?»"\u201d)\]:]\s*$/u;

function inferCtx(filename, batch) {
  const base = filename.replace(/\.json$/, '');
  const m = base.match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
  const module = m
    ? m[1].toLowerCase()
    : String(batch.module || batch.questions?.[0]?.module || 'lesen').toLowerCase();
  const teil = m ? Number(m[2]) : Number(batch.teil ?? batch.questions?.[0]?.teil ?? 1);
  const level = inferBatchLevel(batch);
  return { module, teil, lang: 'de', level: level === 'MIXED' ? 'A2' : level };
}

function fixT4AdTitlePeriods(batch) {
  const passages = (batch.passages || []).map((p) => {
    const title = String(p.title || p.textTitle || '').trim();
    if (!title || VALID_TITLE_END_RE.test(title)) return p;
    return { ...p, title: `${title}.` };
  });
  return { ...batch, passages };
}

function hasConsecutiveAnswerRun(questions, runThreshold = 4) {
  const vals = (questions || []).map((q) =>
    String(q.correctAnswer ?? q.correct ?? '').trim(),
  );
  if (vals.length < runThreshold) return false;
  let run = 1;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] && vals[i] === vals[i - 1]) {
      run += 1;
      if (run >= runThreshold) return true;
    } else run = 1;
  }
  return false;
}

function normalizeWithAntiRun(batch, file, ctx) {
  for (let i = 0; i < 24; i++) {
    let b = normalizeBatch(structuredClone(batch), {
      ...ctx,
      shuffleSeed: `a2-important-close-${file}-${i}`,
    });
    b = applyGermanCapsNormalize(b, { log: false }).batch;
    if (!hasConsecutiveAnswerRun(b.questions, 4)) return b;
    const qs = [...(b.questions || [])];
    const broken = antiRuns(qs, 4, { module: ctx.module, teil: ctx.teil });
    if (broken !== qs) {
      b = { ...b, questions: broken };
      b = normalizeBatch(b, { ...ctx, shuffleSeed: `a2-important-close-ar-${file}-${i}` });
      if (!hasConsecutiveAnswerRun(b.questions, 4)) return b;
    }
  }
  return normalizeBatch(batch, { ...ctx, shuffleSeed: `a2-important-close-fallback-${file}` });
}

async function callLlmTracked(acc) {
  return wrapSurgicalCallLlm(async (opts) => {
    const res = await generateContent({
      ...opts,
      thinkingConfig: SURGICAL_THINKING_CONFIG,
      jsonMode: true,
    });
    const usage = parseUsageMetadata(res.usageMetadata || res.usage);
    acc.usd += costUsdFromTokens(
      usage.promptTokens,
      usage.outputTokensBilled,
      usage.cachedContentTokenCount,
    );
    return { text: res.text };
  });
}

async function repairChk33(batch, file, ctx, costAcc) {
  let working = normalizeBatch(structuredClone(batch), ctx);
  const lv = ctx.level;
  let msgs = collectMcqLengthBiasIssues(working, { gate: false, level: lv });
  if (!msgs.length && working._balanceMcqVersion) return working;
  const tracked = await callLlmTracked(costAcc);
  const repaired = await repairMcqLengthBiasBatch(
    working,
    ctx.teil,
    msgs,
    tracked,
    { module: ctx.module, level: lv },
  );
  if (repaired) working = repaired;
  working = normalizeBatch(working, { ...ctx, shuffleSeed: `chk33-${file}` });
  return working;
}

async function repairChk28File(batch, file, costAcc) {
  let current = batch;
  const tracked = await callLlmTracked(costAcc);
  for (let round = 0; round < 8; round++) {
    const { findings: hits } = checkMcqDistinctBatch(current, 2);
    if (!hits.length) break;
    const byId = new Map();
    for (const h of hits) {
      if (!byId.has(h.itemId)) byId.set(h.itemId, []);
      byId.get(h.itemId).push({
        itemId: h.itemId,
        detail: `${h.pair}: ${h.reason || 'opciones no excluyentes'}`,
      });
    }
    let any = false;
    for (const [itemId, findings] of byId) {
      const next = await repairL2McqDistinctBatch(current, findings, tracked);
      if (next) {
        current = next;
        any = true;
      }
    }
    if (!any) break;
    const left = checkMcqDistinctBatch(current, 2);
    if (left.ok) break;
  }
  return current;
}

async function repairChk18b(batch, file, ctx, costAcc) {
  const hits = findKeyExplanationMismatches(batch);
  if (!hits.length) return batch;
  const tracked = await callLlmTracked(costAcc);
  const teil = ctx.teil;
  let repaired = await repairExplanationBatch(batch, hits, tracked, { teil, maxAttempts: 3 });
  if (repaired) {
    repaired = normalizeBatch(repaired, { ...ctx, shuffleSeed: `chk18b-${file}` });
  }
  return repaired || batch;
}

function auditPoolImportant() {
  const audit = spawnSync(
    process.execPath,
    ['scripts/audit-pass-2.mjs', poolDir, '--json', '--fail-on=none'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  let raw = audit.stdout || '';
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    apply,
    files: [],
    totalCostUsd: 0,
  };

  for (const file of TARGET) {
    const abs = path.join(poolDir, file);
    const entry = { file, steps: [], costUsd: 0 };
    let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const ctx = inferCtx(file, batch);

    if (file.startsWith('lesen-t4-cur-')) {
      batch = fixT4AdTitlePeriods(batch);
      entry.steps.push('CHK-30b: título anuncio + punto final');
    }

    if (file === 'horen-t4-cur-work.json') {
      batch = normalizeWithAntiRun(batch, file, ctx);
      entry.steps.push('CHK-14/19: normalize + antiRuns');
    } else if (file === 'horen-t4-cur-health.json' || file === 'lesen-t3-cur-education.json') {
      batch = normalizeBatch(batch, { ...ctx, shuffleSeed: `det-${file}` });
      batch = applyGermanCapsNormalize(batch, { log: false }).batch;
      entry.steps.push('CHK-14: normalize + caps (billiger FP audit / Fragen texto)');
    } else {
      batch = normalizeBatch(batch, { ...ctx, shuffleSeed: `det-${file}` });
      batch = applyGermanCapsNormalize(batch, { log: false }).batch;
    }

    if (file === 'lesen-t4-cur-education.json') {
      entry.steps.push('CHK-27: skip A2 Anzeigen en t4TopicAlign (código)');
    }
    if (file === 'lesen-t2-cur-society.json') {
      entry.steps.push('CHK-18: explanations extendidas (determinista, previo)');
    }

    const costAcc = { usd: 0 };

    if (CHK33_FILES.has(file)) {
      batch = await repairChk33(batch, file, ctx, costAcc);
      entry.steps.push('CHK-33: balanceMcq + LLM length bias');
    }

    if (CHK28_FILES.includes(file)) {
      batch = await repairChk28File(batch, file, costAcc);
      entry.steps.push('CHK-28: LLM mcq_distinct');
    }

    if (file === 'lesen-t2-cur-work.json') {
      batch = await repairChk18b(batch, file, ctx, costAcc);
      entry.steps.push('CHK-18b: LLM explanation');
    }

    entry.costUsd = costAcc.usd;
    report.totalCostUsd += costAcc.usd;
    batch._a2ImportantCloseAt = new Date().toISOString();
    batch._a2ImportantCloseSteps = entry.steps;

    if (apply) {
      fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    }
    report.files.push(entry);
    console.log(`\n▶ ${file}`);
    for (const s of entry.steps) console.log(`  · ${s}`);
    console.log(`  cost: $${entry.costUsd.toFixed(4)}`);
  }

  const audit = auditPoolImportant();
  const imp = (audit.findings || []).filter((f) => f.severity === 'IMPORTANT');
  const crit = (audit.findings || []).filter((f) => f.severity === 'CRITICAL');
  const impByFile = {};
  for (const f of imp) {
    impByFile[f.file] = impByFile[f.file] || [];
    impByFile[f.file].push(f.id);
  }

  report.finalAudit = {
    critical: crit.length,
    important: imp.length,
    importantByFile: impByFile,
  };

  const logPath = path.join(
    ROOT,
    'batches/ready/gate-logs',
    `a2-pool-important-close-${apply ? 'apply' : 'dry'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  );
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n── Total API: $${report.totalCostUsd.toFixed(4)} ──`);
  console.log(`── Re-audit: CRITICAL=${crit.length} IMPORTANT=${imp.length} ──`);
  if (imp.length) {
    for (const [f, ids] of Object.entries(impByFile)) {
      console.log(`  ${f}: ${[...new Set(ids)].join(', ')}`);
    }
  }
  console.log(`── Log: ${path.relative(ROOT, logPath).replace(/\\/g, '/')} ──`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
