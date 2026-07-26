#!/usr/bin/env node
/**
 * Volume test — 3 A2 cells (Lesen T1, Hören T2, Hören T3).
 * Runs N attempts per cell, logs full stdout to docs/volume-a2-logs/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATTEMPTS = Number(process.env.VOLUME_ATTEMPTS || 6);
const LOG_DIR = path.join(ROOT, 'docs', 'volume-a2-logs');

const CELLS = [
  {
    id: 'lesen-t1',
    label: 'Lesen A2 T1',
    cmd: [
      'node',
      'scripts/generate-lesen-part-gemini.mjs',
      '--teil',
      '1',
      '--level',
      'A2',
      '--from-bank',
      '--count',
      '1',
      '--max-api-calls',
      '45',
      '--fix-retries',
      '3',
      '--keep-failed',
    ],
  },
  {
    id: 'horen-t2',
    label: 'Hören A2 T2',
    cmd: [
      'node',
      'scripts/generate-part-gemini.mjs',
      '--module',
      'horen',
      '--teil',
      '2',
      '--level',
      'A2',
      '--from-bank',
      '--topic',
      'Freizeit',
      '--count',
      '1',
      '--max-api-calls',
      '45',
      '--fix-retries',
      '3',
      '--keep-failed',
    ],
  },
  {
    id: 'horen-t3',
    label: 'Hören A2 T3',
    cmd: [
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
      'Freizeit',
      '--count',
      '1',
      '--max-api-calls',
      '45',
      '--fix-retries',
      '3',
      '--keep-failed',
    ],
  },
];

function parseOutcome(log, exitCode) {
  const poolReady = log.match(/\[poolReady\] READY → pool-verified\/A2\/(\S+\.json)/);
  if (poolReady) {
    return { status: 'pool-verified', file: poolReady[1], exitCode };
  }
  const poolReject = log.match(/\[poolReady\] REJECT → needs-regeneration\/A2\/(\S+\.json)/);
  if (poolReject) {
    const reasons = log.match(/_poolRejectReason[^\n]*|REJECT →[^\n]+/g);
    return { status: 'pool-reject', file: poolReject[1], reasons: reasons?.join(' ') || '', exitCode };
  }
  if (/DESCARTADO|discarded|Partes guardadas \(formato \+ calidad OK\): 0/.test(log) && exitCode !== 0) {
    return { status: 'discarded', exitCode };
  }
  if (/Guardado:.*pool-verified/.test(log) || /Guardado: batches\/ready\/pool-verified/.test(log)) {
    const f = log.match(/pool-verified\/A2\/(\S+\.json)/);
    return { status: 'pool-verified', file: f?.[1] || '?', exitCode };
  }
  if (/Validación técnica OK/.test(log) && /Calidad.*OK/.test(log) && !/\[poolReady\] READY/.test(log)) {
    return { status: 'quality-ok-no-pool', exitCode };
  }
  return { status: exitCode === 0 ? 'unknown-ok' : 'failed', exitCode };
}

fs.mkdirSync(LOG_DIR, { recursive: true });
const summary = [];

for (const cell of CELLS) {
  const cellResults = [];
  for (let i = 1; i <= ATTEMPTS; i++) {
    const logName = `${cell.id}-attempt-${String(i).padStart(2, '0')}.log`;
    const logPath = path.join(LOG_DIR, logName);
    console.log(`\n======== ${cell.label} · intento ${i}/${ATTEMPTS} ========`);
    const started = new Date().toISOString();
    const res = spawnSync(cell.cmd[0], cell.cmd.slice(1), {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const log = `${res.stdout || ''}${res.stderr || ''}`;
    const header = `# ${cell.label} · intento ${i}/${ATTEMPTS}\n# started: ${started}\n# exit: ${res.status}\n\n`;
    fs.writeFileSync(logPath, header + log, 'utf8');
    const outcome = parseOutcome(log, res.status ?? 1);
    const apiCalls = [...log.matchAll(/Llamada API (\d+)\/45/g)].pop()?.[1] || '?';
    const row = { attempt: i, log: logName, ...outcome, apiCalls };
    cellResults.push(row);
    console.log(`  → ${row.status}${row.file ? ` (${row.file})` : ''} · API ${apiCalls}`);
  }
  const verified = cellResults.filter((r) => r.status === 'pool-verified').length;
  summary.push({ cell: cell.id, label: cell.label, attempts: ATTEMPTS, verified, results: cellResults });
}

const summaryPath = path.join(LOG_DIR, 'summary.json');
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`\nSummary written: ${summaryPath}`);
