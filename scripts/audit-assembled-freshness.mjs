#!/usr/bin/env node
/**
 *   node scripts/audit-assembled-freshness.mjs --level A2 --slots 1,2,3,4 [--fail-on-stale]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAssembledSlotsFreshness } from './lib/assembledExamFreshness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { level: 'B1', slots: null, failOnStale: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--level') out.level = String(argv[++i] || 'B1').toUpperCase();
    else if (argv[i] === '--slots') {
      out.slots = String(argv[++i] || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
    } else if (argv[i] === '--fail-on-stale') out.failOnStale = true;
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

function defaultSlots(level) {
  const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
  const re = new RegExp(`^assembled-exam-${level.toLowerCase()}-verified-e(\\d+)\\.json$`, 'i');
  return fs
    .readdirSync(asmDir)
    .map((f) => {
      const m = f.match(re);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

const args = parseArgs(process.argv.slice(2));
const slots = args.slots?.length ? args.slots : defaultSlots(args.level);
const report = auditAssembledSlotsFreshness({ slots, level: args.level });
const out = path.join(ROOT, 'batches/ready/gate-logs/assembled-freshness-audit.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `Assembled freshness (${args.level}) — ${report.allFresh ? 'ALL FRESH' : 'STALE DETECTED'} (${slots.length} slots)`,
  );
  for (const r of report.rows) {
    console.log(
      `  e${r.slot} ${r.file}: ${r.fresh ? 'FRESH' : `STALE (${r.staleCells.join(', ')})`}`,
    );
  }
  console.log('Wrote', path.relative(ROOT, out));
}
if (args.failOnStale && !report.allFresh) process.exit(1);
