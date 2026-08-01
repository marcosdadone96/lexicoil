#!/usr/bin/env node
/**
 * Backfill data/dialogue-names-usage.json from historical Hören batches on disk.
 *   node scripts/backfill-dialogue-names-usage.mjs [--level A2]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  cellKey,
  extractDialogueCastSignature,
  extractDialoguePairs,
  loadPersistedDialogueCasts,
  pairKey,
  recordDialogueCastUsage,
  resetDialogueNamesCache,
} from './lib/dialogueNamesBank.mjs';

const level = (process.argv.find((a, i) => process.argv[i - 1] === '--level') || 'A2').toUpperCase();

const SCAN_DIRS = [
  path.join(ROOT, `batches/ready/pool-verified/${level}`),
  path.join(ROOT, `batches/needs-regeneration/${level}`),
  path.join(ROOT, `batches/generated/${level}`),
  path.join(ROOT, 'batches/generated/.rejected'),
  path.join(ROOT, `batches/rejected/${level}`),
];

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(abs, out);
    else if (ent.name.endsWith('.json') && !ent.name.startsWith('.')) out.push(abs);
  }
  return out;
}

resetDialogueNamesCache();

const usagePath = path.join(ROOT, 'data/dialogue-names-usage.json');
const before = fs.existsSync(usagePath) ? JSON.parse(fs.readFileSync(usagePath, 'utf8')) : { cells: {} };

let filesScanned = 0;
let batchesWithDialogue = 0;
let signaturesRecorded = 0;

for (const teil of [1, 2, 3]) {
  for (const abs of [...new Set(SCAN_DIRS.flatMap((d) => walkJson(d)))]) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    filesScanned += 1;
    const mod = String(batch.module || batch.passages?.[0]?.module || '').toLowerCase();
    const bTeil = Number(batch.teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil);
    const bLevel = String(batch.level || batch.passages?.[0]?.level || '').toUpperCase();
    if (mod !== 'horen' || bTeil !== teil || bLevel !== level) continue;

    const pairs = extractDialoguePairs(batch);
    if (!pairs.length) continue;
    batchesWithDialogue += 1;
    const sig = extractDialogueCastSignature(batch);
    if (sig) {
      recordDialogueCastUsage(level, 'horen', teil, sig);
      signaturesRecorded += 1;
    }
    for (const [a, b] of pairs) {
      recordDialogueCastUsage(level, 'horen', teil, pairKey(a, b));
      signaturesRecorded += 1;
    }
  }
}

const after = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
const report = {
  at: new Date().toISOString(),
  level,
  filesScanned,
  batchesWithDialogue,
  signaturesRecorded,
  cellsBefore: Object.keys(before.cells || {}).length,
  cellsAfter: Object.keys(after.cells || {}).length,
  cells: {},
};

for (const teil of [1, 2, 3]) {
  const ck = cellKey(level, 'horen', teil);
  const persisted = loadPersistedDialogueCasts({ level, module: 'horen', teil });
  report.cells[`t${teil}`] = {
    usageCasts: (after.cells[ck]?.casts || []).length,
    persistedCasts: persisted.casts.size,
    pairCountKeys: persisted.pairCounts.size,
    emmaJonas: persisted.pairCounts.get('Emma+Jonas') || 0,
    claraTobias: persisted.pairCounts.get('Clara+Tobias') || 0,
  };
}

const out = path.join(ROOT, 'batches/ready/gate-logs/dialogue-names-usage-backfill-evidence.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, out));
