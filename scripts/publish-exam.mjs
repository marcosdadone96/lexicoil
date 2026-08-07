#!/usr/bin/env node
/**
 * publish-exam.mjs — CLI for official publish (thin wrapper).
 *
 * **Do not use --apply on this script directly.** It delegates to
 * publish-verified-exams-local.mjs → publishVerifiedExamSlots (freshness gate + overlay + sync).
 *
 * Dry-run preview (single file, with freshness check):
 *   node scripts/publish-exam.mjs --from batches/ready/assembled-from-verified/assembled-exam-b1-verified-e4.json
 *
 * Apply (supported path):
 *   node scripts/publish-verified-exams-local.mjs --slots 4 --level B1
 *
 * Internal: publishVerifiedExamSlots → applyPublishExamFromAssembled (in-process, after freshness).
 *
 * Known exception (not assembled-exam-*): re-publish-official-exam.mjs — see that script’s header
 * (seed↔pool + assembled STALE gates on --apply; not a substitute for publish-verified-exams-local).
 */
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { assertAssembledFreshBeforePublish } from './lib/assembledExamFreshness.mjs';
import {
  applyPublishExamFromAssembled,
  classifyAssembledSourcePath,
} from './lib/applyPublishExamFromAssembled.mjs';
import { parseAssembledExamFile } from './lib/publishedExamLib.mjs';

loadEnvFile();

function parseArgs(argv) {
  const out = {
    from: null,
    examId: null,
    slot: null,
    title: null,
    lang: null,
    level: null,
    dryRun: true,
    apply: false,
    yes: false,
    localOnly: false,
    seedOverlay: null,
    noSyncServed: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = path.resolve(ROOT, argv[++i]);
    else if (a === '--exam-id') out.examId = argv[++i];
    else if (a === '--slot') out.slot = Number(argv[++i]);
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--seed-overlay') out.seedOverlay = path.resolve(ROOT, argv[++i]);
    else if (a === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
    } else if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--yes') out.yes = true;
    else if (a === '--local-only') out.localOnly = true;
    else if (a === '--no-sync-served') out.noSyncServed = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  if (!out.apply) out.dryRun = true;
  return out;
}

function printUsage() {
  console.log(`Usage:
  Preview:  node scripts/publish-exam.mjs --from <assembled-exam-*-verified-eN.json>
  Publish:  node scripts/publish-verified-exams-local.mjs --slots N [--level B1|A2]

Options (preview only):
  --from --dry-run (default)  Freshness gate + capture preview
  --seed-overlay <path>       Merge seed overlay before preview (internal publish uses pool overlay)

Direct --apply on official assembled files delegates to publishVerifiedExamSlots.
Other paths: use publish-verified-exams-local.mjs only.`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.from) {
    printUsage();
    process.exit(args.help ? 0 : 2);
  }

  const kind = classifyAssembledSourcePath(args.from);
  const parsed = parseAssembledExamFile(args.from);
  const slot = args.slot ?? parsed.slot;
  const level = args.level || parsed.level;
  const lang = args.lang || parsed.lang;

  if (args.apply) {
    if (kind === 'quarantine') {
      console.error(
        '\n✗ Refusing --apply on quarantine assembled JSON.\n' +
          '  Restore to batches/ready/assembled-from-verified/, reassemble, then:\n' +
          '  node scripts/publish-verified-exams-local.mjs --slots ' +
          slot +
          ' --level ' +
          level,
      );
      process.exit(1);
    }
    if (kind !== 'official') {
      console.error(
        '\n✗ Direct publish-exam --apply is disabled for non-official paths.\n' +
          '  Use: node scripts/publish-verified-exams-local.mjs --slots ' +
          slot +
          ' --level ' +
          level,
      );
      process.exit(1);
    }
    const { publishVerifiedExamSlots } = await import('./lib/verifiedExamPublishLib.mjs');
    await publishVerifiedExamSlots({
      slots: [slot],
      lang,
      level,
      dryRun: false,
      syncServed: !args.noSyncServed,
    });
    console.log('\n(via publishVerifiedExamSlots — freshness gate + overlay + catalog + served sync)');
    return;
  }

  assertAssembledFreshBeforePublish({ slots: [slot], level });

  if (args.dryRun && kind === 'official') {
    const { publishVerifiedExamSlots } = await import('./lib/verifiedExamPublishLib.mjs');
    const preview = await publishVerifiedExamSlots({
      slots: [slot],
      lang,
      level,
      dryRun: true,
      syncServed: false,
    });
    console.log('\n[DRY-RUN via publishVerifiedExamSlots]', JSON.stringify(preview, null, 2));
    return;
  }

  await applyPublishExamFromAssembled({
    from: args.from,
    examId: args.examId,
    slot: args.slot,
    title: args.title,
    lang: args.lang,
    level: args.level,
    dryRun: true,
    yes: false,
    localOnly: args.localOnly,
    seedOverlay: args.seedOverlay,
  });
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
