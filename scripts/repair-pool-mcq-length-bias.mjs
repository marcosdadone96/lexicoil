#!/usr/bin/env node
/**
 * Pool-wide CHK-33 remediation: balanceMcq normalize + MCQ length-bias LLM repair (anti-worsening guard).
 *
 *   node scripts/repair-pool-mcq-length-bias.mjs --preview [--sample 8]
 *   node scripts/repair-pool-mcq-length-bias.mjs --apply --confirm [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { inferBatchLevel } from './lib/batchPaths.mjs';
import { collectMcqLengthBiasIssues, mcqOptionBody } from './lib/mcqLengthBias.mjs';
import { lengthBiasScore, repairMcqLengthBiasBatch } from './lib/mcqLengthBiasRepair.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
} from './lib/generationCostLog.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

loadEnvFile();

const LEVELS = ['B1', 'A2'];
const POOL_ROOT = path.join(ROOT, 'batches/ready/pool-verified');

function parseArgs(argv) {
  let sample = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample') sample = Math.max(1, Number(argv[++i]) || 8);
  }
  return {
    apply: argv.includes('--apply'),
    preview: argv.includes('--preview'),
    confirm: argv.includes('--confirm'),
    syncSeed: argv.includes('--sync-seed'),
    listOnly: argv.includes('--list-only'),
    sample,
  };
}

function inferCtx(filename, batch) {
  const base = filename.replace(/\.json$/, '');
  const m = base.match(/^(lesen|horen|schreiben|sprechen)-t(\d+)/i);
  const module = m
    ? m[1].toLowerCase()
    : String(batch.module || batch.questions?.[0]?.module || 'lesen').toLowerCase();
  const teil = m ? Number(m[2]) : Number(batch.teil ?? batch.questions?.[0]?.teil ?? 1);
  const level = inferBatchLevel(batch);
  return { module, teil, lang: 'de', level: level === 'MIXED' ? 'B1' : level };
}

function listPoolFiles() {
  const files = [];
  for (const lv of LEVELS) {
    const dir = path.join(POOL_ROOT, lv);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && !f.startsWith('.')) {
        files.push({ level: lv, file: f, abs: path.join(dir, f) });
      }
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

function chk33Issues(batch, filename, poolLevel) {
  const ctx = inferCtx(filename, batch);
  const lv = ctx.level;
  const findings = [];
  const lengthMsgs = collectMcqLengthBiasIssues(batch, { gate: false, level: lv });
  for (const msg of lengthMsgs) findings.push({ kind: 'length', message: msg });
  const hasMcq = (batch.questions || []).some((q) => {
    const t = String(q.type || '').toLowerCase();
    return t === 'multiple_choice' || t === 'multiple' || t === 'mcq';
  });
  if (hasMcq && !batch._balanceMcqVersion) {
    findings.push({ kind: 'balance_stamp', message: '_balanceMcqVersion missing' });
  }
  return { ctx, lv, findings, lengthMsgs, needsWork: findings.length > 0 };
}

function pickSample(affected, n) {
  const buckets = new Map();
  for (const a of affected) {
    const key = `${a.level}|${a.ctx.module}|T${a.ctx.teil}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(a);
  }
  const picked = [];
  const keys = [...buckets.keys()].sort();
  let ki = 0;
  while (picked.length < n && keys.length) {
    const k = keys[ki % keys.length];
    const arr = buckets.get(k);
    if (arr.length) picked.push(arr.shift());
    else keys.splice(ki % keys.length, 1);
    ki++;
  }
  return picked.slice(0, n);
}

function optionSnapshot(q) {
  return (q.options || []).slice(0, 3).map((o) => mcqOptionBody(o));
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

async function repairOne(entry, batch, { useLlm }) {
  const { ctx, lv, lengthMsgs } = chk33Issues(batch, entry.file, entry.level);
  let working = structuredClone(batch);
  let normalizeError = null;
  try {
    working = normalizeBatch(working, ctx);
  } catch (err) {
    normalizeError = err.message;
    return { ok: false, normalizeError, batch: working, ctx, lv, costUsd: 0 };
  }

  const postNormMsgs = collectMcqLengthBiasIssues(working, { gate: false, level: lv });
  let costUsd = 0;
  if (useLlm && postNormMsgs.length) {
    const tracked = wrapSurgicalCallLlm(async (opts) => {
      const r = await callLlm(opts);
      costUsd += r.costUsd;
      return r;
    });
    const repaired = await repairMcqLengthBiasBatch(
      working,
      ctx.teil,
      postNormMsgs,
      tracked,
      { module: ctx.module, level: lv },
    );
    if (repaired) working = repaired;
  }

  const remaining = collectMcqLengthBiasIssues(working, { gate: false, level: lv });
  const hasStamp = !!working._balanceMcqVersion;
  return {
    ok: remaining.length === 0 && hasStamp && !normalizeError,
    normalizeError,
    batch: working,
    ctx,
    lv,
    costUsd,
    remaining,
    postNormBeforeLlm: postNormMsgs.length,
  };
}

function buildPreviewDiff(before, after, lengthMsgsBefore) {
  const ids = new Set();
  for (const msg of lengthMsgsBefore) {
    const m = String(msg).match(/^([^:]+): sesgo/i);
    if (m) ids.add(m[1]);
  }
  const diffs = [];
  for (const id of ids) {
    const bq = before.questions?.find((q) => q.id === id);
    const aq = after.questions?.find((q) => q.id === id);
    if (!bq || !aq) continue;
    diffs.push({
      id,
      scoreBefore: lengthBiasScore(bq),
      scoreAfter: lengthBiasScore(aq),
      optionsBefore: optionSnapshot(bq),
      optionsAfter: optionSnapshot(aq),
    });
  }
  return diffs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.preview && !(args.apply && args.confirm) && !args.listOnly) {
    console.error(`
Usage:
  node scripts/repair-pool-mcq-length-bias.mjs --preview [--sample 8]
  node scripts/repair-pool-mcq-length-bias.mjs --apply --confirm [--sync-seed]
`);
    process.exit(1);
  }

  const entries = listPoolFiles();
  const affected = [];
  for (const e of entries) {
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const scan = chk33Issues(batch, e.file, e.level);
    if (scan.needsWork) affected.push({ ...e, ...scan, batch });
  }

  console.log(`\n── CHK-33 pool scan (${LEVELS.join('+')}) ──`);
  console.log(`Total JSON: ${entries.length}`);
  console.log(`Affected files: ${affected.length}`);
  const lengthFindings = affected.reduce((n, a) => n + a.lengthMsgs.length, 0);
  const stampFiles = affected.filter((a) => a.findings.some((f) => f.kind === 'balance_stamp')).length;
  console.log(`Length-bias messages (gate:false): ${lengthFindings}`);
  console.log(`Files missing _balanceMcqVersion: ${stampFiles}\n`);

  if (args.listOnly) {
    for (const a of affected) console.log(`  ${a.level}/${a.file}  len=${a.lengthMsgs.length} stamp=${!a.batch._balanceMcqVersion}`);
    return;
  }

  const queue = args.sample > 0 && args.preview && !args.apply
    ? pickSample(affected, args.sample)
    : affected;

  if (args.preview && args.sample > 0) {
    console.log(`── Preview sample: ${queue.length} file(s) ──\n`);
  }

  const useLlm = true;
  let totalCost = 0;
  const previewRows = [];
  const blocked = [];
  const partials = [];
  const appliedOk = [];

  for (const a of queue) {
    console.log(`\n▶ ${a.level}/${a.file}`);
    const result = await repairOne(a, a.batch, { useLlm: args.preview || args.apply });
    totalCost += result.costUsd;
    if (result.normalizeError) {
      console.log(`  BLOCKED normalize: ${result.normalizeError}`);
      const blockedEntry = {
        file: `${a.level}/${a.file}`,
        abs: a.abs,
        error: result.normalizeError,
        action: 'full_part_regeneration',
        reason: 'normalizeBatch balanceMcq contract failed — do not force CHK-33 repair path',
      };
      blocked.push(blockedEntry);
      if (args.apply && args.confirm) {
        const flagged = structuredClone(a.batch);
        flagged._mcqLengthBiasRepairBlocked = {
          at: new Date().toISOString(),
          script: 'repair-pool-mcq-length-bias.mjs',
          normalizeError: result.normalizeError,
          action: 'needs_full_regeneration',
        };
        fs.writeFileSync(a.abs, `${JSON.stringify(flagged, null, 2)}\n`, 'utf8');
      }
      continue;
    }
    const diffs = buildPreviewDiff(a.batch, result.batch, a.lengthMsgs);
    for (const d of diffs) {
      console.log(`  ${d.id}: score ${d.scoreBefore}% → ${d.scoreAfter}%`);
      console.log(`    antes: ${JSON.stringify(d.optionsBefore)}`);
      console.log(`    después: ${JSON.stringify(d.optionsAfter)}`);
    }
    console.log(
      `  post-normalize LLM targets: ${result.postNormBeforeLlm} · remaining CHK-33 length: ${result.remaining.length} · _balanceMcqVersion: ${result.batch._balanceMcqVersion || '—'}`,
    );
    const hadLengthBefore = a.lengthMsgs.length;
    const improvedCount = Math.max(0, hadLengthBefore - result.remaining.length);
    const row = {
      file: `${a.level}/${a.file}`,
      diffs,
      remaining: result.remaining.length,
      remainingMessages: result.remaining,
      hadLengthBefore,
      improvedCount,
      balanceVersion: result.batch._balanceMcqVersion,
      ok: result.ok,
      partial: result.remaining.length > 0 && improvedCount > 0,
      unchangedFail: result.remaining.length > 0 && improvedCount === 0 && hadLengthBefore > 0,
    };
    previewRows.push(row);

    if (args.apply && args.confirm) {
      fs.writeFileSync(a.abs, `${JSON.stringify(result.batch, null, 2)}\n`, 'utf8');
      if (result.ok) appliedOk.push(row.file);
      else if (row.partial) partials.push(row);
      else if (result.remaining.length > 0) partials.push({ ...row, note: 'no_improvement_or_partial' });
      if (args.syncSeed) {
        const rel = `batches/ready/pool-verified/${a.level}/${a.file}`;
        await syncPoolVerifiedBatch({
          file: a.file,
          batch: result.batch,
          level: a.level,
          opts: { sourceFile: rel, trigger: 'repair-pool-mcq-length-bias', syncBlobs: false },
        });
      }
    }
  }

  const logPath = path.join(
    ROOT,
    'batches/ready/gate-logs',
    `pool-mcq-length-bias-${args.apply ? 'apply' : 'preview'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  );
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'preview',
        sample: args.sample || null,
        affected: affected.length,
        processed: queue.length,
        totalCostUsd: totalCost,
        blocked,
        blockedNormalizeForFullRegen: blocked,
        partialsAfterApply: partials,
        appliedClean: appliedOk,
        previewRows,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n── Log: ${path.relative(ROOT, logPath).replace(/\\/g, '/')} ──`);
  console.log(`API cost (processed): $${totalCost.toFixed(4)}`);
  if (args.preview && !args.apply) {
    console.log('\n[repair] Preview only — confirm with: node scripts/repair-pool-mcq-length-bias.mjs --apply --confirm [--sync-seed]');
  }
  if (args.apply && args.confirm) {
    console.log(`\n── Apply summary ──`);
    console.log(`Clean (0 CHK-33 length + stamp): ${appliedOk.length}`);
    console.log(`Partial / residual length: ${partials.length}`);
    console.log(`Blocked (full regen): ${blocked.length}`);
    const regenDoc = path.join(ROOT, 'batches/ready/gate-logs/CHK-33-normalize-blocked-full-regen.json');
    fs.writeFileSync(
      regenDoc,
      `${JSON.stringify({ at: new Date().toISOString(), blocked, note: 'Do not run normalizeBatch repair on these; regenerate part.' }, null, 2)}\n`,
    );
    console.log(`Regen list: ${path.relative(ROOT, regenDoc).replace(/\\/g, '/')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
