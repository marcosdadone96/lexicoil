#!/usr/bin/env node
/**
 * publish-exam.mjs — Create a published official exam from an assembled file.
 *
 * Reads _meta.partIds from assembled-exam-b1-eN.json, captures contentHash + snapshot
 * per part from pool (blob) or local reusable-seed fallback.
 *
 * Usage:
 *   node scripts/publish-exam.mjs --from assembled-exam-b1-e4.json --dry-run
 *   node scripts/publish-exam.mjs --from assembled-exam-b1-e4.json --apply --yes
 *   node scripts/publish-exam.mjs --from ... --exam-id official-de-B1-e4 --slot 4 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  buildPublishedExamDoc,
  capturePublishedParts,
  defaultExamId,
  getBlobStore,
  loadSeedRecords,
  parseAssembledExamFile,
  summarizePublishedExam,
  upsertPublishedCatalog,
  writePublishedExam,
  OFFICIAL_CELLS,
} from './lib/publishedExamLib.mjs';

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
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = path.resolve(ROOT, argv[++i]);
    else if (a === '--exam-id') out.examId = argv[++i];
    else if (a === '--slot') out.slot = Number(argv[++i]);
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--dry-run') { out.dryRun = true; out.apply = false; }
    else if (a === '--apply') { out.apply = true; out.dryRun = false; }
    else if (a === '--yes') out.yes = true;
    else if (a === '--local-only') out.localOnly = true;
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

function printCapturePreview({ doc, sources, missing }) {
  console.log('\n=== published_exam shape (preview) ===\n');
  const preview = summarizePublishedExam(doc);
  console.log(JSON.stringify(preview, null, 2));

  console.log('\n--- parts: partId + contentHash (full hash in doc) ---\n');
  for (const p of doc.parts) {
    const src = sources[p.cell] || '?';
    console.log(
      `  ${p.cell.padEnd(14)}  ${p.partId}\n` +
      `  ${''.padEnd(14)}  hash=${p.contentHash}  (${src})`,
    );
  }

  if (missing.length) {
    console.log('\n⚠  Missing parts:');
    for (const m of missing) console.log(`    · ${m}`);
  }

  console.log('\n--- example part entry (lesen_3 only, snapshot truncated) ---\n');
  const l3 = doc.parts.find((p) => p.cell === 'lesen_3');
  if (l3) {
    const snapPreview = {
      cell: l3.cell,
      partId: l3.partId,
      contentHash: l3.contentHash,
      snapshot: {
        ...l3.snapshot,
        questions: `[${(l3.snapshot.questions || []).length} questions]`,
        ads: l3.snapshot.ads ? `[${l3.snapshot.ads.length} ads]` : undefined,
      },
    };
    console.log(JSON.stringify(snapPreview, null, 2));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.from) {
    console.log(`Usage: node scripts/publish-exam.mjs --from assembled-exam-b1-e4.json [--dry-run|--apply]

Options:
  --from <path>     Assembled exam JSON (requires _meta.partIds)
  --exam-id <id>    Default: official-{lang}-{level}-e{slot}
  --slot <n>        Override slot (default: _meta.examNumber)
  --title <text>    Default: Official {level} Exam {slot}
  --lang --level    Default from assembled / de B1
  --dry-run         Preview only (default)
  --apply           Write published_exam (+ catalog); requires --yes or prompt
  --local-only      Write library/published-exams/ only (no Netlify blob)
  --yes             Skip confirmation on --apply`);
    process.exit(args.help ? 0 : 2);
  }

  if (!fs.existsSync(args.from)) {
    console.error(`File not found: ${args.from}`);
    process.exit(1);
  }

  const assembled = parseAssembledExamFile(args.from);
  const lang = args.lang || assembled.lang;
  const level = args.level || assembled.level;
  const slot = args.slot ?? assembled.slot;
  const examId = args.examId || defaultExamId(lang, level, slot);
  const title = args.title || `Official ${level} Exam ${slot}`;

  const { byId: seedById, source: seedFile } = loadSeedRecords(lang, level);
  const store = args.localOnly ? null : await getBlobStore();

  console.log(`\n=== publish-exam ${args.dryRun ? 'DRY-RUN' : 'APPLY'} ===`);
  console.log(`  from:    ${path.relative(ROOT, args.from)}`);
  console.log(`  examId:  ${examId}  slot=${slot}`);
  console.log(`  seed:    ${seedFile ? path.relative(ROOT, seedFile) : '(none)'}`);
  console.log(`  store:   ${store ? 'netlify-blobs' : 'local-seed-only'}`);

  const { parts, missing, sources } = await capturePublishedParts(store, {
    lang,
    level,
    partIdMap: assembled.partIds,
    seedById,
  });

  if (missing.length) {
    console.error(`\n✗ Cannot publish — missing ${missing.length} part(s):`);
    for (const m of missing) console.error(`    · ${m}`);
    process.exit(1);
  }

  if (parts.length !== OFFICIAL_CELLS.length) {
    console.error(`\n✗ Expected ${OFFICIAL_CELLS.length} parts, got ${parts.length}`);
    process.exit(1);
  }

  const doc = buildPublishedExamDoc({
    examId,
    lang,
    level,
    title,
    slot,
    parts,
    status: 'live',
    manifestVersion: 1,
    gate1: assembled.gate1,
    sourceAssembled: path.relative(ROOT, args.from),
  });

  printCapturePreview({ doc, sources, missing: [] });

  if (args.dryRun) {
    console.log('\n[DRY-RUN] No files or blobs written. Re-run with --apply to publish.');
    process.exit(0);
  }

  if (!args.yes) {
    const ok = await confirm('\nWrite published_exam?');
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  await writePublishedExam({
    store,
    lang,
    level,
    doc,
    applyLocal: true,
    applyBlob: !!store,
  });

  await upsertPublishedCatalog({
    store,
    lang,
    level,
    examEntry: {
      examId,
      slot,
      title,
      status: doc.status,
      manifestVersion: doc.manifestVersion,
      publishedAt: doc.publishedAt,
    },
    applyLocal: true,
    applyBlob: !!store,
  });

  console.log(`\n✅ Published ${examId} (manifest v${doc.manifestVersion})`);
  if (store) console.log(`   blob: published_exam:${lang}:${level}:${examId}`);
  console.log(`   local: library/published-exams/${lang}/${level}/${examId}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
