#!/usr/bin/env node
/**
 * Desglose Q1 post-fix por Teil + verificación snapshot bank.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { inferTeil } from './lib/qualityGates/qualityGateCommon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const Q1_LOG = path.join(LOG_DIR, 'Q1-duplicateContent-2026-07-09T08-12-50.jsonl');
const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');
const BANK_PATH = path.join(ROOT, 'library/de/B1/questions.json');
const DEDUP_INDEX = path.join(ROOT, 'batches/ready/.dedup-index.json');

const VALIDATION_FILES = [
  'lesen-t5-gemini-067.json', 'lesen-t5-gemini-066.json', 'lesen-t5-gemini-065.json',
  'lesen-t5-gemini-064.json', 'lesen-t5-gemini-063.json', 'lesen-t4-gemini-037.json',
  'lesen-t4-gemini-036.json', 'lesen-t3-auto-qeh7ew.json', 'lesen-t3-auto-omsq86.json',
  'lesen-t3-auto-tz7n7y.json', 'lesen-t2-gemini-093.json', 'lesen-t2-gemini-092.json',
  'lesen-t2-gemini-091.json', 'lesen-t1-gemini-177.json', 'lesen-t1-gemini-176.json',
];

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function buildCorpusFileList() {
  const files = new Map();
  if (fs.existsSync(READY_DIR)) {
    for (const f of fs.readdirSync(READY_DIR).filter((x) => x.endsWith('.json'))) {
      files.set(f, path.join(READY_DIR, f));
    }
  }
  for (const f of VALIDATION_FILES) {
    const abs = path.join(GENERATED_DIR, f);
    if (fs.existsSync(abs) && !files.has(f)) {
      files.set(f, abs);
    }
  }
  return files;
}

function loadTeilMap() {
  const map = new Map();
  for (const [f, abs] of buildCorpusFileList()) {
    try {
      const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      map.set(f, inferTeil(batch));
    } catch { /* skip */ }
  }
  return map;
}

function readJsonl(p) {
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function logicalIdFromPath(filePath) {
  return path.basename(String(filePath || '')).replace(/\.json$/i, '');
}

function extractMatchRef(detail) {
  const m = String(detail || '').match(/«([^»]+)»/);
  return m ? m[1] : '';
}

function classifyFinding(file, finding) {
  const srcId = logicalIdFromPath(file);
  const matchRef = extractMatchRef(finding.detail);
  const matchId = logicalIdFromPath(matchRef.split('::')[0]);
  if (!matchRef) return 'unknown';
  if (matchRef.startsWith('library/')) return 'bank_match';
  if (matchId === srcId) return 'mirror_pair';
  return 'cross_id_match';
}

const teilMap = loadTeilMap();
const corpusByTeil = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 };
for (const [, teil] of teilMap) {
  corpusByTeil[teil] = (corpusByTeil[teil] || 0) + 1;
}

const blocksByTeil = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 };
const blocksByTeilCategory = {};
const records = readJsonl(Q1_LOG);

for (const rec of records.filter((r) => r.verdict === 'block')) {
  const base = path.basename(rec.file);
  const teil = teilMap.get(base) || 0;
  blocksByTeil[teil] = (blocksByTeil[teil] || 0) + 1;
  if (!blocksByTeilCategory[teil]) {
    blocksByTeilCategory[teil] = { mirror_pair: 0, cross_id_match: 0, bank_match: 0 };
  }
  for (const f of rec.findings) {
    const cat = classifyFinding(rec.file, f);
    blocksByTeilCategory[teil][cat] = (blocksByTeilCategory[teil][cat] || 0) + 1;
  }
}

const bankStat = fs.statSync(BANK_PATH);
const bankMeta = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8')).meta || {};
const indexMeta = fs.existsSync(DEDUP_INDEX)
  ? JSON.parse(fs.readFileSync(DEDUP_INDEX, 'utf8'))
  : null;
const bankEntriesInIndex = (indexMeta?.entries || []).filter((e) =>
  String(e.source || '').startsWith('library/'),
).length;

const report = {
  generatedAt: new Date().toISOString(),
  q1Log: Q1_LOG,
  totalCorpusFiles: teilMap.size,
  totalBlocks: records.filter((r) => r.verdict === 'block').length,
  byTeil: [1, 2, 3, 4, 5].map((t) => ({
    teil: t,
    corpusFiles: corpusByTeil[t] || 0,
    blocks: blocksByTeil[t] || 0,
    blockPctOfTeil: corpusByTeil[t]
      ? Number(((blocksByTeil[t] / corpusByTeil[t]) * 100).toFixed(1))
      : 0,
    findingsByCategory: blocksByTeilCategory[t] || {},
  })),
  bankSnapshot: {
    path: 'library/de/B1/questions.json',
    mtime: bankStat.mtime.toISOString(),
    sizeBytes: bankStat.size,
    sha256: sha256File(BANK_PATH),
    metaVersion: bankMeta.version,
    metaGeneratedAt: bankMeta.generatedAt,
    passagesInFile: (JSON.parse(fs.readFileSync(BANK_PATH, 'utf8')).passages || []).length,
    bankEntriesInDedupIndex: bankEntriesInIndex,
    dedupIndexUpdatedAt: indexMeta?.updatedAt || null,
  },
};

const outPath = path.join(LOG_DIR, 'q1-teil-breakdown-post-fix.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('=== Q1 blocks por Teil (post-fix) ===');
console.log('Teil | corpus | blocks | % blocks del Teil | cross_id | bank | mirror');
for (const row of report.byTeil) {
  const c = row.findingsByCategory;
  console.log(
    `${row.teil} | ${row.corpusFiles} | ${row.blocks} | ${row.blockPctOfTeil}% | ` +
    `${c.cross_id_match || 0} | ${c.bank_match || 0} | ${c.mirror_pair || 0}`,
  );
}
console.log(`\nTotal blocks: ${report.totalBlocks} / ${report.totalCorpusFiles} archivos`);
console.log('\n=== Bank snapshot ===');
console.log(JSON.stringify(report.bankSnapshot, null, 2));
console.log(`\nGuardado: ${outPath}`);
