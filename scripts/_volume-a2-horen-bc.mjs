#!/usr/bin/env node
/**
 * Volume fire test — Hören A2 T2 + T3 (causas B/C post-fix).
 *   VOLUME_ATTEMPTS=6 node scripts/_volume-a2-horen-bc.mjs
 *   VOLUME_CELLS=horen-t2 VOLUME_ATTEMPTS=6 node scripts/_volume-a2-horen-bc.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  countSharedFiveGrams,
  horenT2ActivityKeySignature,
} from './lib/horenT2ActivityScheduleBank.mjs';
import {
  extractDialogueCastSignature,
  extractDialoguePairs,
} from './lib/dialogueNamesBank.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATTEMPTS = Number(process.env.VOLUME_ATTEMPTS || 6);
const LOG_DIR = path.join(
  ROOT,
  'docs',
  process.env.VOLUME_LOG_DIR || 'volume-a2-logs-bc',
);

const ALL_CELLS = [
  {
    id: 'horen-t2',
    label: 'Hören A2 T2',
    cmd: [
      'node', 'scripts/generate-part-gemini.mjs',
      '--module', 'horen', '--teil', '2', '--level', 'A2',
      '--from-bank', '--topic', 'Freizeit', '--count', '1',
      '--max-api-calls', '45', '--fix-retries', '3', '--keep-failed',
    ],
  },
  {
    id: 'horen-t3',
    label: 'Hören A2 T3',
    cmd: [
      'node', 'scripts/generate-part-gemini.mjs',
      '--module', 'horen', '--teil', '3', '--level', 'A2',
      '--from-bank', '--topic', 'Freizeit', '--count', '1',
      '--max-api-calls', '45', '--fix-retries', '3', '--keep-failed',
    ],
  },
];

function parseOutcome(log, exitCode) {
  const poolReady = log.match(/\[poolReady\] READY → pool-verified\/A2\/(\S+\.json)/);
  if (poolReady) return { status: 'pool-verified', file: poolReady[1], exitCode };
  const poolReject = log.match(/\[poolReady\] REJECT → needs-regeneration\/A2\/(\S+\.json)/);
  if (poolReject) return { status: 'pool-reject', file: poolReject[1], exitCode };
  if (/discarded|DESCARTADO/i.test(log) && exitCode !== 0) return { status: 'discarded', exitCode };
  return { status: exitCode === 0 ? 'unknown-ok' : 'failed', exitCode };
}

function loadBatchFromLog(log, fallbackFile) {
  const m = log.match(/pool-verified\/A2\/(\S+\.json)/);
  const file = m?.[1] || fallbackFile;
  if (!file) return null;
  const abs = path.join(ROOT, 'batches/ready/pool-verified/A2', file);
  if (!fs.existsSync(abs)) {
    const gen = path.join(ROOT, 'batches/generated/A2', file);
    if (fs.existsSync(gen)) return JSON.parse(fs.readFileSync(gen, 'utf8'));
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function analyzeT2(batches) {
  const pairs = [];
  for (let i = 0; i < batches.length; i += 1) {
    for (let j = i + 1; j < batches.length; j += 1) {
      const a = batches[i];
      const b = batches[j];
      if (!a?.batch || !b?.batch) continue;
      const textA = a.batch.passages?.[0]?.text || '';
      const textB = b.batch.passages?.[0]?.text || '';
      pairs.push({
        a: a.file,
        b: b.file,
        sharedFiveGrams: countSharedFiveGrams(textA, textB),
        keySigA: horenT2ActivityKeySignature(a.batch),
        keySigB: horenT2ActivityKeySignature(b.batch),
        sameKeys: horenT2ActivityKeySignature(a.batch) === horenT2ActivityKeySignature(b.batch),
      });
    }
  }
  const keySigs = batches.map((b) => horenT2ActivityKeySignature(b?.batch)).filter(Boolean);
  const uniqueKeys = new Set(keySigs);
  const castSigs = batches.map((b) => {
    const pairs = extractDialoguePairs(b?.batch || {});
    return pairs[0] ? pairs[0].join('+') : '?';
  });
  return { pairs, uniqueKeySchedules: uniqueKeys.size, namePairs: castSigs, uniqueNames: new Set(castSigs).size };
}

function analyzeT3(batches) {
  const casts = batches.map((b) => ({
    file: b.file,
    cast: extractDialogueCastSignature(b?.batch || {}),
    pairs: extractDialoguePairs(b?.batch || {}).map(([a, c]) => `${a}+${c}`),
  }));
  const uniqueCasts = new Set(casts.map((c) => c.cast).filter(Boolean));
  return { casts, uniqueCasts: uniqueCasts.size };
}

const cellFilter = process.env.VOLUME_CELLS?.split(',').map((s) => s.trim()).filter(Boolean);
const CELLS = cellFilter?.length
  ? ALL_CELLS.filter((c) => cellFilter.includes(c.id))
  : ALL_CELLS;

fs.mkdirSync(LOG_DIR, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  attempts: ATTEMPTS,
  cellsFilter: cellFilter || 'all',
  cells: {},
};

for (const cell of CELLS) {
  const cellResults = [];
  const successBatches = [];
  console.log(`\n######## ${cell.label} × ${ATTEMPTS} ########`);
  for (let i = 1; i <= ATTEMPTS; i += 1) {
    const logName = `${cell.id}-bc-attempt-${String(i).padStart(2, '0')}.log`;
    const logPath = path.join(LOG_DIR, logName);
    console.log(`--- intento ${i}/${ATTEMPTS} ---`);
    const res = spawnSync(cell.cmd[0], cell.cmd.slice(1), { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const log = `${res.stdout || ''}${res.stderr || ''}`;
    fs.writeFileSync(logPath, log, 'utf8');
    const outcome = parseOutcome(log, res.status ?? 1);
    cellResults.push({ attempt: i, ...outcome, log: logName });
    console.log(`  → ${outcome.status}${outcome.file ? ` (${outcome.file})` : ''}`);
    if (outcome.status === 'pool-verified' && outcome.file) {
      const batch = loadBatchFromLog(log, outcome.file);
      successBatches.push({ file: outcome.file, batch });
    }
  }
  const ok = cellResults.filter((r) => r.status === 'pool-verified').length;
  const rejects = cellResults.filter((r) => r.status === 'pool-reject');
  const missingGrammar = rejects.filter((r) => {
    const log = fs.readFileSync(path.join(LOG_DIR, r.log), 'utf8');
    return /missing_grammarTags/.test(log);
  });
  const analysis = cell.id === 'horen-t2' ? analyzeT2(successBatches) : analyzeT3(successBatches);
  report.cells[cell.id] = {
    results: cellResults,
    successRate: `${ok}/${ATTEMPTS}`,
    poolRejectMissingGrammar: missingGrammar.length,
    analysis,
  };
}

report.finishedAt = new Date().toISOString();
const reportPath = path.join(LOG_DIR, 'volume-bc-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nReport: ${reportPath}`);
console.log(JSON.stringify(report, null, 2));
