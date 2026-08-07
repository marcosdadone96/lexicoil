#!/usr/bin/env node
/**
 * Retira de pool-verified los Hören A2 T1–T3 con Emma+Jonas/Clara+Tobias y regenera
 * con gate de nombres activo (mismo topicTag que el batch retirado).
 *
 *   node scripts/regenerate-a2-horen-hot-pair-slots.mjs --dry-run
 *   node scripts/regenerate-a2-horen-hot-pair-slots.mjs
 *   node scripts/regenerate-a2-horen-hot-pair-slots.mjs --include-pre-gate-t3-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import {
  extractDialoguePairs,
  pairKey,
  DIALOGUE_HOT_PAIRS,
} from './lib/dialogueNamesBank.mjs';

const dryRun = process.argv.includes('--dry-run');
const includePreGate = process.argv.includes('--include-pre-gate-t3-test');

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const destDir = path.join(ROOT, 'batches/needs-regeneration/A2');
fs.mkdirSync(destDir, { recursive: true });

const PRE_GATE = new Set([
  'horen-t3-gemini-065.json',
  'horen-t3-gemini-066.json',
  'horen-t3-gemini-067.json',
  'horen-t3-gemini-068.json',
]);

function listHotInPool() {
  const out = [];
  for (const file of fs.readdirSync(poolDir).filter((f) => /^horen-t[123]-/.test(f))) {
    if (!includePreGate && PRE_GATE.has(file)) continue;
    const abs = path.join(poolDir, file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const teil = Number(batch.teil ?? batch.passages?.[0]?.teil);
    const pairs = extractDialoguePairs(batch).map(([a, b]) => pairKey(a, b));
    const hits = pairs.filter((p) => DIALOGUE_HOT_PAIRS.has(p));
    if (hits.length) {
      out.push({ file, teil, topic: batch.topicTag || batch.passages?.[0]?.topicTag || 'Freizeit', hits });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

function retireFile(file, reason) {
  const src = path.join(poolDir, file);
  if (!fs.existsSync(src)) return { file, ok: false, error: 'missing' };
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  batch._poolRetiredAt = new Date().toISOString();
  batch._poolRetiredReason = reason;
  batch._poolRetiredFrom = `pool-verified/A2/${file}`;
  const dest = path.join(destDir, file);
  if (dryRun) return { file, ok: true, dryRun: true, dest: dest.replace(/\\/g, '/') };
  fs.writeFileSync(dest, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.unlinkSync(src);
  return { file, ok: true, dest: dest.replace(/\\/g, '/') };
}

function regenerateOne({ teil, topic }) {
  const cmd = [
    'node',
    'scripts/generate-part-gemini.mjs',
    '--module',
    'horen',
    '--teil',
    String(teil),
    '--level',
    'A2',
    '--from-bank',
    '--topic',
    topic,
    '--count',
    '1',
    '--fix-retries',
    '3',
    '--max-api-calls',
    '80',
  ];
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const log = `${r.stdout || ''}${r.stderr || ''}`;
  const poolOk = /\[poolReady\] READY → pool-verified\/A2\/(\S+\.json)/.exec(log);
  return {
    teil,
    topic,
    exitCode: r.status ?? 1,
    ok: !!poolOk,
    newFile: poolOk?.[1] || null,
    logTail: log.slice(-2500),
  };
}

const targets = listHotInPool();
const report = {
  at: new Date().toISOString(),
  dryRun,
  includePreGate,
  targets: targets.map((t) => t.file),
  retired: [],
  regenerations: [],
};

console.log(`Hot-pair slots to sweep: ${targets.length}`);

for (const t of targets) {
  const ret = retireFile(t.file, 'A2-horen-hot-pair-sweep-2026-07-27');
  report.retired.push({ ...t, ...ret });
  console.log(`${dryRun ? '[dry-run] ' : ''}retired ${t.file} (${t.hits.join(', ')})`);
  if (dryRun || !ret.ok) continue;

  console.log(`\n>>> Regenerating T${t.teil} topic=${t.topic} (replaces ${t.file})`);
  const gen = regenerateOne(t);
  report.regenerations.push({ replaced: t.file, ...gen });
  console.log(gen.ok ? `OK → ${gen.newFile}` : `FAIL exit=${gen.exitCode}`);
  if (!gen.ok) console.log(gen.logTail);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-hot-pair-regen-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${out.replace(/\\/g, '/')}`);

const okCount = report.regenerations.filter((g) => g.ok).length;
if (!dryRun && okCount < targets.length) process.exit(2);
