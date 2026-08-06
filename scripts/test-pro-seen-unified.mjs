#!/usr/bin/env node
/**
 * Simulate Pro user: 2–3 full exams then personal parts — no repeats across sources.
 *   node scripts/test-pro-seen-unified.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
const { pickFromLocalSeed } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const PublishedExamAdapter = require(path.join(ROOT, 'js/data/publishedExamAdapter.js'));

const CATALOG_DIR = path.join(ROOT, 'library/published-exams/de/B1');

function extractPartIdsFromExam(exam) {
  const out = [];
  const lang = exam.lang || 'de';
  const level = exam.level || 'B1';
  const slots = [
    ['lesen', 'lesenParts'],
    ['horen', 'horenParts'],
    ['schreiben', 'schreibenParts'],
    ['sprechen', 'sprechenParts'],
  ];
  for (const [mod, key] of slots) {
    for (const p of exam[key] || []) {
      const partId = p.partId || p._partId || p._contentProvenance?.partId || null;
      if (partId) out.push({ lang, level, module: mod, partId: String(partId) });
    }
  }
  return out;
}

function seenPartIds(history, lang, level, module) {
  return [...new Set(
    history
      .filter((h) => h.lang === lang && h.level === level && h.partModule === module && h.partId)
      .map((h) => h.partId),
  )];
}

function recordSeenPart(history, lang, level, module, partId, source) {
  history.push({ lang, level, partId, partModule: module, date: Date.now(), source });
}

function recordSeenPartsFromExam(history, exam) {
  for (const row of extractPartIdsFromExam(exam)) {
    recordSeenPart(history, row.lang, row.level, row.module, row.partId, 'exam');
  }
}

const exams = ['official-de-B1-e1', 'official-de-B1-e2', 'official-de-B1-e3'];
const history = [];

for (const examId of exams) {
  const doc = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, `${examId}.json`), 'utf8'));
  const exam = PublishedExamAdapter.publishedDocToServedExam(doc);
  recordSeenPartsFromExam(history, exam);
}

const modules = ['lesen', 'horen'];
const personalPicks = [];
let repeats = 0;

for (let round = 0; round < 3; round++) {
  for (const mod of modules) {
    const exclude = seenPartIds(history, 'de', 'B1', mod);
    const hit = pickFromLocalSeed('de', 'B1', mod, { teil: 1, excludeIds: exclude, assembleMode: 'practice' });
    if (!hit) continue;
    if (exclude.includes(hit.id)) {
      repeats++;
      personalPicks.push({ round, mod, id: hit.id, repeat: true });
    } else {
      personalPicks.push({ round, mod, id: hit.id, repeat: false });
      recordSeenPart(history, 'de', 'B1', mod, hit.id, 'part');
    }
  }
}

const examPartIds = new Set(
  history.filter((h) => h.source === 'exam').map((h) => `${h.partModule}:${h.partId}`),
);
const crossRepeats = personalPicks.filter(
  (p) => !p.repeat && examPartIds.has(`${p.mod}:${p.id}`),
);

console.log('── Pro seen-parts unified test ──');
console.log(`  full exams simulated : ${exams.length}`);
console.log(`  exam partIds logged  : ${examPartIds.size}`);
console.log(`  personal picks       : ${personalPicks.length}`);
console.log(`  exclude-list repeats : ${repeats}`);
console.log(`  cross-source repeats : ${crossRepeats.length}`);

if (crossRepeats.length) {
  console.log('  FAIL samples:', crossRepeats.slice(0, 5));
  process.exit(1);
}
console.log('\nPASS: personal picks respect full-exam seenPartIds');
process.exit(0);
