#!/usr/bin/env node
/**
 * Final-verify Lesen T2 099–102 then promote to pool-verified with safe renumber.
 *   node scripts/promote-lesen-t2-099-102-2026-07-12.mjs
 *   node scripts/promote-lesen-t2-099-102-2026-07-12.mjs --verify-only
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  POOL_VERIFIED_DIR,
  nextNumberedBatchBasename,
  maxExistingBatchNumber,
  GENERATED_DIR,
} from './lib/batchPaths.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';
import { chk14 } from './audit-pass-2.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { buildLesenSeedRecordFromBatch } from './lib/publishToPool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches', 'ready');
const verifyOnly = process.argv.includes('--verify-only');

const SRC = [99, 100, 101, 102].map((n) => `lesen-t2-gemini-${String(n).padStart(3, '0')}.json`);

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
      const o = f.match(/^(schreiben|sprechen)-/i);
      if (o) counts[o[1]] = (counts[o[1]] || 0) + 1;
      else if (/^lesen-t3-auto-/i.test(f)) counts['lesen-t3'] = (counts['lesen-t3'] || 0) + 1;
      else counts._other = (counts._other || 0) + 1;
      continue;
    }
    const k = `${m[1]}-t${m[2]}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function topicOf(batch) {
  return batch.topicTag || batch._requestedTopic || batch.passages?.[0]?.topicTag || null;
}

const verifyReport = { generatedAt: new Date().toISOString(), files: [], failCount: 0 };

for (const name of SRC) {
  const abs = path.join(GENERATED_DIR, name);
  const entry = { file: name, fails: [], meta: {} };
  if (!fs.existsSync(abs)) {
    entry.fails.push({ kind: 'missing' });
    verifyReport.files.push(entry);
    verifyReport.failCount += 1;
    continue;
  }
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  entry.meta = {
    topic: topicOf(batch),
    caps: batch._germanCapsNormalizeVersion || null,
    wantCaps: GERMAN_CAPS_NORMALIZE_VERSION,
  };
  if (batch._germanCapsNormalizeVersion !== GERMAN_CAPS_NORMALIZE_VERSION) {
    entry.fails.push({
      kind: 'capsStamp',
      got: batch._germanCapsNormalizeVersion,
      want: GERMAN_CAPS_NORMALIZE_VERSION,
    });
  }
  const chk = chk14(batch, name) || [];
  for (const f of chk) {
    if (f.severity === 'IMPORTANT') {
      entry.fails.push({ kind: 'CHK-14', message: f.message, word: f.word || f.snippet });
    }
  }
  batch = normalizeBatch(batch, { module: 'lesen', teil: 2, lang: 'de', level: 'B1' });
  const record = buildLesenSeedRecordFromBatch(batch, {
    lang: 'de',
    level: 'B1',
    teil: 2,
    idPrefix: 'pv',
  });
  record.id = name.replace(/\.json$/i, '');
  const gate = await isPartPoolReady(record, { semantic: false, skipSem2: true });
  entry.gate = { ok: gate.ok, issue: gate.issue || gate.blocking?.[0]?.message || null };
  if (!gate.ok) entry.fails.push({ kind: 'poolGate', issue: entry.gate.issue });

  if (entry.fails.length) verifyReport.failCount += 1;
  verifyReport.files.push(entry);
}

const logDir = path.join(READY, 'gate-logs');
fs.mkdirSync(logDir, { recursive: true });
const verifyPath = path.join(logDir, 'lesen-t2-099-102-final-verify-2026-07-12.json');
fs.writeFileSync(verifyPath, `${JSON.stringify(verifyReport, null, 2)}\n`);
console.log(
  `Verify: OK ${verifyReport.files.filter((f) => !f.fails.length).length}/4 · fails ${verifyReport.failCount}`,
);
console.log(`Wrote ${path.relative(ROOT, verifyPath)}`);

if (verifyReport.failCount) {
  console.error('REFUSING promote — verification failed');
  console.log(JSON.stringify(verifyReport, null, 2));
  process.exit(1);
}

if (verifyOnly) {
  console.log('--verify-only: skipping promote');
  process.exit(0);
}

const beforeFiles = listPoolJson();
const beforeCount = beforeFiles.length;
const beforeSet = new Set(beforeFiles);
const maxBefore = { 'lesen-t2-gemini': maxExistingBatchNumber('lesen-t2-gemini') };
const promoted = [];
const now = new Date().toISOString();

for (const oldName of SRC) {
  const srcAbs = path.join(GENERATED_DIR, oldName);
  const newName = nextNumberedBatchBasename('lesen-t2-gemini');
  const destAbs = path.join(POOL_VERIFIED_DIR, newName);
  if (fs.existsSync(destAbs) || beforeSet.has(newName)) {
    throw new Error(`refusing overwrite: ${newName}`);
  }
  const batch = JSON.parse(fs.readFileSync(srcAbs, 'utf8'));
  batch._poolPromotedAt = now;
  batch._poolPromoteFrom = `batches/generated/${oldName}`;
  batch._poolPromoteOldBasename = oldName;
  batch._poolPromoteNewBasename = newName;
  batch._poolPromoteNote =
    'Lesen T2 099–102 → pool-verified 2026-07-12 with safe renumber (same pattern as canary9).';

  const fd = fs.openSync(destAbs, 'wx');
  try {
    fs.writeFileSync(fd, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }

  promoted.push({
    old: oldName,
    new: newName,
    topic: topicOf(batch),
    destSha256: sha256File(destAbs),
    bytes: fs.statSync(destAbs).size,
  });
}

const afterFiles = listPoolJson();
const afterCount = afterFiles.length;
const stock = countByTeil(afterFiles);
const report = {
  promotedAt: now,
  poolCountBefore: beforeCount,
  poolCountAfter: afterCount,
  delta: afterCount - beforeCount,
  expectedDelta: 4,
  maxBefore,
  promoted,
  stockByTeil: stock,
  focusStock: {
    'lesen-t2': stock['lesen-t2'] || 0,
    'horen-t1': stock['horen-t1'] || 0,
    'lesen-t4': stock['lesen-t4'] || 0,
    'lesen-t5': stock['lesen-t5'] || 0,
    'horen-t3': stock['horen-t3'] || 0,
  },
};

const logPath = path.join(logDir, 'lesen-t2-099-102-promote-2026-07-12.json');
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
      note: 'Updated after Lesen T2 099–102 promote (safe renumber). File counts in pool-verified.',
      lastPromote: 'lesen-t2-099-102',
    },
    null,
    2,
  )}\n`,
);

if (report.delta !== 4) {
  console.error('FAIL: delta !== 4', report.delta);
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${path.relative(ROOT, logPath)}`);
console.log(`Wrote ${path.relative(ROOT, stockPath)}`);
