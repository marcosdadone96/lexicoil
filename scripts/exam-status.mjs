#!/usr/bin/env node
/**
 * exam-status.mjs — Integrity report for published official exams.
 *
 * Compares each published part's contentHash vs current pool/seed payload hash.
 *
 * Usage:
 *   node scripts/exam-status.mjs --lang de --level B1
 *   node scripts/exam-status.mjs --lang de --level B1 --exam-id official-de-B1-e4
 *   node scripts/exam-status.mjs --lang de --level B1 --json
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import {
  assessPublishedExamIntegrity,
  getBlobStore,
  listPublishedExams,
  loadSeedRecords,
  readPublishedCatalog,
  readPublishedExam,
  shortHash,
} from './lib/publishedExamLib.mjs';

loadEnvFile();

function parseArgs(argv) {
  const out = {
    lang: 'de',
    level: 'B1',
    examId: null,
    json: false,
    localOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--exam-id') out.examId = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--local-only') out.localOnly = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function assessOne(store, doc, seedById) {
  const report = await assessPublishedExamIntegrity(store, doc, seedById);
  return {
    examId: doc.examId,
    slot: doc.slot,
    title: doc.title,
    status: doc.status,
    manifestVersion: doc.manifestVersion,
    publishedAt: doc.publishedAt,
    integrity: report.integrity,
    divergentCells: report.partResults.filter((p) => p.state === 'divergent').map((p) => p.cell),
    missingCells: report.partResults.filter((p) => p.state === 'missing').map((p) => p.cell),
    parts: report.partResults,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/exam-status.mjs [--lang de] [--level B1] [--exam-id id] [--json]`);
    process.exit(0);
  }

  const store = args.localOnly ? null : await getBlobStore();
  const { byId: seedById } = loadSeedRecords(args.lang, args.level);

  let exams = [];
  if (args.examId) {
    const doc = await readPublishedExam({
      store,
      lang: args.lang,
      level: args.level,
      examId: args.examId,
      preferLocal: args.localOnly,
    });
    if (!doc) {
      console.error(`No published exam: ${args.examId}`);
      process.exit(1);
    }
    exams = [doc];
  } else {
    exams = await listPublishedExams({ store, lang: args.lang, level: args.level });
    if (!exams.length) {
      const cat = await readPublishedCatalog({ store, lang: args.lang, level: args.level });
      if (!cat.exams?.length) {
        console.log(`No published exams for ${args.lang}/${args.level}.`);
        process.exit(0);
      }
    }
  }

  const reports = [];
  for (const doc of exams) {
    reports.push(await assessOne(store, doc, seedById));
  }

  if (args.json) {
    console.log(JSON.stringify({ lang: args.lang, level: args.level, exams: reports }, null, 2));
  } else {
    console.log(`\n=== exam-status ${args.lang}/${args.level} ===\n`);
    if (!reports.length) {
      console.log('(no published exams found)');
    }
    for (const r of reports) {
      const flag = r.integrity === 'ok' ? 'OK' : r.integrity.toUpperCase();
      console.log(`${r.examId}  slot=${r.slot}  v${r.manifestVersion}  ${flag}`);
      if (r.integrity !== 'ok') {
        for (const p of r.parts.filter((x) => x.state !== 'ok')) {
          console.log(
            `  ${p.cell}  ${p.partId}\n` +
            `    published: ${shortHash(p.publishedHash)}  pool: ${p.poolHash ? shortHash(p.poolHash) : 'MISSING'}  (${p.state})`,
          );
        }
      } else {
        console.log(`  (${r.parts.length}/${r.parts.length} parts match pool)`);
      }
      console.log('');
    }
  }

  const bad = reports.some((r) => r.integrity !== 'ok');
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
