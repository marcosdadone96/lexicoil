#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-B.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-B-G1.json'), 'utf8'));

const sig = (f) => `${f.file}|${f.field}|${f.word}|${f.type}|${f.reason}|${f.prevWord}|${f.prevTag}`;

function flat(r) {
  const out = [];
  for (const [file, arr] of Object.entries(r.byFile || {})) {
    for (const f of arr) out.push({ file, ...f });
  }
  return out;
}

const b = flat(before);
const a = flat(after);
const as = new Set(a.map(sig));
const bs = new Set(b.map(sig));
const eliminated = b.filter((f) => !as.has(sig(f)));
const added = a.filter((f) => !bs.has(sig(f)));

const byReason = {};
for (const f of eliminated) byReason[f.reason] = (byReason[f.reason] || 0) + 1;

const report = {
  label: 'v6.1-B → v6.1-B-G1',
  before_total: before.totalFindings,
  after_total: after.totalFindings,
  delta: after.totalFindings - before.totalFindings,
  eliminated_count: eliminated.length,
  added_count: added.length,
  eliminated_by_reason: byReason,
  eliminated,
  added,
};

const outJson = path.join(ROOT, 'batches/ready/g1-impl-diff-v6.1-B-to-G1.json');
const outMd = path.join(ROOT, 'batches/ready/g1-impl-diff-v6.1-B-to-G1.md');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const lines = [
  '# Diff v6.1-B → G1 (implementado)',
  '',
  `| Métrica | v6.1-B | G1 | Δ |`,
  `|---|---:|---:|---:|`,
  `| Findings | ${before.totalFindings} | ${after.totalFindings} | ${report.delta} |`,
  `| Archivos afectados | ${before.filesWithFindings} | ${after.filesWithFindings} | ${after.filesWithFindings - before.filesWithFindings} |`,
  `| Observations | ${before.totalObservations} | ${after.totalObservations} | ${after.totalObservations - before.totalObservations} |`,
  '',
  `## Eliminados (${eliminated.length})`,
  '',
];

for (const [reason, n] of Object.entries(byReason).sort((x, y) => y[1] - x[1])) {
  lines.push(`- **${reason}:** ${n}`);
}
lines.push('');
for (const f of eliminated) {
  lines.push(`- \`${f.word}\` (${f.reason}) — \`${f.file}\` / \`${f.field}\` — ${f.context?.slice(0, 60)}…`);
}

if (added.length) {
  lines.push('', `## Añadidos (${added.length})`, '');
  for (const f of added) {
    lines.push(`- \`${f.word}\` (${f.reason}) — \`${f.file}\` / \`${f.field}\``);
  }
}

fs.writeFileSync(outMd, `${lines.join('\n')}\n`, 'utf8');
console.log(`Before: ${before.totalFindings} → After: ${after.totalFindings} (Δ ${report.delta})`);
console.log(`Eliminated: ${eliminated.length}, Added: ${added.length}`);
console.log('By reason:', byReason);
console.log(`Written: ${outJson}`);
console.log(`Written: ${outMd}`);
