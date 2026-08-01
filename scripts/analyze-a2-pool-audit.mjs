#!/usr/bin/env node
/**
 * Classify pool-verified/A2 audit-pass-2 JSON into repair buckets.
 *   node scripts/analyze-a2-pool-audit.mjs batches/ready/gate-logs/a2-pool-verified-audit-*.json
 */
import fs from 'node:fs';
import path from 'node:path';

const auditPath = process.argv[2];
if (!auditPath || !fs.existsSync(auditPath)) {
  console.error('Usage: node scripts/analyze-a2-pool-audit.mjs <audit.json>');
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(auditPath, 'utf8').replace(/^\uFEFF/, ''));
const files = new Set();
for (const g of Object.values(j.fileGroups || {})) {
  if (Array.isArray(g)) g.forEach((f) => files.add(f));
}
for (const f of j.findings || []) files.add(f.file);

const DET_CHK = new Set([
  'CHK-4',
  'CHK-8',
  'CHK-13',
  'CHK-14',
  'CHK-14c',
  'CHK-17',
  'CHK-19',
  'CHK-29',
  'CHK-31',
  'CHK-35',
  'CHK-33-det',
]);
const LLM_CHK = new Set(['CHK-6', 'CHK-7', 'CHK-10', 'CHK-15', 'CHK-16', 'CHK-18', 'CHK-18b', 'CHK-20', 'CHK-28']);
const DISCARD_CHK = new Set(['CHK-5', 'CHK-12', 'CHK-21', 'CHK-22', 'CHK-23', 'CHK-24', 'CHK-25', 'CHK-26', 'CHK-27']);

function routeFinding(f) {
  const id = f.id || '';
  if (id === 'CHK-33') return 'llm'; // MCQ length bias — surgical LLM or manual parafrase
  if (DET_CHK.has(id)) return 'det';
  if (id === 'CHK-14' || id.startsWith('CHK-14')) return 'det';
  if (LLM_CHK.has(id)) return 'llm';
  if (DISCARD_CHK.has(id)) return 'discard';
  if (f.severity === 'IMPORTANT') return 'llm';
  if (f.severity === 'MINOR') return 'minor';
  return 'review';
}

const byFile = {};
for (const name of [...files].sort()) {
  byFile[name] = {
    file: name,
    clean: j.fileGroups?.clean?.includes(name),
    cosmeticOnly: j.fileGroups?.cosmeticOnly?.includes(name),
    importantGroup: j.fileGroups?.important?.includes(name),
    findings: [],
    routes: { det: 0, llm: 0, minor: 0, discard: 0, review: 0 },
    chkImportant: new Set(),
  };
}

for (const f of j.findings || []) {
  const row = byFile[f.file];
  if (!row) continue;
  row.findings.push(f);
  const r = routeFinding(f);
  row.routes[r] = (row.routes[r] || 0) + 1;
  if (f.severity === 'IMPORTANT') row.chkImportant.add(f.id);
}

function bucket(row) {
  if (row.clean) return 'limpio';
  if (row.importantGroup && row.routes.llm === 0 && row.routes.discard === 0) {
    return 'important_solo_det'; // IMPORTANT but only fixable det? rare
  }
  if (row.importantGroup) return 'important_mixed';
  if (row.cosmeticOnly && row.routes.llm === 0) return 'cosmetico_det';
  if (row.routes.discard > 0) return 'descartar';
  if (row.routes.llm > 0) return 'necesita_ia';
  return 'cosmetico_det';
}

const rows = Object.values(byFile).map((row) => {
  const b = bucket(row);
  const estLlmUsd =
    row.routes.llm * 0.015 +
    (row.chkImportant.has('CHK-18') ? 5 * 0.008 : 0) +
    (row.chkImportant.has('CHK-28') ? 3 * 0.02 : 0);
  return { ...row, bucket: b, estLlmUsd: Math.round(estLlmUsd * 100) / 100 };
});

const counts = {};
for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;

console.log(JSON.stringify({ summary: j.summary, bucketCounts: counts, rows: rows.map(({ file, bucket, clean, cosmeticOnly, importantGroup, routes, chkImportant, estLlmUsd }) => ({
  file,
  bucket,
  clean,
  cosmeticOnly,
  importantGroup,
  routes,
  importantChks: [...chkImportant],
  estLlmUsd,
})) }, null, 2));
