/**
 * Q3-B warn-first sweep over pool-verified/ (134 files).
 *
 *   NODE_OPTIONS=--use-system-ca node scripts/sweep-q3b-pool-verified.mjs --estimate-only
 *   NODE_OPTIONS=--use-system-ca node scripts/sweep-q3b-pool-verified.mjs --run
 *   NODE_OPTIONS=--use-system-ca node scripts/sweep-q3b-pool-verified.mjs --run --resume
 *
 * Detection only — does NOT mutate pool files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { POOL_VERIFIED_DIR } from './lib/finalizePoolReady.mjs';
import {
  runQ3bSemanticCoherence,
  buildQ3bPrompt,
  Q3B_PROMPT_VERSION,
  DEFAULT_HAIKU_MODEL,
} from './lib/qualityGates/semanticCoherenceGate.mjs';

loadEnvFile();

const estimateOnly = process.argv.includes('--estimate-only');
const doRun = process.argv.includes('--run');
const resume = process.argv.includes('--resume');
const PRICE_IN = 1.0;
const PRICE_OUT = 5.0;

const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const CHECKPOINT = path.join(LOG_DIR, 'Q3B-SWEEP-134-checkpoint.json');
const REPORT = path.join(LOG_DIR, 'Q3B-SWEEP-134-2026-07-10.json');
const JSONL = path.join(LOG_DIR, 'Q3B-SWEEP-134-2026-07-10.jsonl');

function usd(usage) {
  if (!usage) return 0;
  return (usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT) / 1e6;
}

function listFiles() {
  return listPoolVerifiedJson('B1').map((abs) => path.basename(abs)).sort();
}

function resolvePoolFile(file) {
  return listPoolVerifiedJson('B1').find((abs) => path.basename(abs) === file) || path.join(POOL_VERIFIED_DIR, file);
}

function estimate(files) {
  let estIn = 0;
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(resolvePoolFile(file), 'utf8'));
    estIn += Math.ceil(buildQ3bPrompt(batch, file).length / 4);
  }
  const estOut = files.length * 700;
  return {
    n: files.length,
    estIn,
    estOut,
    usd: (estIn * PRICE_IN + estOut * PRICE_OUT) / 1e6,
  };
}

if (!estimateOnly && !doRun) {
  console.log('Usage: --estimate-only | --run [--resume]');
  process.exit(1);
}

const files = listFiles();
const est = estimate(files);
console.log(
  JSON.stringify(
    {
      promptVersion: Q3B_PROMPT_VERSION,
      model: process.env.Q2_ANSWER_KEY_MODEL || DEFAULT_HAIKU_MODEL,
      scope: 'pool-verified only',
      n: est.n,
      estimateUsd: Number(est.usd.toFixed(4)),
      estTokens: { in: est.estIn, out: est.estOut },
    },
    null,
    2,
  ),
);
if (estimateOnly) process.exit(0);

let done = new Set();
let results = [];
let totalIn = 0;
let totalOut = 0;
let totalUsd = 0;

if (resume && fs.existsSync(CHECKPOINT)) {
  const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  results = cp.results || [];
  done = new Set(results.map((r) => r.file));
  totalIn = cp.totalIn || 0;
  totalOut = cp.totalOut || 0;
  totalUsd = cp.totalUsd || 0;
  console.log(`Resume: ${done.size}/${files.length} already done`);
} else if (fs.existsSync(JSONL) && !resume) {
  fs.writeFileSync(JSONL, '');
}

for (const file of files) {
  if (done.has(file)) continue;
  const abs = resolvePoolFile(file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  process.stdout.write(`Q3-B ${file}… `);
  try {
    const r = await runQ3bSemanticCoherence(batch, { file });
    const cost = usd(r.usage);
    if (r.usage) {
      totalIn += r.usage.inputTokens;
      totalOut += r.usage.outputTokens;
      totalUsd += cost;
    }
    const row = {
      file,
      ok: r.ok,
      findingsCount: r.findings.length,
      blockCount: r.findings.filter((f) => f.severity === 'block').length,
      warnCount: r.findings.filter((f) => f.severity === 'warn').length,
      findings: r.findings,
      filteredT3Zero: r.filteredT3Zero || 0,
      usage: r.usage,
      costUsd: Number(cost.toFixed(5)),
      model: r.model,
      promptVersion: r.promptVersion,
    };
    results.push(row);
    fs.appendFileSync(JSONL, `${JSON.stringify(row)}\n`);
    console.log(
      `${r.findings.length ? 'FINDINGS' : 'clean'} ${r.findings.length}` +
        (r.filteredT3Zero ? ` (t3-zero filtered ${r.filteredT3Zero})` : '') +
        ` $${cost.toFixed(4)}`,
    );
  } catch (err) {
    console.log('ERROR', err.message);
    const row = { file, error: String(err.message || err), findings: [], ok: false };
    results.push(row);
    fs.appendFileSync(JSONL, `${JSON.stringify(row)}\n`);
  }

  fs.writeFileSync(
    CHECKPOINT,
    `${JSON.stringify({ at: new Date().toISOString(), totalIn, totalOut, totalUsd, results }, null, 2)}\n`,
  );
}

const withFindings = results.filter((r) => (r.findingsCount || 0) > 0);
const withErrors = results.filter((r) => r.error);
const byAxis = {};
for (const r of results) {
  for (const f of r.findings || []) {
    const k = `${f.axis}/${f.reason}`;
    byAxis[k] = (byAxis[k] || 0) + 1;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  promptVersion: Q3B_PROMPT_VERSION,
  scope: 'pool-verified',
  n: files.length,
  processed: results.length,
  cost: {
    estimateUsd: Number(est.usd.toFixed(4)),
    realUsd: Number(totalUsd.toFixed(4)),
    realInputTokens: totalIn,
    realOutputTokens: totalOut,
  },
  summary: {
    clean: results.filter((r) => !r.error && (r.findingsCount || 0) === 0).length,
    withFindings: withFindings.length,
    errors: withErrors.length,
    totalFindings: results.reduce((s, r) => s + (r.findingsCount || 0), 0),
    byAxis,
  },
  filesWithFindings: withFindings.map((r) => ({
    file: r.file,
    findingsCount: r.findingsCount,
    findings: r.findings,
  })),
  errors: withErrors,
};

fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  `# Q3-B sweep pool-verified — ${report.generatedAt.slice(0, 10)}`,
  '',
  `- Prompt: \`${Q3B_PROMPT_VERSION}\``,
  `- Scope: **${files.length}** files in \`pool-verified/\` only`,
  `- Cost: **$${report.cost.realUsd}** (est $${report.cost.estimateUsd})`,
  `- Clean: ${report.summary.clean} · With findings: ${report.summary.withFindings} · Errors: ${report.summary.errors}`,
  `- Total findings: ${report.summary.totalFindings}`,
  '',
  '## By axis/reason',
  '',
  ...Object.entries(byAxis)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- \`${k}\`: ${n}`),
  '',
  '## Files with findings',
  '',
  ...withFindings.map(
    (r) =>
      `- **${r.file}** (${r.findingsCount}): ` +
      r.findings.map((f) => `\`${f.axis}/${f.reason}\` «${(f.quote || '').slice(0, 60)}»`).join('; '),
  ),
  '',
];
const mdPath = path.join(LOG_DIR, 'Q3B-SWEEP-134-2026-07-10.md');
fs.writeFileSync(mdPath, md.join('\n'));

console.log(`\nDone. Report: ${REPORT}`);
console.log(`MD: ${mdPath}`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Cost real: $${report.cost.realUsd}`);
