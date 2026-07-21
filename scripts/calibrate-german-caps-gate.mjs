#!/usr/bin/env node
/**
 * Calibrate POS capitalization gate on batches/ready/lesen/ (single Python bulk pass).
 * Run: node scripts/calibrate-german-caps-gate.mjs [--json-out report.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectBatchItemsFromDir,
  formatGermanCapsFinding,
  runPosCapsBulk,
} from './lib/germanCapsGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY_DIR = path.join(ROOT, 'batches', 'ready', 'lesen');

const jsonOut = process.argv.includes('--json-out')
  ? process.argv[process.argv.indexOf('--json-out') + 1]
  : path.join(ROOT, 'batches', 'ready', 'german-caps-gate-report-v6.json');

const items = collectBatchItemsFromDir(READY_DIR);
const files = [...new Set(items.map((it) => it.file))];

console.log(`Scanning ${files.length} files (${items.length} text fields)…`);

const bulk = runPosCapsBulk(items, { timeoutMs: 180_000 });
if (bulk.skipped) {
  console.error(bulk.warning || 'POS gate unavailable');
  process.exit(2);
}

const observationCount = (bulk.observations || []).length;

const byFile = {};
let totalFindings = 0;

for (const f of bulk.findings || []) {
  const meta = items.find((m) => m.id === f.id);
  const file = meta?.file || 'unknown';
  if (!byFile[file]) byFile[file] = [];
  const enriched = {
    type: f.type,
    word: f.word,
    pos: f.pos,
    tag: f.tag,
    reason: f.reason,
    confidence: f.confidence,
    prevWord: f.prevWord || '',
    prevPos: f.prevPos || '',
    prevTag: f.prevTag || '',
    field: meta?.field || f.field || 'text',
    context: f.context,
    message: formatGermanCapsFinding({ ...f, field: meta?.field || f.field || 'text' }),
  };
  byFile[file].push(enriched);
  totalFindings += 1;
}

const report = {
  scannedAt: new Date().toISOString(),
  version: 'v6',
  dir: READY_DIR,
  totalFiles: files.length,
  filesWithFindings: Object.keys(byFile).length,
  totalFindings,
  totalObservations: observationCount,
  skipped: false,
  byFile,
};

console.log(`Files with findings: ${report.filesWithFindings}`);
console.log(`Total findings: ${report.totalFindings}`);
console.log(`Relaxed observations (noun_lowercase): ${observationCount}\n`);

for (const [file, findings] of Object.entries(byFile)) {
  console.log(`=== ${file} (${findings.length}) ===`);
  for (const f of findings) {
    console.log(`  - ${f.message}`);
  }
  console.log('');
}

fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
fs.writeFileSync(path.resolve(jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`JSON report: ${jsonOut}`);
