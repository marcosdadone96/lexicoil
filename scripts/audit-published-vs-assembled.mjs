#!/usr/bin/env node
/**
 * audit-published-vs-assembled.mjs — Alert when live published B1 slots differ from assembled pool.
 *
 *   node scripts/audit-published-vs-assembled.mjs
 *   node scripts/audit-published-vs-assembled.mjs --lang de --level B1 --json
 *   node scripts/audit-published-vs-assembled.mjs --fail-on-desync
 *   node scripts/audit-published-vs-assembled.mjs --level A2 --check-freshness --fail-on-stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAssembledFreshness } from './lib/assembledExamFreshness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', json: false, failOnDesync: false, failOnStale: false, checkFreshness: false, slots: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i] || 'de').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || 'B1').toUpperCase();
    else if (a === '--json') out.json = true;
    else if (a === '--fail-on-desync') out.failOnDesync = true;
    else if (a === '--fail-on-stale') out.failOnStale = true;
    else if (a === '--check-freshness') out.checkFreshness = true;
    else if (a === '--slots') {
      out.slots = String(argv[++i] || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
    }
  }
  return out;
}

function countQuarantineFlags(pub) {
  let q = 0;
  for (const p of pub.parts || []) {
    for (const qq of p.snapshot?.questions || []) {
      if (qq._lengthBiasQuarantine) q++;
    }
  }
  return q;
}

function auditSlot(lang, level, slot) {
  const pubPath = path.join(ROOT, 'library/published-exams', lang, level, `official-${lang}-${level}-e${slot}.json`);
  const asmPath = path.join(ROOT, 'batches/ready/assembled-from-verified', `assembled-exam-${level.toLowerCase()}-verified-e${slot}.json`);
  if (!fs.existsSync(pubPath)) {
    return { slot, status: 'missing_published', sync: false, quarantine: 0, diffs: [] };
  }
  if (!fs.existsSync(asmPath)) {
    return { slot, status: 'missing_assembled', sync: false, quarantine: countQuarantineFlags(JSON.parse(fs.readFileSync(pubPath, 'utf8'))), diffs: [] };
  }
  const pub = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
  const asm = JSON.parse(fs.readFileSync(asmPath, 'utf8'));
  const pubMap = Object.fromEntries((pub.parts || []).map((p) => [p.cell, p.partId]));
  const asmMap = asm._meta?.partIds || {};
  const diffs = Object.keys({ ...pubMap, ...asmMap })
    .filter((cell) => pubMap[cell] !== asmMap[cell])
    .map((cell) => ({ cell, published: pubMap[cell] || null, assembled: asmMap[cell] || null }));
  const quarantine = countQuarantineFlags(pub);
  return {
    slot,
    status: diffs.length ? 'desync' : 'sync',
    sync: diffs.length === 0,
    quarantine,
    diffs,
    publishedAt: pub.publishedAt || pub._meta?.publishedAt || null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slots =
    args.slots?.length
      ? args.slots
      : (() => {
          const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
          if (!fs.existsSync(asmDir)) return [];
          const re = new RegExp(`^assembled-exam-${args.level.toLowerCase()}-verified-e(\\d+)\\.json$`, 'i');
          return fs
            .readdirSync(asmDir)
            .map((f) => {
              const m = f.match(re);
              return m ? Number(m[1]) : null;
            })
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b);
        })();

  const rows = slots.map((slot) => auditSlot(args.lang, args.level, slot));
  const desync = rows.filter((r) => !r.sync);
  const quarantineSlots = rows.filter((r) => r.quarantine > 0);
  const freshnessRows = args.checkFreshness
    ? slots.map((slot) => {
        const asmPath = path.join(ROOT, 'batches/ready/assembled-from-verified', `assembled-exam-${args.level.toLowerCase()}-verified-e${slot}.json`);
        return auditAssembledFreshness(asmPath, args.level);
      })
    : [];
  const staleCount = freshnessRows.filter((r) => r.stale).length;
  const report = {
    scannedAt: new Date().toISOString(),
    lang: args.lang,
    level: args.level,
    slots: rows.length,
    syncCount: rows.filter((r) => r.sync).length,
    desyncCount: desync.length,
    quarantineTotal: rows.reduce((n, r) => n + r.quarantine, 0),
    desyncSlots: desync.map((r) => r.slot),
    quarantineSlots: quarantineSlots.map((r) => ({ slot: r.slot, flags: r.quarantine })),
    freshnessChecked: args.checkFreshness,
    staleAssembledCount: staleCount,
    staleAssembledSlots: freshnessRows.filter((r) => r.stale).map((r) => r.slot),
    freshnessRows,
    rows,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Published vs assembled (${args.lang}/${args.level}) — ${report.syncCount}/${report.slots} SYNC`);
    if (report.desyncCount) {
      console.log(`\n⚠ ${report.desyncCount} slot(s) DESYNC — republish: node scripts/publish-verified-exams-local.mjs --slots ${desync.map((r) => r.slot).join(',')}`);
    }
    if (report.quarantineTotal) {
      console.log(`\n⚠ ${report.quarantineTotal} _lengthBiasQuarantine flag(s) in published snapshots — slots: ${quarantineSlots.map((r) => `e${r.slot}(${r.quarantine})`).join(', ')}`);
    }
    for (const r of rows) {
      const tag = r.sync ? 'SYNC' : 'DESYNC';
      console.log(`  e${r.slot} ${tag} quarantine=${r.quarantine}${r.diffs.length ? ` diffs=${r.diffs.length}` : ''}`);
    }
    if (report.freshnessChecked && report.staleAssembledCount) {
      console.log(
        `\n⛔ ${report.staleAssembledCount} STALE assembled exam(s) — reassemble: node scripts/reassemble-verified-from-pool.mjs --level ${args.level} --slots ${report.staleAssembledSlots.join(',')}`,
      );
    }
    if (!report.desyncCount && !report.quarantineTotal && (!report.freshnessChecked || !report.staleAssembledCount)) {
      console.log('\nOK — catalog matches assembled, no quarantine flags.');
    }
  }

  if (args.failOnDesync && (report.desyncCount || report.quarantineTotal)) {
    process.exit(1);
  }
  if (args.failOnStale && report.staleAssembledCount > 0) {
    process.exit(1);
  }
}

main();
