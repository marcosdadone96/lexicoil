#!/usr/bin/env node
/**
 * Estimate cost for 126-part deficit using generation-cost.jsonl (all attempts / ok files).
 */
import fs from 'fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { readGenerationCostLog } from './lib/generationCostLog.mjs';

const DEFICIT = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'batches/ready/gate-logs/personal-pool-realistic-deficit-2026-07-23.json'),
    'utf8',
  ),
);

const entries = readGenerationCostLog();
const byCell = {};
const byFile = new Map();

for (const e of entries) {
  const cell = `${String(e.module || '').toLowerCase()}-t${e.teil}`;
  if (!byCell[cell]) {
    byCell[cell] = { calls: 0, okCalls: 0, totalUsd: 0, okUsd: 0, failUsd: 0, okFiles: new Set() };
  }
  const b = byCell[cell];
  b.calls++;
  b.totalUsd += Number(e.costUsd) || 0;
  if (e.ok) {
    b.okCalls++;
    b.okUsd += Number(e.costUsd) || 0;
    if (e.file) b.okFiles.add(e.file);
  } else {
    b.failUsd += Number(e.costUsd) || 0;
  }
  if (e.file) {
    const f = byFile.get(e.file) || { file: e.file, cell, totalUsd: 0, calls: 0, published: false };
    f.calls++;
    f.totalUsd += Number(e.costUsd) || 0;
    if (e.ok) f.published = true;
    byFile.set(e.file, f);
  }
}

function costPerPublishedPart(cell) {
  const b = byCell[cell];
  if (!b || !b.okFiles.size) return null;
  // All API spend (ok+fail) attributed to published files in this cell
  const publishedFiles = [...byFile.values()].filter((f) => f.cell === cell && f.published);
  if (!publishedFiles.length) return null;
  const total = publishedFiles.reduce((s, f) => s + f.totalUsd, 0);
  return total / publishedFiles.length;
}

function costPerOkCall(cell) {
  const b = byCell[cell];
  if (!b || !b.okCalls) return null;
  return b.totalUsd / b.okCalls; // includes fail attempts in cell totals... actually totalUsd is all calls
}

function cellMetrics(cell) {
  const b = byCell[cell];
  const cpp = costPerPublishedPart(cell);
  const sr = b ? (b.calls ? b.okCalls / b.calls : 0) : 0;
  return {
    cell,
    calls: b?.calls || 0,
    okCalls: b?.okCalls || 0,
    successRate: +(sr * 100).toFixed(1),
    costPerPublishedPart: cpp != null ? +cpp.toFixed(4) : null,
    avgCallUsd: b?.calls ? +(b.totalUsd / b.calls).toFixed(4) : null,
  };
}

const LESEN_TEILS = [1, 2, 3, 4, 5];
const HOREN_TEILS = [1, 2, 3, 4];
const partsByTeil = DEFICIT.byTeil;

const defaultCpp =
  [...byFile.values()].filter((f) => f.published).reduce((s, f) => s + f.totalUsd, 0) /
  [...byFile.values()].filter((f) => f.published).length;

let total = 0;
const breakdown = { lesen: {}, horen: {}, cells: [] };

for (const mod of ['lesen', 'horen']) {
  const teils = mod === 'lesen' ? LESEN_TEILS : HOREN_TEILS;
  let modTotal = 0;
  for (const teil of teils) {
    const cell = `${mod}-t${teil}`;
    const need = partsByTeil[mod][`T${teil}`].partsNeeded;
    const m = cellMetrics(cell);
    const unit = m.costPerPublishedPart ?? defaultCpp;
    const est = need * unit;
    modTotal += est;
    breakdown[mod][`T${teil}`] = {
      partsNeeded: need,
      costPerPublishedPartUsd: +unit.toFixed(4),
      estimatedUsd: +est.toFixed(2),
      measuredFromLog: m,
    };
    breakdown.cells.push({ cell, partsNeeded: need, estimatedUsd: +est.toFixed(2), unitUsd: +unit.toFixed(4) });
  }
  breakdown[mod].subtotalUsd = +modTotal.toFixed(2);
  breakdown[mod].partsNeeded = mod === 'lesen' ? DEFICIT.deficit.lesen.partsNeeded : DEFICIT.deficit.horen.partsNeeded;
  total += modTotal;
}

breakdown.generatedAt = new Date().toISOString();
breakdown.logEntries = entries.length;
breakdown.defaultCostPerPublishedPartUsd = +defaultCpp.toFixed(4);
breakdown.totalParts = 126;
breakdown.totalEstimatedUsd = +total.toFixed(2);
breakdown.totalEstimatedUsdRange = {
  low: +(total * 0.85).toFixed(2),
  high: +(total * 1.25).toFixed(2),
  note: '±15–25% for harder cells (Hören T4, Lesen T3/T4) rejection spikes',
};

const out = path.join(ROOT, 'batches/ready/gate-logs/estimate-126-parts-cost.json');
fs.writeFileSync(out, `${JSON.stringify(breakdown, null, 2)}\n`);
console.log(JSON.stringify(breakdown, null, 2));
