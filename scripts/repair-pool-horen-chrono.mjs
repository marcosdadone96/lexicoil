#!/usr/bin/env node
/**
 * CHK-35 (Hören T3 R/F) + CHK-29 (Hören T4 matching): char-pos chronological reorder — deterministic.
 *
 *   node scripts/repair-pool-horen-chrono.mjs --preview [--sample 10]
 *   node scripts/repair-pool-horen-chrono.mjs --apply --confirm [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { inferBatchLevel } from './lib/batchPaths.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import {
  verifyRfChronoByCharPos,
  reorderRfByCharEvidence,
  evidenceCharPos,
} from './lib/horenRfChronoEvidence.mjs';
import { verifyHorenT4MatchingChrono } from './lib/horenT4ChronoEvidence.mjs';

const BLUEPRINT = { 'horen-3': { count: 7 }, 'horen-4': { count: 8 } };
const BLUEPRINT_A2 = { 'horen-3': { count: 5 }, 'horen-4': { count: 5 } };
function blueprintForLevel(level) {
  return String(level || 'B1').toUpperCase() === 'A2' ? BLUEPRINT_A2 : BLUEPRINT;
}

loadEnvFile();

const LEVELS = ['B1', 'A2'];
const POOL_ROOT = path.join(ROOT, 'batches/ready/pool-verified');

function parseArgs(argv) {
  let sample = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample') sample = Math.max(1, Number(argv[++i]) || 10);
  }
  return {
    apply: argv.includes('--apply'),
    preview: argv.includes('--preview'),
    confirm: argv.includes('--confirm'),
    syncSeed: argv.includes('--sync-seed'),
    listOnly: argv.includes('--list-only'),
    sample,
  };
}

function listPoolFiles() {
  const files = [];
  for (const lv of LEVELS) {
    const dir = path.join(POOL_ROOT, lv);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && !f.startsWith('.')) {
        files.push({ level: lv, file: f, abs: path.join(dir, f) });
      }
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

function reorderT4MatchingByCharPos(batch) {
  const text = String(batch.passages?.[0]?.text || '');
  const qs = [...(batch.questions || [])];
  const before = qs.map((q) => q.id);
  const scored = qs.map((q) => {
    const pos = evidenceCharPos(q, text).pos;
    const idn = Number(String(q.id).match(/-(\d+)$/)?.[1] || 0);
    return { q, pos: pos < 0 ? Number.MAX_SAFE_INTEGER : pos, idn };
  });
  scored.sort((a, b) => a.pos - b.pos || a.idn - b.idn);
  batch.questions = scored.map((s) => s.q);
  const after = batch.questions.map((q) => q.id);
  return { changed: before.join('|') !== after.join('|'), before, after };
}

function chronoState(batch, file) {
  const lv = inferBatchLevel(batch);
  const level = lv === 'MIXED' ? 'B1' : lv;
  const out = { level, kinds: [] };

  const t3rf = (batch.questions || []).filter(
    (q) => String(q.module || '').toLowerCase() === 'horen'
      && Number(q.teil) === 3
      && String(q.type || '').toLowerCase() === 'richtig_falsch',
  );
  const exp3 = blueprintForLevel(level)['horen-3']?.count;
  if (t3rf.length && (exp3 == null || t3rf.length === exp3)) {
    const v = verifyRfChronoByCharPos(batch);
    if (!v.ok) out.kinds.push({ kind: 'CHK-35', verify: v });
  }

  const t4m = (batch.questions || []).filter(
    (q) => q.module === 'horen' && Number(q.teil) === 4 && q.type === 'matching',
  );
  const exp4 = blueprintForLevel(level)['horen-4']?.count;
  if (t4m.length && exp4 != null && t4m.length === exp4) {
    const v = verifyHorenT4MatchingChrono(batch);
    const nWarn = (v.warnings || []).length + (v.blockingIssues || []).length;
    if (nWarn > 0) out.kinds.push({ kind: 'CHK-29', verify: v });
  }

  out.needsWork = out.kinds.length > 0;
  out.hasModerator = /\bModerator(?:in)?:/i.test(String(batch.passages?.[0]?.text || ''));
  return out;
}

function repairBatch(batch) {
  const next = structuredClone(batch);
  let t3 = null;
  let t4 = null;

  const t3all = (next.questions || []).every((q) => q.type === 'richtig_falsch');
  if (t3all && (next.questions || []).length > 1) {
    t3 = reorderRfByCharEvidence(next);
  }

  const isT4 = (next.questions || []).every(
    (q) => q.module === 'horen' && Number(q.teil) === 4 && q.type === 'matching',
  );
  if (isT4 && (next.questions || []).length > 1) {
    t4 = reorderT4MatchingByCharPos(next);
  } else {
    const t4qs = (next.questions || []).filter(
      (q) => q.module === 'horen' && Number(q.teil) === 4 && q.type === 'matching',
    );
    if (t4qs.length > 1 && t4qs.length === (next.questions || []).length) {
      t4 = reorderT4MatchingByCharPos(next);
    }
  }

  next._poolHorenChronoRepairAt = new Date().toISOString();
  next._poolHorenChronoRepairNote = 'repair-pool-horen-chrono.mjs';
  return { batch: next, t3, t4 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.preview && !(args.apply && args.confirm) && !args.listOnly) {
    console.error(`
Usage:
  node scripts/repair-pool-horen-chrono.mjs --preview [--sample 10]
  node scripts/repair-pool-horen-chrono.mjs --apply --confirm [--sync-seed]
`);
    process.exit(1);
  }

  const affected = [];
  for (const e of listPoolFiles()) {
    if (!fs.existsSync(e.abs)) continue;
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const st = chronoState(batch, e.file);
    if (st.needsWork) affected.push({ ...e, batch, st });
  }

  const t35 = affected.filter((a) => a.st.kinds.some((k) => k.kind === 'CHK-35'));
  const t29 = affected.filter((a) => a.st.kinds.some((k) => k.kind === 'CHK-29'));

  console.log(`\n── Hören chrono scan ──`);
  console.log(`Affected files: ${affected.length} (CHK-35: ${t35.length}, CHK-29: ${t29.length})\n`);

  if (args.listOnly) {
    for (const a of affected) {
      const k = a.st.kinds.map((x) => x.kind).join('+');
      console.log(`  ${a.level}/${a.file}  [${k}] mod=${a.st.hasModerator}`);
    }
    return;
  }

  const rows = [];
  let applied = 0;

  for (const a of affected) {
    if (!fs.existsSync(a.abs)) continue;
    const beforeSt = chronoState(a.batch, a.file);
    const { batch: fixed, t3, t4 } = repairBatch(a.batch);
    const afterSt = chronoState(fixed, a.file);

    const row = {
      file: `${a.level}/${a.file}`,
      kinds: beforeSt.kinds.map((k) => k.kind),
      hasModerator: beforeSt.hasModerator,
      t3OrderBefore: t3?.before,
      t3OrderAfter: t3?.after,
      t3Changed: t3?.changed ?? false,
      t4OrderBefore: t4?.before,
      t4OrderAfter: t4?.after,
      t4Changed: t4?.changed ?? false,
      ok: !afterSt.needsWork,
      beforeKinds: beforeSt.kinds.map((k) => k.kind),
      afterKinds: afterSt.kinds.map((k) => k.kind),
    };
    rows.push(row);

    if (args.apply && args.confirm && row.ok) {
      fs.writeFileSync(a.abs, `${JSON.stringify(fixed, null, 2)}\n`, 'utf8');
      applied++;
      if (args.syncSeed) {
        const rel = `batches/ready/pool-verified/${a.level}/${a.file}`;
        await syncPoolVerifiedBatch({
          file: a.file,
          batch: fixed,
          level: a.level,
          opts: { sourceFile: rel, trigger: 'repair-pool-horen-chrono', syncBlobs: false },
        });
      }
    }
  }

  const moderatorFirst = rows.filter((r) => r.hasModerator);
  const sample = [];
  for (const r of moderatorFirst) {
    if (sample.length >= Math.ceil(args.sample / 2)) break;
    sample.push(r);
  }
  for (const r of rows) {
    if (sample.length >= args.sample) break;
    if (!sample.find((s) => s.file === r.file)) sample.push(r);
  }

  console.log(`── Preview sample (${sample.length} files) ──\n`);
  for (const s of sample) {
    console.log(`▶ ${s.file}  [${s.kinds.join('+')}] moderator=${s.hasModerator} → ok=${s.ok}`);
    if (s.t3Changed && s.t3OrderBefore) {
      console.log(`  T3 antes:  ${s.t3OrderBefore.join(' → ')}`);
      console.log(`  T3 después: ${s.t3OrderAfter.join(' → ')}`);
    }
    if (s.t4Changed && s.t4OrderBefore) {
      console.log(`  T4 antes:  ${s.t4OrderBefore.map((id) => id.replace(/gen-q-h4-[^-]+-/, '')).join(' → ')}`);
      console.log(`  T4 después: ${s.t4OrderAfter.map((id) => id.replace(/gen-q-h4-[^-]+-/, '')).join(' → ')}`);
    }
  }

  const logPath = path.join(
    ROOT,
    'batches/ready/gate-logs',
    `pool-horen-chrono-${args.apply ? 'apply' : 'preview'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  );
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'preview',
        affected: affected.length,
        chk35Files: t35.length,
        chk29Files: t29.length,
        ok: rows.filter((r) => r.ok).length,
        stillBad: rows.filter((r) => !r.ok).length,
        applied,
        sample,
        rows,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n── Summary ──`);
  console.log(`Clean after reorder: ${rows.filter((r) => r.ok).length}/${rows.length}`);
  console.log(`Still failing: ${rows.filter((r) => !r.ok).length}`);
  if (args.apply && args.confirm) console.log(`Applied: ${applied}`);
  console.log(`Log: ${path.relative(ROOT, logPath).replace(/\\/g, '/')}`);

  if (args.preview && !args.apply) {
    console.log('\n[repair] Preview only — apply: node scripts/repair-pool-horen-chrono.mjs --apply --confirm [--sync-seed]');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
