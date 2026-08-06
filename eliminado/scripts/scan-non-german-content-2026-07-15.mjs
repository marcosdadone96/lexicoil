#!/usr/bin/env node
/**
 * Scan pool-verified, seed, bank and time-window batches for non-German exam text.
 *
 *   node scripts/scan-non-german-content-2026-07-15.mjs
 *   node scripts/scan-non-german-content-2026-07-15.mjs --window 2026-07-15T12:00:00Z 2026-07-15T12:15:00Z
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { runGermanContentLanguageGate } from './lib/qualityGates/germanContentLanguageGate.mjs';
import { collectAllStagingJsonFiles } from './lib/batchPaths.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/scan-non-german-2026-07-15.json');

const SCAN_DIRS = [];

const EXTRA_FILES = [
  path.join(ROOT, 'library/reusable-seed/de_B1.json'),
  path.join(ROOT, 'library/de/B1/questions.json'),
];

function parseArgs() {
  const idx = process.argv.indexOf('--window');
  if (idx === -1) return { windowStart: null, windowEnd: null };
  return {
    windowStart: new Date(process.argv[idx + 1]).getTime(),
    windowEnd: new Date(process.argv[idx + 2]).getTime(),
  };
}

function batchTimestamp(batch) {
  const stamps = [
    batch._germanCapsNormalizedAt,
    batch._metadataEnrichedAt,
    batch._balanceMcqNormalizedAt,
    batch._poolVerifiedAt,
  ].filter(Boolean);
  if (!stamps.length) return null;
  return Math.max(...stamps.map((s) => new Date(s).getTime()));
}

function scanJsonFile(absPath, rel) {
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
  if (rel.endsWith('de_B1.json')) {
    const hits = [];
    for (const r of batch.records || []) {
      const v = runGermanContentLanguageGate(r, { file: `${rel}#${r.id || r.sourceFile}` });
      if (v.verdict === 'block') hits.push({ record: r.id || r.sourceFile, findings: v.findings });
    }
    return hits.length ? { file: rel, kind: 'seed', hits } : null;
  }
  if (rel.endsWith('questions.json')) {
    const hits = [];
    for (const q of batch.questions || batch) {
      const item = Array.isArray(batch) ? q : q;
      if (!item?.question) continue;
      const v = runGermanContentLanguageGate(
        { lang: 'de', questions: [item], passages: [] },
        { file: `${rel}#${item.id}` },
      );
      if (v.verdict === 'block') hits.push({ questionId: item.id, findings: v.findings });
    }
    return hits.length ? { file: rel, kind: 'bank', hits } : null;
  }
  const v = runGermanContentLanguageGate(batch, { file: rel });
  if (v.verdict !== 'block') return null;
  return {
    file: rel,
    kind: 'batch',
    ts: batchTimestamp(batch),
    findings: v.findings,
  };
}

function collectFiles() {
  const files = collectAllStagingJsonFiles();
  for (const abs of EXTRA_FILES) {
    if (!fs.existsSync(abs)) continue;
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    files.set(rel, abs);
  }
  return files;
}

const { windowStart, windowEnd } = parseArgs();
const files = collectFiles();
const allHits = [];
const windowHits = [];

for (const [rel, abs] of files) {
  const hit = scanJsonFile(abs, rel);
  if (!hit) continue;
  allHits.push(hit);
  if (windowStart && hit.ts && hit.ts >= windowStart && hit.ts <= windowEnd) {
    windowHits.push(hit);
  }
}

const report = {
  scannedAt: new Date().toISOString(),
  filesScanned: files.size,
  contaminatedBatches: allHits.filter((h) => h.kind === 'batch').length,
  contaminatedSeedRecords: allHits.filter((h) => h.kind === 'seed').length,
  contaminatedBankQuestions: allHits
    .filter((h) => h.kind === 'bank')
    .reduce((n, h) => n + (h.hits?.length || 0), 0),
  window: windowStart
    ? { start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString(), hits: windowHits }
    : null,
  hits: allHits,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Scanned ${files.size} files`);
console.log(`Contaminated batches: ${report.contaminatedBatches}`);
console.log(`Contaminated seed records: ${report.contaminatedSeedRecords}`);
console.log(`Contaminated bank questions: ${report.contaminatedBankQuestions}`);
if (windowStart) console.log(`Window hits: ${windowHits.length}`);
for (const h of allHits) {
  console.log(`  · ${h.file} (${h.kind})`);
}
console.log(`Report → ${path.relative(ROOT, OUT)}`);
