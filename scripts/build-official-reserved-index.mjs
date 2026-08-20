#!/usr/bin/env node
/**
 * Build official part reservation index for Textos exclusion.
 *
 *   node scripts/build-official-reserved-index.mjs
 *   node scripts/build-official-reserved-index.mjs --lang de --level B1
 *   node scripts/build-official-reserved-index.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const {
  buildOfficialReservedIndex,
  writeOfficialReservedIndex,
  readAvailabilityExamCount,
  summarizeIndex,
  stripBuildMeta,
  officialReservedIndexBlobKey,
} = require(path.join(ROOT, 'netlify/functions/lib/officialReservedIndex.js'));

function parseArgs(argv) {
  let lang = 'de';
  let level = 'B1';
  let dryRun = false;
  let expectLive = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') lang = String(argv[++i] || 'de').toLowerCase();
    else if (a === '--level') level = String(argv[++i] || 'B1').toUpperCase();
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--expect-live') expectLive = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/build-official-reserved-index.mjs [options]

Options:
  --lang de           Language (default: de)
  --level B1          CEFR level (default: B1)
  --expect-live N     Fail if live exam count != N
  --dry-run           Print summary without writing files
`);
      process.exit(0);
    }
  }

  return { lang, level, dryRun, expectLive };
}

const args = parseArgs(process.argv.slice(2));
const index = buildOfficialReservedIndex({ lang: args.lang, level: args.level, root: ROOT });
const summary = summarizeIndex(index);
const availabilityExams = readAvailabilityExamCount(args.lang, args.level, ROOT);
const errors = [];

if (index.buildMeta?.missingManifests?.length) {
  errors.push(`Missing manifests for live exams: ${index.buildMeta.missingManifests.join(', ')}`);
}

if (availabilityExams != null && index.liveExamCount !== availabilityExams) {
  errors.push(
    `Catalog liveExamCount (${index.liveExamCount}) != availability.json exams (${availabilityExams})`,
  );
}

if (args.expectLive != null && index.liveExamCount !== args.expectLive) {
  errors.push(`liveExamCount (${index.liveExamCount}) != --expect-live ${args.expectLive}`);
}

const gateLog = {
  script: 'build-official-reserved-index.mjs',
  at: new Date().toISOString(),
  lang: args.lang,
  level: args.level,
  blobKey: officialReservedIndexBlobKey(args.lang, args.level),
  summary,
  availabilityExams,
  catalogPath: index.buildMeta?.catalogPath,
  errors,
  ok: errors.length === 0,
};

const gateLogPath = path.join(
  ROOT,
  'batches/ready/gate-logs',
  `official-reserved-index-${args.lang}_${args.level}-${new Date().toISOString().slice(0, 10)}.json`,
);

console.log(JSON.stringify({ ...gateLog, index: stripBuildMeta(index) }, null, 2));

if (errors.length) {
  if (!args.dryRun) fs.writeFileSync(gateLogPath, `${JSON.stringify(gateLog, null, 2)}\n`);
  console.error('\nBUILD FAILED:', errors.join('; '));
  process.exit(1);
}

if (args.dryRun) {
  console.log('\nDRY RUN — index not written');
  process.exit(0);
}

const outPath = writeOfficialReservedIndex(index, { lang: args.lang, level: args.level, root: ROOT });
gateLog.writtenPath = path.relative(ROOT, outPath);
fs.writeFileSync(gateLogPath, `${JSON.stringify(gateLog, null, 2)}\n`);

console.log(`\nWrote ${gateLog.writtenPath}`);
console.log(`Gate log: ${path.relative(ROOT, gateLogPath)}`);
