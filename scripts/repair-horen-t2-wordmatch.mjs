/**
 * Localized word-match repair for Hören T2 options (008/011/012/015).
 * Freezes passages/audio; only rewrites listed correct options + aligned explanations.
 *
 *   node scripts/repair-horen-t2-wordmatch.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  hasLongLiteralOverlap,
  sharedContentTokens,
} from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality, formatHorenQualityReport } from './lib/horenBatchQuality.mjs';
import { findKeyExplanationMismatches } from './lib/keyExplanationGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { collapseIdenticalPassages } from './lib/normalizeBatch.mjs';
import { checkPassageContentTopic } from './lib/qualityGates/contentTopicCheck.mjs';

const GEN = 'batches/generated';

/** @type {Array<{ file: string, qid: string, letter: string, before: string, after: string, explAfter: string }>} */
const REPAIRS = [
  {
    file: 'horen-t2-gemini-008.json',
    qid: 'gen-q-h2-45959318-q5',
    letter: 'a',
    before: 'Sie ist eine angenehme Reise, die Energie für den Alltag liefert.',
    after: 'Sie gleicht einer angenehmen Reise und spendet Kraft für den Tag.',
    explAfter:
      'Am Ende des Vortrags wird eine ausgewogene Ernährung mit einer angenehmen Reise verglichen, die Kraft für den Tag spendet.',
  },
  {
    file: 'horen-t2-gemini-011.json',
    qid: 'gen-q-h2-5b8f9f1e-fzt-q3',
    letter: 'a',
    before: 'Ein Buch lesen oder einen Spaziergang unternehmen.',
    after: 'Zur Abwechslung lesen oder draußen spazieren gehen.',
    explAfter:
      'Der Sprecher empfiehlt als Alternative zum Bildschirm, zu lesen oder draußen spazieren zu gehen.',
  },
  {
    file: 'horen-t2-gemini-012.json',
    qid: 'gen-q-h2-d7e1a2b3-q1',
    letter: 'a',
    before: 'Sport ist ein wesentlicher Teil eines gesunden und glücklichen Lebens.',
    after: 'Sport spielt eine zentrale Rolle für Gesundheit und Lebensfreude.',
    explAfter:
      'Der Sprecher betont, dass Sport zentral für Gesundheit und Zufriedenheit ist.',
  },
  {
    file: 'horen-t2-gemini-012.json',
    qid: 'gen-q-h2-d7e1a2b3-q2',
    letter: 'b',
    before: 'Ein starker Körper, ein klarer Kopf und mehr Energie.',
    after: 'Körperliche Fitness, mentale Klarheit und zusätzliche Kraft.',
    explAfter:
      'Der Referent nennt Fitness, mentale Klarheit und zusätzliche Kraft als positive Effekte.',
  },
  {
    file: 'horen-t2-gemini-012.json',
    qid: 'gen-q-h2-d7e1a2b3-q4',
    letter: 'a',
    before: 'An den meisten Tagen der Woche etwa eine halbe Stunde moderate Bewegung.',
    after: 'Etwa 30 Minuten moderate Aktivität an möglichst vielen Wochentagen.',
    explAfter:
      'Der Referent empfiehlt rund eine halbe Stunde moderate Aktivität an möglichst vielen Wochentagen.',
  },
  {
    file: 'horen-t2-gemini-015.json',
    qid: 'gen-q-h2-3afcaed7-q3',
    letter: 'a',
    before: 'Öffentliche Verkehrsmittel nutzen oder Fahrrad fahren.',
    after: 'Bus und Bahn nehmen oder mit dem Rad unterwegs sein.',
    explAfter:
      'Der Referent nennt Bus, Bahn oder das Rad als umweltfreundliche Alternativen im Alltag.',
  },
];

function optionIndex(q, letter) {
  return (q.options || []).findIndex((o) =>
    String(o).toLowerCase().trim().startsWith(`${letter})`),
  );
}

function optionBody(opt) {
  return String(opt || '').replace(/^[a-d]\)\s*/i, '');
}

const byFile = new Map();
for (const r of REPAIRS) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file).push(r);
}

const applied = [];

for (const [file, repairs] of byFile) {
  const abs = path.join(GEN, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const body = batch.passages?.[0]?.text || '';

  for (const r of repairs) {
    const q = batch.questions.find((x) => x.id === r.qid);
    if (!q) throw new Error(`Missing ${r.qid} in ${file}`);
    const idx = optionIndex(q, r.letter);
    if (idx < 0) throw new Error(`No option ${r.letter} in ${r.qid}`);
    const current = optionBody(q.options[idx]);
    if (current !== r.before) {
      throw new Error(
        `Unexpected before-text in ${r.qid}:\n  expected: ${r.before}\n  actual:   ${current}`,
      );
    }

    // Pre-check new option
    const lit = hasLongLiteralOverlap(r.after, body, 4);
    if (lit) throw new Error(`New option still overlaps («${lit}») in ${r.qid}`);
    const shared = sharedContentTokens(q.question, r.after);
    if (shared.length >= 3) {
      throw new Error(`New option shares ≥3 tokens with question in ${r.qid}: ${shared}`);
    }

    q.options[idx] = `${r.letter}) ${r.after}`;
    q.explanation = r.explAfter;
    applied.push({ file, qid: r.qid, letter: r.letter, before: r.before, after: r.after });
  }

  fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(`Wrote ${file} (${repairs.length} option(s))`);
}

console.log('\n=== Applied repairs ===');
for (const a of applied) {
  console.log(`\n${a.file} ${a.qid} (${a.letter})`);
  console.log(`  BEFORE: ${a.before}`);
  console.log(`  AFTER:  ${a.after}`);
}

// Verification
console.log('\n=== Verification ===');
const files = [...byFile.keys()];
const cleanFiles = [
  'horen-t2-gemini-005.json',
  'horen-t2-gemini-007.json',
  'horen-t2-gemini-010.json',
  ...files,
];

let allOk = true;
for (const file of cleanFiles.sort()) {
  const abs = path.join(GEN, file);
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const body = batch.passages?.[0]?.text || '';

  // Overlap on all correct options
  const overlaps = [];
  for (const q of batch.questions || []) {
    const letter = String(q.correctAnswer || q.correct || '')
      .toLowerCase()
      .replace(/[^a-d]/g, '');
    const opt = (q.options || []).find((o) =>
      String(o).toLowerCase().trim().startsWith(`${letter})`),
    );
    const text = optionBody(opt);
    const lit = hasLongLiteralOverlap(text, body, 4);
    if (lit) overlaps.push(`${q.id}: «${lit}»`);
    const qLit = hasLongLiteralOverlap(q.question, body, 4);
    if (qLit) overlaps.push(`${q.id} question: «${qLit}»`);
  }

  const quality = checkHorenBatchQuality(batch, 2);
  const chk18b = findKeyExplanationMismatches(batch);

  const collapsed = collapseIdenticalPassages(structuredClone(batch));
  const collapseRemoved = (batch.passages?.length || 0) - (collapsed.passages?.length || 0);
  batch = collapsed;
  const caps = applyGermanCapsNormalize(batch, { decapOnly: true });
  if (caps.stats.decapFixed || caps.stats.markdownFixed || collapseRemoved) {
    fs.writeFileSync(abs, `${JSON.stringify(caps.batch, null, 2)}\n`);
  }
  const topic = [];
  for (const p of (caps.batch || batch).passages || []) {
    const c = checkPassageContentTopic(p);
    if (c.mismatch) topic.push(c.detail);
  }

  const repaired = files.includes(file);
  console.log(`\n${file}${repaired ? ' [repaired]' : ' [control]'}`);
  console.log(`  overlap≥4: ${overlaps.length ? overlaps.join(' | ') : 'NONE'}`);
  console.log(`  ${formatHorenQualityReport(quality, 2).split('\n')[0]}`);
  if (!quality.ok) {
    console.log(quality.issues.map((i) => `    - ${i}`).join('\n'));
    allOk = false;
  }
  console.log(`  CHK-18b mismatches: ${chk18b.length ? chk18b.map((h) => h.message).join(' | ') : 'NONE'}`);
  if (chk18b.length) allOk = false;
  console.log(`  collapse extras: ${collapseRemoved}; caps dirty: ${!!(caps.stats.decapFixed || caps.stats.markdownFixed)}; topic_mismatch: ${topic.length}`);
  if (overlaps.length || topic.length) allOk = false;
}

console.log(`\n=== FINAL: ${allOk ? 'ALL 7 CLOSED' : 'STILL OPEN'} ===`);
process.exit(allOk ? 0 : 1);
