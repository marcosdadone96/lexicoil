#!/usr/bin/env node
/**
 * Fill B1 official exam gap to capacity 12 — pool-fill per bottleneck cell.
 *   node scripts/fill-official-b1-gap.mjs
 *   node scripts/fill-official-b1-gap.mjs --dry-run
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { maybeAutoPublishExams } from './lib/autoPublishExamsLib.mjs';

loadEnvFile();

const dryRun = process.argv.includes('--dry-run');

/** Targets to raise each cell from current stock to 12 (official mode). */
const GAPS = [
  { module: 'lesen', teil: 2, target: 2 },
  { module: 'lesen', teil: 1, target: 1 },
  { module: 'lesen', teil: 4, target: 1 },
  { module: 'lesen', teil: 5, target: 1 },
  { module: 'horen', teil: 2, target: 2 },
  { module: 'horen', teil: 4, target: 2 },
];

function runNode(script, args) {
  console.log(`\n>>> node ${script} ${args.join(' ')}`);
  if (dryRun) return { ok: true, skipped: true };
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--use-system-ca' },
    maxBuffer: 30 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { ok: r.status === 0, status: r.status };
}

const report = { generatedAt: new Date().toISOString(), dryRun, steps: [] };

for (const gap of GAPS) {
  const args = [
    '--module', gap.module,
    '--teil', String(gap.teil),
    '--target', String(gap.target),
    '--level', 'B1',
    '--publish',
    '--max-api-calls', '40',
  ];
  const r = runNode('scripts/pool-fill-teil.mjs', args);
  report.steps.push({ ...gap, ...r });
  if (!r.ok && !dryRun) {
    console.warn(`Warning: pool-fill ${gap.module} T${gap.teil} exited ${r.status} — continuing`);
  }
}

if (!dryRun) {
  runNode('scripts/assemble-from-pool-verified.mjs', ['--max', '12', '--level', 'B1', '--mode', 'official']);
  const pub = await maybeAutoPublishExams({
    lang: 'de',
    level: 'B1',
    mode: 'official',
    trigger: 'fill-official-b1-gap',
    dryRun: false,
  });
  report.autoPublish = pub;
  report.liveCount = pub.liveCount;
}

const out = path.join(ROOT, 'batches/ready/gate-logs/fill-official-b1-gap.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n══ fill-official-b1-gap done ══');
if (report.liveCount != null) console.log(`Live exams: ${report.liveCount}`);
