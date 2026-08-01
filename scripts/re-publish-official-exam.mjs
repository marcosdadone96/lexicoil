#!/usr/bin/env node
/**
 * re-publish-official-exam.mjs — Re-capture snapshots + hashes for a published exam.
 *
 * NOT the same as publish-verified-exams-local.mjs:
 *   - Operates on an existing `library/published-exams/.../official-*.json` manifest.
 *   - Keeps the same partIds; re-reads payloads from blob (if configured) or reusable-seed.
 *   - Does NOT read pool-verified directly and does NOT update data/exams/*.json (no sync-served).
 *
 * Integrity today:
 *   - assessPublishedExamIntegrity: **diagnostic only** (prints before/after drift vs seed/blob).
 *   - Blocks apply if capturePublishedParts reports missing partIds in seed/blob.
 *   - Does NOT re-run GATE-1; copies existing gate1 from the manifest.
 *
 * Failure modes (without guards):
 *   - Seed stale vs pool-verified after a pool repair → recapture **cements obsolete seed** into the manifest.
 *   - sourceAssembled STALE → re-publish does not fix served assembled body; wrong operational fix.
 *   - Corrupt seed row for a partId → propagates into published_exam unchanged.
 *
 * Apply gates (blocking unless ack flags):
 *   - assertRepublishSeedMatchesPool — seed must match pool-verified snapshot hash per partId.
 *   - assertRepublishAssembledNotStale — if sourceAssembled exists and is STALE vs pool.
 *
 * Preferred path after content fixes: reassemble-verified-from-pool → publish-verified-exams-local.
 *
 * Usage:
 *   node scripts/re-publish-official-exam.mjs --exam-id official-de-B1-e4 --dry-run
 *   node scripts/re-publish-official-exam.mjs --slot 4 --apply --yes
 *   node scripts/exam-status.mjs --level B1   # read-only integrity report
 */
import readline from 'node:readline';
import { loadEnvFile } from './lib/loadEnv.mjs';
import {
  assessPublishedExamIntegrity,
  buildPublishedExamDoc,
  capturePublishedParts,
  getBlobStore,
  loadSeedRecords,
  readPublishedCatalog,
  readPublishedExam,
  summarizePublishedExam,
  upsertPublishedCatalog,
  writePublishedExam,
} from './lib/publishedExamLib.mjs';
import {
  assertRepublishAssembledNotStale,
  assertRepublishSeedMatchesPool,
  auditRepublishSeedVsPool,
} from './lib/republishOfficialExamGuard.mjs';

loadEnvFile();

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    examId: null,
    slot: null,
    dryRun: true,
    apply: false,
    yes: false,
    confirm: false,
    localOnly: false,
    ackSeedPoolDrift: false,
    ackAssembledStale: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--exam-id') out.examId = argv[++i];
    else if (a === '--slot') out.slot = Number(argv[++i]);
    else if (a === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
    } else if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--yes') out.yes = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--local-only') out.localOnly = true;
    else if (a === '--ack-seed-pool-drift') out.ackSeedPoolDrift = true;
    else if (a === '--ack-assembled-stale') out.ackAssembledStale = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  if (!out.apply) out.dryRun = true;
  return out;
}

async function confirm(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${msg} [y/N] `, resolve));
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}

async function resolveExamId(store, args) {
  if (args.examId) return args.examId;
  if (args.slot == null) return null;
  const cat = await readPublishedCatalog({ store, lang: args.lang, level: args.level });
  const row = (cat.exams || []).find((e) => Number(e.slot) === Number(args.slot));
  return row?.examId || null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/re-publish-official-exam.mjs --exam-id <id> | --slot <n> [--dry-run|--apply]

Re-captures contentHash + snapshot from current seed/blob for each partId in the manifest.
Increments manifestVersion on --apply.

Blocking gates on --apply: seed↔pool-verified match; assembled not STALE (if sourceAssembled set).
Ack flags: --ack-seed-pool-drift, --ack-assembled-stale`);
    process.exit(0);
  }

  const store = args.localOnly ? null : await getBlobStore();
  const examId = await resolveExamId(store, args);
  if (!examId) {
    console.error('Provide --exam-id or --slot matching a published exam.');
    process.exit(2);
  }

  const existing = await readPublishedExam({
    store,
    lang: args.lang,
    level: args.level,
    examId,
    preferLocal: args.localOnly,
  });
  if (!existing) {
    console.error(`Published exam not found: ${examId}`);
    process.exit(1);
  }

  const { byId: seedById } = loadSeedRecords(args.lang, args.level);
  const before = await assessPublishedExamIntegrity(store, existing, seedById);

  const partIdMap = Object.fromEntries(
    (existing.parts || []).map((p) => [p.cell, p.partId]),
  );

  const seedPool = auditRepublishSeedVsPool({
    level: args.level,
    partIdMap,
    seedById,
  });
  console.log(
    `\nseed↔pool-verified: ${seedPool.ok ? 'OK' : `DRIFT (${seedPool.drift.length} cells)`}`,
  );
  if (seedPool.drift.length) {
    for (const d of seedPool.drift) {
      console.log(`  ${d.cell} ${d.partId} seed=${d.seedHash} pool=${d.poolHash}`);
    }
  }

  const { parts, missing, sources } = await capturePublishedParts(store, {
    lang: args.lang,
    level: args.level,
    partIdMap,
    seedById,
  });

  if (missing.length) {
    console.error('Cannot re-publish — missing parts:', missing.join(', '));
    process.exit(1);
  }

  const nextVersion = (existing.manifestVersion || 1) + 1;
  const doc = buildPublishedExamDoc({
    examId: existing.examId,
    lang: existing.lang,
    level: existing.level,
    title: existing.title,
    slot: existing.slot,
    parts,
    status: existing.status || 'live',
    manifestVersion: nextVersion,
    previousManifestVersion: existing.manifestVersion || 1,
    gate1: existing.gate1,
    sourceAssembled: existing.sourceAssembled,
  });

  console.log(`\n=== re-publish ${args.dryRun ? 'DRY-RUN' : 'APPLY'} ===`);
  console.log(`  examId:  ${examId}`);
  console.log(`  version: ${existing.manifestVersion || 1} → ${nextVersion}`);
  console.log(`  before:  ${before.integrity} (published manifest vs current seed/blob)`);

  const changed = [];
  for (const p of parts) {
    const prev = (existing.parts || []).find((x) => x.cell === p.cell);
    if (!prev || prev.contentHash !== p.contentHash) {
      changed.push(p.cell);
    }
  }

  console.log(`  cells with new hash: ${changed.length ? changed.join(', ') : '(none — idempotent recapture)'}`);
  console.log('\nPreview:\n', JSON.stringify(summarizePublishedExam(doc), null, 2));

  if (args.dryRun) {
    console.log('\n[DRY-RUN] No writes.');
    process.exit(0);
  }

  if (!args.ackSeedPoolDrift) {
    assertRepublishSeedMatchesPool({ level: args.level, partIdMap, seedById });
  } else {
    console.warn('[re-publish] --ack-seed-pool-drift: applying despite seed≠pool-verified');
  }
  if (!args.ackAssembledStale) {
    assertRepublishAssembledNotStale(existing.sourceAssembled, args.level);
  } else {
    console.warn('[re-publish] --ack-assembled-stale: applying despite STALE assembled');
  }

  if (!args.yes && !args.confirm) {
    const ok = await confirm('Apply re-publish?');
    if (!ok) process.exit(0);
  }

  await writePublishedExam({
    store,
    lang: args.lang,
    level: args.level,
    doc,
    applyLocal: true,
    applyBlob: !!store,
  });

  await upsertPublishedCatalog({
    store,
    lang: args.lang,
    level: args.level,
    examEntry: {
      examId: doc.examId,
      slot: doc.slot,
      title: doc.title,
      status: doc.status,
      manifestVersion: doc.manifestVersion,
      publishedAt: doc.publishedAt,
    },
    applyLocal: true,
    applyBlob: !!store,
  });

  console.log(`\n✅ Re-published ${examId} at manifest v${nextVersion}`);
  console.log('  Note: run sync-published-to-served if data/exams must match catalog.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
