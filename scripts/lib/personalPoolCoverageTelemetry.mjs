/**
 * Phase C — prioritize BG / fill using launch-deficit report + optional client telemetry file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

const DEFICIT_REPORT = path.join(
  ROOT,
  'batches/ready/gate-logs/personal-pool-realistic-deficit.json',
);
const TELEMETRY_FILE = path.join(
  ROOT,
  'batches/ready/gate-logs/personal-pool-coverage-priority.json',
);

function cellKey(topic, module, teil) {
  return `${topic}|${String(module).toLowerCase()}|${Number(teil)}`;
}

/** Boost from calc-personal-pool-realistic-deficit (zero + below launch min). */
export function loadDeficitCellPriorityMap() {
  const map = new Map();
  try {
    const report = JSON.parse(fs.readFileSync(DEFICIT_REPORT, 'utf8'));
    for (const c of report.zeroCells || []) {
      map.set(cellKey(c.topic, c.module, c.teil), 500 + (c.need || 1) * 50);
    }
    for (const c of report.launchGaps || []) {
      const k = cellKey(c.topic, c.module, c.teil);
      if (!map.has(k)) map.set(k, 200 + (c.need || 1) * 30);
    }
  } catch {
    /* report optional until calc script run */
  }
  return map;
}

/** Merged boosts from vocab_insufficient_coverage telemetry (client/ops). */
export function loadCoverageFailurePriorityMap() {
  const map = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf8'));
    for (const row of data.cells || []) {
      const k = cellKey(row.topic, row.module, row.teil);
      const prev = map.get(k) || 0;
      map.set(k, prev + Math.min(300, (row.count || 1) * 40));
    }
  } catch {
    /* no telemetry yet */
  }
  return map;
}

export function priorityBoostForCell(topic, module, teil) {
  const k = cellKey(topic, module, teil);
  const deficit = loadDeficitCellPriorityMap();
  const telem = loadCoverageFailurePriorityMap();
  return (deficit.get(k) || 0) + (telem.get(k) || 0);
}

/**
 * Record or merge a coverage failure (CLI / import from blob export).
 */
export function mergeCoverageFailureEvent(existing, event) {
  const base = existing && typeof existing === 'object' ? existing : { v: 1, cells: [] };
  const cells = Array.isArray(base.cells) ? [...base.cells] : [];
  const topic = event.requestedTopic || event.topic;
  const module = event.module || 'lesen';
  if (!topic) return base;
  for (const teil of event.teils || [1, 2, 3, 4, 5]) {
    const idx = cells.findIndex(
      (c) => c.topic === topic && c.module === module && Number(c.teil) === Number(teil),
    );
    if (idx >= 0) {
      cells[idx] = {
        ...cells[idx],
        count: (cells[idx].count || 0) + 1,
        lastAt: event.at || new Date().toISOString(),
      };
    } else {
      cells.push({
        topic,
        module,
        teil: Number(teil),
        count: 1,
        lastAt: event.at || new Date().toISOString(),
        reason: event.reason || 'vocab_insufficient_coverage',
      });
    }
  }
  return { v: 1, updatedAt: new Date().toISOString(), cells };
}

export function writeCoveragePriorityFile(data) {
  fs.mkdirSync(path.dirname(TELEMETRY_FILE), { recursive: true });
  fs.writeFileSync(TELEMETRY_FILE, `${JSON.stringify(data, null, 2)}\n`);
}
