#!/usr/bin/env node
/**
 * Regenera los 4 T3 retirados por prueba pre-gate (065–068), topic desde archivo archivado.
 *   node scripts/regenerate-a2-horen-pre-gate-t3-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';

const FILES = [
  'horen-t3-gemini-065.json',
  'horen-t3-gemini-066.json',
  'horen-t3-gemini-067.json',
  'horen-t3-gemini-068.json',
];
const srcDir = path.join(ROOT, 'batches/needs-regeneration/A2');

const report = { at: new Date().toISOString(), runs: [] };

for (const file of FILES) {
  const abs = path.join(srcDir, file);
  if (!fs.existsSync(abs)) {
    report.runs.push({ file, ok: false, error: 'missing in needs-regeneration' });
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const topic = batch.topicTag || batch.passages?.[0]?.topicTag || 'Freizeit';
  const cmd = [
    'node',
    'scripts/generate-part-gemini.mjs',
    '--module',
    'horen',
    '--teil',
    '3',
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
  console.log(`\n>>> T3 regen (was ${file}) topic=${topic}`);
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const log = `${r.stdout || ''}${r.stderr || ''}`;
  const m = /\[poolReady\] READY → pool-verified\/A2\/(\S+\.json)/.exec(log);
  report.runs.push({
    file,
    topic,
    ok: !!m,
    newFile: m?.[1] || null,
    exitCode: r.status ?? 1,
  });
  console.log(m ? `OK → ${m[1]}` : `FAIL (exit ${r.status})`);
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-pre-gate-t3-regen-evidence.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.runs.some((x) => !x.ok)) process.exit(2);
