#!/usr/bin/env node
/**
 * Promote canary 9 → pool-verified with safe renumbering (Hallazgo D).
 * Does NOT touch the 6 Hören T1 already in pool-verified.
 *
 * Run: node scripts/promote-canary9-renumber-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  POOL_VERIFIED_DIR,
  nextNumberedBatchBasename,
  maxExistingBatchNumber,
} from './lib/batchPaths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches', 'ready');

const CANARY = [
  {
    src: 'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-001.json',
    prefix: 'lesen-t4-gemini',
  },
  {
    src: 'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-002.json',
    prefix: 'lesen-t4-gemini',
  },
  {
    src: 'lesen-t4-staging-2026-07-11-canary/lesen-t4-gemini-003.json',
    prefix: 'lesen-t4-gemini',
  },
  {
    src: 'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-001.json',
    prefix: 'lesen-t5-gemini',
  },
  {
    src: 'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-002.json',
    prefix: 'lesen-t5-gemini',
  },
  {
    src: 'lesen-t5-staging-2026-07-11-canary/lesen-t5-gemini-003.json',
    prefix: 'lesen-t5-gemini',
  },
  {
    src: 'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-001.json',
    prefix: 'horen-t3-gemini',
  },
  {
    src: 'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-002.json',
    prefix: 'horen-t3-gemini',
  },
  {
    src: 'horen-t3-staging-2026-07-11-canary/horen-t3-gemini-004.json',
    prefix: 'horen-t3-gemini',
  },
];

const COLLISION_NAMES = [
  'lesen-t4-gemini-002.json',
  'horen-t3-gemini-001.json',
  'horen-t3-gemini-002.json',
  'horen-t3-gemini-004.json',
];

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function listPoolJson() {
  return fs.readdirSync(POOL_VERIFIED_DIR).filter((f) => f.endsWith('.json')).sort();
}

function countByTeil(files) {
  const counts = {};
  for (const f of files) {
    const m = f.match(/^(lesen|horen)-t(\d+)-gemini-\d+\.json$/i);
    if (!m) {
      counts._other = (counts._other || 0) + 1;
      continue;
    }
    const k = `${m[1]}-t${m[2]}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function topicOf(batch) {
  return (
    batch.topicTag ||
    batch._requestedTopic ||
    batch.passages?.[0]?.topicTag ||
    batch.passages?.[0]?.title ||
    null
  );
}

const beforeFiles = listPoolJson();
const beforeCount = beforeFiles.length;
const beforeSet = new Set(beforeFiles);
const collisionBefore = {};
for (const name of COLLISION_NAMES) {
  const p = path.join(POOL_VERIFIED_DIR, name);
  if (fs.existsSync(p)) collisionBefore[name] = sha256File(p);
}

const maxBefore = {
  'lesen-t4-gemini': maxExistingBatchNumber('lesen-t4-gemini'),
  'lesen-t5-gemini': maxExistingBatchNumber('lesen-t5-gemini'),
  'horen-t3-gemini': maxExistingBatchNumber('horen-t3-gemini'),
};

const promoted = [];
const now = new Date().toISOString();

for (const item of CANARY) {
  const srcAbs = path.join(READY, item.src);
  if (!fs.existsSync(srcAbs)) {
    throw new Error(`missing source: ${item.src}`);
  }
  const oldName = path.basename(item.src);
  const newName = nextNumberedBatchBasename(item.prefix);
  const destAbs = path.join(POOL_VERIFIED_DIR, newName);

  if (fs.existsSync(destAbs)) {
    throw new Error(`refusing overwrite — destination exists: ${newName}`);
  }
  if (beforeSet.has(newName)) {
    throw new Error(`refusing overwrite — was in pre-promote set: ${newName}`);
  }

  const batch = JSON.parse(fs.readFileSync(srcAbs, 'utf8'));
  batch._poolPromotedAt = now;
  batch._poolPromoteFrom = item.src.replace(/\\/g, '/');
  batch._poolPromoteOldBasename = oldName;
  batch._poolPromoteNewBasename = newName;
  batch._poolPromoteNote =
    'Canary→pool-verified 2026-07-12 with safe renumber (Hallazgo D collision avoidance).';

  // Exclusive create: fail if race/collision
  const fd = fs.openSync(destAbs, 'wx');
  try {
    fs.writeFileSync(fd, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }

  promoted.push({
    old: oldName,
    new: newName,
    from: item.src.replace(/\\/g, '/'),
    topic: topicOf(batch),
    prefix: item.prefix,
    destSha256: sha256File(destAbs),
    bytes: fs.statSync(destAbs).size,
  });
}

const afterFiles = listPoolJson();
const afterCount = afterFiles.length;
const afterSet = new Set(afterFiles);
const newOnly = afterFiles.filter((f) => !beforeSet.has(f));
const missingOld = beforeFiles.filter((f) => !afterSet.has(f));

const collisionAfter = {};
let collisionOk = true;
for (const name of COLLISION_NAMES) {
  const p = path.join(POOL_VERIFIED_DIR, name);
  if (!collisionBefore[name]) continue;
  const hash = sha256File(p);
  collisionAfter[name] = hash;
  if (hash !== collisionBefore[name]) collisionOk = false;
}

const t1Required = [
  'horen-t1-gemini-001.json',
  'horen-t1-gemini-002.json',
  'horen-t1-gemini-003.json',
  'horen-t1-gemini-004.json',
  'horen-t1-gemini-005.json',
  'horen-t1-gemini-016.json',
];
const t1Present = t1Required.map((n) => ({
  file: n,
  present: afterSet.has(n),
}));

const stock = countByTeil(afterFiles);
const report = {
  promotedAt: now,
  poolCountBefore: beforeCount,
  poolCountAfter: afterCount,
  delta: afterCount - beforeCount,
  expectedDelta: 9,
  maxBefore,
  promoted,
  newFilesOnly: newOnly,
  deletedOrMissingFromBefore: missingOld,
  collisionHashesUnchanged: collisionOk,
  collisionBefore,
  collisionAfter,
  t1AlreadyInPool: t1Present,
  stockByTeil: stock,
  focusStock: {
    'horen-t1': stock['horen-t1'] || 0,
    'lesen-t4': stock['lesen-t4'] || 0,
    'lesen-t5': stock['lesen-t5'] || 0,
    'horen-t3': stock['horen-t3'] || 0,
  },
};

const logDir = path.join(READY, 'gate-logs');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'canary9-promote-renumber-2026-07-12.json');
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);

const stockPath = path.join(logDir, 'pool-verified-stock-2026-07-12.json');
fs.writeFileSync(
  stockPath,
  `${JSON.stringify(
    {
      generatedAt: now,
      totalJson: afterCount,
      byTeil: stock,
      focus: report.focusStock,
      note: 'File counts in batches/ready/pool-verified (gemini batch JSON), not reusable-seed records.',
    },
    null,
    2,
  )}\n`,
);

if (report.delta !== 9) {
  console.error('FAIL: delta !== 9', report.delta);
  process.exit(1);
}
if (!collisionOk) {
  console.error('FAIL: collision file hashes changed (overwrite?)');
  process.exit(1);
}
if (missingOld.length) {
  console.error('FAIL: files disappeared from pool', missingOld);
  process.exit(1);
}
if (promoted.length !== 9) {
  console.error('FAIL: promoted !== 9');
  process.exit(1);
}
if (t1Present.some((x) => !x.present)) {
  console.error('FAIL: missing T1 in pool');
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, logPath)}`);
console.log(`Wrote ${path.relative(ROOT, stockPath)}`);
