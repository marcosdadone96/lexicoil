#!/usr/bin/env node
/**
 * CHK-31: re-enrich vocabularyTags (enrichBatchMetadata vocab) — deterministic, no LLM.
 *
 *   node scripts/repair-pool-chk31-vocab-enrich.mjs --preview [--sample 10]
 *   node scripts/repair-pool-chk31-vocab-enrich.mjs --apply --confirm [--sync-seed]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import { collectChk31TagIssues, countChk31Issues } from './lib/chk31VocabLemma.mjs';

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

function tagDiffs(before, after) {
  const diffs = [];
  const bqs = before.questions || [];
  const aqs = after.questions || [];
  for (let i = 0; i < Math.max(bqs.length, aqs.length); i++) {
    const bt = bqs[i]?.vocabularyTags || [];
    const at = aqs[i]?.vocabularyTags || [];
    if (JSON.stringify(bt) !== JSON.stringify(at)) {
      diffs.push({ questionId: bqs[i]?.id || aqs[i]?.id, before: bt, after: at });
    }
  }
  return diffs;
}

function repairBatch(batch) {
  const { batch: next } = enrichBatchMetadata(structuredClone(batch), {
    vocab: true,
    grammar: false,
    topic: false,
  });
  next._poolChk31VocabEnrichAt = new Date().toISOString();
  next._poolChk31VocabEnrichNote = 'repair-pool-chk31-vocab-enrich.mjs';
  return next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.preview && !(args.apply && args.confirm) && !args.listOnly) {
    console.error(`
Usage:
  node scripts/repair-pool-chk31-vocab-enrich.mjs --preview [--sample 10]
  node scripts/repair-pool-chk31-vocab-enrich.mjs --apply --confirm [--sync-seed]
`);
    process.exit(1);
  }

  const affected = [];
  for (const e of listPoolFiles()) {
    const batch = JSON.parse(fs.readFileSync(e.abs, 'utf8'));
    const beforeN = countChk31Issues(batch);
    if (beforeN > 0) affected.push({ ...e, batch, beforeN });
  }

  console.log(`\n── CHK-31 vocab enrich scan ──`);
  console.log(`Affected files: ${affected.length}`);
  console.log(`Tag issues (sum): ${affected.reduce((n, a) => n + a.beforeN, 0)}\n`);

  if (args.listOnly) {
    for (const a of affected) console.log(`  ${a.level}/${a.file}  issues=${a.beforeN}`);
    return;
  }

  if (args.apply && !args.confirm && !args.preview) {
    console.error('\n[repair] BLOCKED: use --preview then --apply --confirm\n');
    process.exit(2);
  }

  const rows = [];
  let applied = 0;
  let failed = 0;

  for (const a of affected) {
    const fixed = repairBatch(a.batch);
    const afterN = countChk31Issues(fixed);
    const diffs = tagDiffs(a.batch, fixed);
    const row = {
      file: `${a.level}/${a.file}`,
      issuesBefore: a.beforeN,
      issuesAfter: afterN,
      ok: afterN === 0,
      tagDiffs: diffs.slice(0, 20),
    };
    rows.push(row);

    if (args.apply && args.confirm) {
      if (afterN > 0) {
        failed++;
        continue;
      }
      fs.writeFileSync(a.abs, `${JSON.stringify(fixed, null, 2)}\n`, 'utf8');
      applied++;
      if (args.syncSeed) {
        const rel = `batches/ready/pool-verified/${a.level}/${a.file}`;
        await syncPoolVerifiedBatch({
          file: a.file,
          batch: fixed,
          level: a.level,
          opts: { sourceFile: rel, trigger: 'repair-pool-chk31-vocab-enrich', syncBlobs: false },
        });
      }
    }
  }

  const sampleRows = rows.filter((r) => r.tagDiffs.length > 0).slice(0, args.sample);
  if (sampleRows.length < args.sample) {
    for (const r of rows.filter((x) => x.issuesBefore > 0)) {
      if (sampleRows.length >= args.sample) break;
      if (!sampleRows.find((s) => s.file === r.file)) sampleRows.push(r);
    }
  }

  console.log(`── Preview sample (${Math.min(args.sample, sampleRows.length)} files) ──\n`);
  for (const s of sampleRows.slice(0, args.sample)) {
    console.log(`▶ ${s.file}  CHK-31 tags ${s.issuesBefore} → ${s.issuesAfter}`);
    for (const d of (s.tagDiffs || []).slice(0, 3)) {
      console.log(`  ${d.questionId}:`);
      console.log(`    antes:  ${JSON.stringify(d.before)}`);
      console.log(`    después: ${JSON.stringify(d.after)}`);
    }
  }

  const logPath = path.join(
    ROOT,
    'batches/ready/gate-logs',
    `pool-chk31-vocab-enrich-${args.apply ? 'apply' : 'preview'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  );
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'preview',
        affected: affected.length,
        rowsSummary: {
          ok: rows.filter((r) => r.ok).length,
          stillBad: rows.filter((r) => !r.ok).length,
        },
        applied,
        failed,
        sampleRows: sampleRows.slice(0, args.sample),
        rows,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n── Summary ──`);
  console.log(`Would fix / fixed clean: ${rows.filter((r) => r.ok).length}/${rows.length}`);
  console.log(`Still CHK-31 after enrich: ${rows.filter((r) => !r.ok).length}`);
  if (args.apply && args.confirm) {
    console.log(`Applied to disk: ${applied}, skipped (still bad): ${failed}`);
  }
  console.log(`Log: ${path.relative(ROOT, logPath).replace(/\\/g, '/')}`);
  if (args.preview && !args.apply) {
    console.log('\n[repair] Preview only — apply: node scripts/repair-pool-chk31-vocab-enrich.mjs --apply --confirm [--sync-seed]');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
