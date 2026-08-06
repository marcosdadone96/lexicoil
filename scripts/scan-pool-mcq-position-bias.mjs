#!/usr/bin/env node
/**
 * Per-file MCQ answer-position bias scan (pool-verified, all levels).
 * Flags parts where any letter exceeds 55% (CHK-13) or _balanceMcqVersion missing.
 *
 *   node scripts/scan-pool-mcq-position-bias.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { KNOWN_LEVELS, listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { measureMcqPositionDistribution } from './lib/manualPublishNormalize.mjs';

const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/pool-mcq-position-bias-scan.json',
);

/** @param {string} filename */
function classifyPart(filename) {
  const base = filename.toLowerCase();
  if (base.startsWith('lesen-t2-')) return 'lesen-t2';
  if (base.startsWith('lesen-t5-')) return 'lesen-t5';
  if (base.startsWith('horen-t2-')) return 'horen-t2';
  return null;
}

const rows = [];
const missingStamp = [];
const seenAbs = new Set();

for (const level of KNOWN_LEVELS) {
  for (const abs of listPoolVerifiedJson(level)) {
    if (seenAbs.has(abs)) continue;
    seenAbs.add(abs);
    const file = path.basename(abs);
    const part = classifyPart(file);
    if (!part) continue;
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const dist = measureMcqPositionDistribution(batch);
    if (dist.n < 3) continue;
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const seq = dist.seq;
    if (!batch._balanceMcqVersion) {
      missingStamp.push({ file: rel, part, ...dist });
    }
    if (dist.maxPct > 0.55) {
      rows.push({
        file: rel,
        level,
        part,
        seq: dist.seq,
        counts: dist.counts,
        maxPct: Math.round(dist.maxPct * 1000) / 10,
        maxLetter: dist.maxLetter,
        balanceStamp: batch._balanceMcqVersion || null,
      });
    }
  }
}

rows.sort((a, b) => b.maxPct - a.maxPct);
missingStamp.sort((a, b) => a.file.localeCompare(b.file));

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'pool-verified (all levels), lesen-t2/t5 + horen-t2 MCQ',
  thresholdPct: 55,
  extremeBiasCount: rows.length,
  missingBalanceStampCount: missingStamp.length,
  extremeBias: rows,
  missingBalanceStamp: missingStamp,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Extreme position bias (>${report.thresholdPct}%): ${rows.length}`);
for (const r of rows.slice(0, 20)) {
  console.log(
    `  ${r.maxPct}% ${r.maxLetter} · ${r.file} seq=[${r.seq.join(',')}] stamp=${r.balanceStamp || 'ABSENT'}`,
  );
}
if (rows.length > 20) console.log(`  … +${rows.length - 20} more`);

console.log(`\nMissing _balanceMcqVersion: ${missingStamp.length}`);
for (const r of missingStamp.slice(0, 10)) {
  console.log(`  ${r.file} seq=[${r.seq.join(',')}] max=${Math.round(r.maxPct * 100)}%`);
}

console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
