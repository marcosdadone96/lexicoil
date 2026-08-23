#!/usr/bin/env node
/**
 * Sync library/published-exams → data/exams/{lang}_{level}.json (legacy served file).
 * Keeps availability.json exam count aligned when not using published source in browser.
 *
 *   node scripts/sync-published-to-served.mjs --lang de --level B1
 *   node scripts/sync-published-to-served.mjs --lang de --level B1 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partRecordToExamPart } from './audit-pass-2.mjs';
import { servedExamPath, comboKey, ROOT } from './lib/examPipeline.mjs';
import { localPublishedDir, readPublishedCatalog, readPublishedExam } from './lib/publishedExamLib.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeExamStructure } = require(path.join(
  ROOT,
  'js/engine/validation/normalizeExamStructure.js',
));

function parseArgs(argv) {
  const out = { lang: 'de', level: 'B1', apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i] || 'de').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || 'B1').toUpperCase();
    else if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function publishedDocToServedExam(doc) {
  const buckets = { lesen: [], horen: [], schreiben: [], sprechen: [] };
  for (const p of doc.parts || []) {
    const part = partRecordToExamPart(p.snapshot);
    if (!part || !buckets[p.module]) continue;
    buckets[p.module].push(part);
  }
  const sort = (arr) => arr.sort((a, b) => a.teil - b.teil);
  const lv = String(doc.level || 'B1').toUpperCase();
  const isA2 = lv === 'A2';
  return {
    id: doc.examId,
    examId: doc.examId,
    topic: doc.title || `Official ${doc.level} Exam ${doc.slot}`,
    level: doc.level,
    lang: doc.lang,
    slot: doc.slot,
    goetheFormat: true,
    libraryBuilt: true,
    publishedExam: true,
    publishedManifestVersion: doc.manifestVersion,
    publishedAt: doc.publishedAt,
    blueprintId: isA2 ? 'goethe-a2' : 'goethe-b1',
    blueprintComplete: true,
    official: {
      board: 'Goethe-Institut',
      certificate: isA2 ? 'Goethe-Zertifikat A2' : 'Goethe-Zertifikat B1',
      note: `Official curated exam (published snapshot v${doc.manifestVersion}, slot ${doc.slot}).`,
    },
    lesenParts: sort(buckets.lesen),
    horenParts: sort(buckets.horen),
    schreibenParts: sort(buckets.schreiben),
    sprechenParts: sort(buckets.sprechen),
    curated: true,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/sync-published-to-served.mjs [--lang de] [--level B1] [--apply]');
    process.exit(0);
  }

  const catalog = await readPublishedCatalog({
    store: null,
    lang: opts.lang,
    level: opts.level,
    preferLocal: true,
  });
  const live = (catalog?.exams || []).filter((e) => e.status === 'live');
  if (!live.length) {
    console.error(`No live published exams for ${comboKey(opts.lang, opts.level)}`);
    process.exit(1);
  }

  const exams = [];
  for (const row of live.sort((a, b) => Number(a.slot) - Number(b.slot))) {
    const doc = await readPublishedExam({
      store: null,
      lang: opts.lang,
      level: opts.level,
      examId: row.examId,
      preferLocal: true,
    });
    if (!doc) {
      console.error(`Missing published file: ${row.examId}`);
      process.exit(1);
    }
    exams.push(normalizeExamStructure(publishedDocToServedExam(doc), { level: opts.level }));
    console.log(`  + ${row.examId} (${doc.parts?.length || 0} parts)`);
  }

  const dest = servedExamPath(opts.lang, opts.level);
  console.log(`\n${opts.apply ? 'WRITE' : 'DRY-RUN'} ${path.relative(ROOT, dest)} ← ${exams.length} exam(s)`);

  if (!opts.apply) {
    console.log('Add --apply to write.');
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(exams, null, 2)}\n`, 'utf8');
  console.log('Done. Run: npm run build:availability');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
