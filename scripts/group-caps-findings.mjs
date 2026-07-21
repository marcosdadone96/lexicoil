#!/usr/bin/env node
/**
 * Group caps findings by (token, type, prevWord+prevPos pattern).
 * Usage: node scripts/group-caps-findings.mjs [report.json] [out.tsv]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(process.argv[2] || path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.json'));
const outPath = path.resolve(process.argv[3] || path.join(ROOT, 'batches/ready/caps-findings-v6-grouped.tsv'));

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const flat = [];
for (const [file, findings] of Object.entries(report.byFile || {})) {
  for (const f of findings) {
    flat.push({ file, ...f });
  }
}

const groups = new Map();
for (const f of flat) {
  const prevWord = f.prevWord || '?';
  const prevPos = f.prevPos || f.prevTag || '?';
  const pattern = `${prevWord}+${prevPos}`;
  const key = `${f.word}\t${f.type}\t${pattern}`;
  if (!groups.has(key)) {
    groups.set(key, {
      token: f.word,
      type: f.type,
      pattern,
      prevWord,
      prevPos,
      reason: f.reason || '',
      count: 0,
      examples: [],
    });
  }
  const g = groups.get(key);
  g.count += 1;
  if (g.examples.length < 2) {
    g.examples.push(`${f.file}: ${(f.context || '').replace(/\s+/g, ' ').slice(0, 90)}`);
  }
}

const rows = [...groups.values()].sort((a, b) => b.count - a.count);
const lines = [
  'token\ttype\tpattern\tprevWord\tprevPos\treason\tcount\texample1\texample2',
  ...rows.map((r) =>
    [
      r.token,
      r.type,
      r.pattern,
      r.prevWord,
      r.prevPos,
      r.reason,
      r.count,
      r.examples[0] || '',
      r.examples[1] || '',
    ].join('\t'),
  ),
];
fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Grouped ${flat.length} findings → ${rows.length} patterns`);
console.log(`Output: ${outPath}`);
