#!/usr/bin/env node
/**
 * Diagnóstico Wave 1 — Q1 mirror vs cross_id, Q4 por teil/campo.
 * Solo lectura sobre logs existentes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import { inferTeil } from './lib/qualityGates/qualityGateCommon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');
const Q1_LOG = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(LOG_DIR, 'Q1-duplicateContent-2026-07-09T08-00-42.jsonl');
const Q4_LOG = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(LOG_DIR, 'Q4-metadataSchema-2026-07-09T08-00-42.jsonl');
const OUT_SUFFIX = process.argv.includes('--post-fix') ? 'post-fix' : 'pre-fix';
const READY_DIR = path.join(ROOT, 'batches/ready/lesen');
const GENERATED_DIR = path.join(ROOT, 'batches/generated');

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function logicalIdFromPath(filePath) {
  const base = path.basename(String(filePath || '').replace(/»|«/g, ''));
  return base.replace(/\.json$/i, '');
}

function extractMatchRef(detail) {
  const m = String(detail || '').match(/«([^»]+)»/);
  return m ? m[1] : '';
}

function classifyQ1Finding(file, finding) {
  const srcId = logicalIdFromPath(file);
  const matchRef = extractMatchRef(finding.detail);
  const matchId = logicalIdFromPath(matchRef.split('::')[0]);

  if (!matchRef) return 'unknown';
  if (matchRef.startsWith('library/')) return 'bank_match';
  if (matchId === srcId) return 'mirror_pair';
  return 'cross_id_match';
}

function loadTeilForFile(relPath) {
  const base = path.basename(relPath);
  for (const dir of [READY_DIR, GENERATED_DIR]) {
    const abs = path.join(dir, base);
    if (fs.existsSync(abs)) {
      try {
        const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
        return inferTeil(batch);
      } catch { /* skip */ }
    }
  }
  return 0;
}

function diagnoseQ1(records) {
  const blocks = records.filter((r) => r.verdict === 'block');
  const byCategory = { mirror_pair: 0, cross_id_match: 0, bank_match: 0, unknown: 0 };
  const byRule = {};
  const examples = { mirror_pair: [], cross_id_match: [], bank_match: [] };

  for (const rec of blocks) {
    for (const f of rec.findings) {
      const cat = classifyQ1Finding(rec.file, f);
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byRule[f.rule] = (byRule[f.rule] || 0) + 1;
      if (examples[cat] && examples[cat].length < 5) {
        examples[cat].push({ file: rec.file, detail: f.detail, rule: f.rule });
      }
    }
  }

  return {
    blockFiles: blocks.length,
    blockFindings: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
    byRule,
    examples,
  };
}

function diagnoseQ4(records) {
  const blocks = records.filter((r) => r.verdict === 'block');
  const byTeil = {};
  const byField = {};
  const byRule = {};

  for (const rec of blocks) {
    const teil = loadTeilForFile(rec.file);
    byTeil[teil] = (byTeil[teil] || 0) + 1;

    for (const f of rec.findings) {
      if ((f.severity || 'block') !== 'block') continue;
      byRule[f.rule] = (byRule[f.rule] || 0) + 1;

      if (f.rule === 'missing_field') {
        const field = f.span || f.detail.match(/«([^»]+)»/)?.[1] || 'unknown';
        byField[field] = (byField[field] || 0) + 1;
      }
      if (f.rule === 'topic_mismatch') {
        byField.topic_mismatch = (byField.topic_mismatch || 0) + 1;
      }
    }
  }

  const topFields = Object.entries(byField)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return { blockFiles: blocks.length, byTeil, byRule, topFields };
}

const q1 = diagnoseQ1(readJsonl(Q1_LOG));
const q4 = diagnoseQ4(readJsonl(Q4_LOG));

const out = {
  generatedAt: new Date().toISOString(),
  sourceLogs: { q1: Q1_LOG, q4: Q4_LOG },
  q1,
  q4,
};

const outPath = path.join(LOG_DIR, `wave1-diagnosis-${OUT_SUFFIX}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('=== Q1 diagnóstico (blocks) ===');
console.log(`Archivos block: ${q1.blockFiles}`);
console.log(`Findings block: ${q1.blockFindings}`);
console.log('Por categoría:', q1.byCategory);
console.log('Por rule:', q1.byRule);
console.log('\nEjemplos mirror_pair:', JSON.stringify(q1.examples.mirror_pair, null, 2));
console.log('\nEjemplos cross_id_match:', JSON.stringify(q1.examples.cross_id_match, null, 2));
console.log('\nEjemplos bank_match:', JSON.stringify(q1.examples.bank_match, null, 2));

console.log('\n=== Q4 diagnóstico (blocks) ===');
console.log(`Archivos block: ${q4.blockFiles}`);
console.log('Por Teil:', q4.byTeil);
console.log('Por rule:', q4.byRule);
console.log('Top campos (block):', q4.topFields);
console.log(`\nGuardado: ${outPath}`);
