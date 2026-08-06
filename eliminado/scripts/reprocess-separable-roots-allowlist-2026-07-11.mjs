#!/usr/bin/env node
/**
 * Reprocess pool-verified vocabularyTags after separable roots-from-allowlist
 * (VOCAB_TAGS_NORMALIZE_VERSION v2.3.7).
 *
 * Only overwrites per-question vocabularyTags when extraction differs.
 * Does not touch question/options/explanation/correct/grammarTags/topicTags.
 *
 *   node scripts/reprocess-separable-roots-allowlist-2026-07-11.mjs
 *   node scripts/reprocess-separable-roots-allowlist-2026-07-11.mjs --dry-run
 *   node scripts/reprocess-separable-roots-allowlist-2026-07-11.mjs --scan-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractVocabularyFromText,
  questionSpecificVocabBlob,
  ensureDistinctQuestionVocabTags,
  VOCAB_TAGS_NORMALIZE_VERSION,
  SEPARABLE_INFINITIVES,
  separableRootsFromAllowlist,
} from './lib/enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/separable-roots-allowlist-reprocess-2026-07-11.json',
);
const CHANGES_LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/separable-roots-allowlist-reprocess-2026-07-11.changes.json',
);
const dryRun = process.argv.includes('--dry-run');
const scanOnly = process.argv.includes('--scan-only');

const ORPHAN_ROOTS = ['bereiten', 'denken', 'fahren', 'fragen', 'gehen', 'schlagen', 'finden', 'kündigen'];
const ORPHAN_FULLS = {
  bereiten: ['zubereiten', 'vorbereiten'],
  denken: ['nachdenken'],
  fahren: ['losfahren'],
  fragen: ['nachfragen'],
  gehen: ['weggehen', 'weitergehen'],
  schlagen: ['vorschlagen'],
  finden: ['stattfinden'],
  kündigen: ['ankündigen'],
};

function tagsEqual(a, b) {
  const aa = (a || []).map(String);
  const bb = (b || []).map(String);
  if (aa.length !== bb.length) return false;
  return aa.every((t, i) => t === bb[i]);
}

function reextractQuestionVocab(q, passage) {
  const vocabBlob = questionSpecificVocabBlob(q, passage);
  let words = extractVocabularyFromText(vocabBlob, 6);
  if (words.length < 3) {
    words = extractVocabularyFromText(
      [q.question, q.explanation, passage?.title].filter(Boolean).join(' '),
      6,
    );
  }
  if (words.length < 2 && passage?.text) {
    words = extractVocabularyFromText(`${vocabBlob} ${passage.text}`, 6);
  }
  if (!words.length) {
    words = extractVocabularyFromText(
      [q.question, q.explanation].filter(Boolean).join(' '),
      4,
    );
  }
  return words.length ? words.slice(0, 6) : ['Alltag', 'Mensch', 'Zeit'];
}

function unitText(q, passage) {
  // Question-local only — do not use full passage (other sentences can FP the scan).
  return questionSpecificVocabBlob(q, passage);
}

/** Broken patterns from diagnosis: bare root tag while split full is in text. */
function brokenPatternsInQuestion(q, passage) {
  const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
  const text = unitText(q, passage);
  const hits = [];

  // schlagen while schlägt…vor present and no vorschlagen
  if (
    tags.includes('schlagen') &&
    !tags.includes('vorschlagen') &&
    /\bschlägt\b[\s\S]{0,80}\bvor\b|\bschlagen\b[\s\S]{0,80}\bvor\b/i.test(text)
  ) {
    hits.push('schlagen←vorschlagen');
  }

  // finden while findet/finden…statt and no stattfinden
  if (
    tags.includes('finden') &&
    !tags.includes('stattfinden') &&
    /\bfind(?:et|en|est)?\b[\s\S]{0,80}\bstatt\b/i.test(text)
  ) {
    hits.push('finden←stattfinden');
  }

  // kündigen while kündigt…an and no ankündigen
  if (
    tags.includes('kündigen') &&
    !tags.includes('ankündigen') &&
    /\bkündigt\b[\s\S]{0,80}\ban\b|\bkündigen\b[\s\S]{0,80}\ban\b/i.test(text)
  ) {
    hits.push('kündigen←ankündigen');
  }

  return hits;
}

function orphanGains(before, after) {
  const b = new Set((before || []).map((t) => String(t).toLowerCase()));
  const a = (after || []).map((t) => String(t).toLowerCase());
  const gained = [];
  for (const [root, fulls] of Object.entries(ORPHAN_FULLS)) {
    for (const full of fulls) {
      if (!b.has(full) && a.includes(full)) {
        gained.push({ root, full });
      }
    }
  }
  return gained;
}

const stampAt = new Date().toISOString();
const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();
const report = {
  generatedAt: stampAt,
  dryRun,
  scanOnly,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  filesScanned: files.length,
  derivedRoots: [...separableRootsFromAllowlist()].sort(),
  questionsChanged: 0,
  filesModified: [],
  changes: [],
  orphanRootGains: [],
  brokenBefore: [],
  brokenAfter: [],
};

console.log(`Scanning ${files.length} files · version ${VOCAB_TAGS_NORMALIZE_VERSION} · dryRun=${dryRun} scanOnly=${scanOnly}`);
console.log('Derived roots:', report.derivedRoots.join(', '));

for (const file of files) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (batch.questions || []).map((q) => ({
    id: q.id,
    tags: [...(q.vocabularyTags || [])],
  }));

  for (const q of batch.questions || []) {
    const broken = brokenPatternsInQuestion(q, passagesById.get(q.passageId));
    if (broken.length) {
      report.brokenBefore.push({ file, qid: q.id, broken, tags: q.vocabularyTags });
    }
  }

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    const passage = passagesById.get(q.passageId);
    q.vocabularyTags = reextractQuestionVocab(q, passage);
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const qChanges = [];
  for (let i = 0; i < questions.length; i++) {
    const oldTags = beforeByQ[i].tags;
    const newTags = [...(questions[i].vocabularyTags || [])];
    if (!tagsEqual(oldTags, newTags)) {
      const orphans = orphanGains(oldTags, newTags);
      qChanges.push({
        file,
        qid: questions[i].id,
        before: oldTags,
        after: newTags,
        orphanGains: orphans,
      });
      if (orphans.length) {
        report.orphanRootGains.push({
          file,
          qid: questions[i].id,
          orphans,
          before: oldTags,
          after: newTags,
        });
      }
    } else {
      // keep original reference / exact tags if unchanged
      questions[i].vocabularyTags = batch.questions[i].vocabularyTags;
    }
  }

  if (!qChanges.length) continue;

  report.questionsChanged += qChanges.length;
  report.filesModified.push(file);
  report.changes.push(...qChanges);

  if (scanOnly || dryRun) continue;

  const out = { ...batch, questions };
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._separableRootsAllowlistReprocessedAt = stampAt;
  fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
}

// Final broken-pattern scan (on disk if we wrote; else on projected after-tags)
if (!scanOnly && !dryRun) {
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
    for (const q of batch.questions || []) {
      const broken = brokenPatternsInQuestion(q, passagesById.get(q.passageId));
      if (broken.length) {
        report.brokenAfter.push({ file, qid: q.id, broken, tags: q.vocabularyTags });
      }
    }
  }
} else {
  // Simulate after-state from changes map
  const afterMap = new Map(report.changes.map((c) => [`${c.file}|${c.qid}`, c.after]));
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
    const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
    for (const q of batch.questions || []) {
      const key = `${file}|${q.id}`;
      const projected = { ...q, vocabularyTags: afterMap.get(key) || q.vocabularyTags };
      const broken = brokenPatternsInQuestion(projected, passagesById.get(q.passageId));
      if (broken.length) {
        report.brokenAfter.push({ file, qid: q.id, broken, tags: projected.vocabularyTags });
      }
    }
  }
}

fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  CHANGES_LOG,
  `${JSON.stringify(
    {
      generatedAt: report.generatedAt,
      version: report.version,
      filesModified: report.filesModified,
      questionsChanged: report.questionsChanged,
      changes: report.changes,
      orphanRootGains: report.orphanRootGains,
    },
    null,
    2,
  )}\n`,
);

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({
  filesScanned: report.filesScanned,
  filesModified: report.filesModified.length,
  questionsChanged: report.questionsChanged,
  brokenBefore: report.brokenBefore.length,
  brokenAfter: report.brokenAfter.length,
  orphanRootGainEvents: report.orphanRootGains.length,
}, null, 2));

console.log('\n=== FILES MODIFIED ===');
for (const f of report.filesModified) console.log(f);

console.log('\n=== ALL TAG CHANGES ===');
for (const c of report.changes) {
  console.log(`${c.file} | ${c.qid}`);
  console.log(`  before: ${JSON.stringify(c.before)}`);
  console.log(`  after:  ${JSON.stringify(c.after)}`);
  if (c.orphanGains?.length) console.log(`  orphanGains: ${JSON.stringify(c.orphanGains)}`);
}

console.log('\n=== ORPHAN ROOT GAINS (bereiten/denken/fahren/fragen/gehen/schlagen/finden/kündigen) ===');
if (!report.orphanRootGains.length) console.log('(none)');
for (const o of report.orphanRootGains) {
  console.log(`${o.file} | ${o.qid} | ${JSON.stringify(o.orphans)}`);
}

console.log('\n=== BROKEN BEFORE ===', report.brokenBefore.length);
for (const b of report.brokenBefore) console.log(b.file, b.qid, b.broken);

console.log('\n=== BROKEN AFTER ===', report.brokenAfter.length);
for (const b of report.brokenAfter) console.log(b.file, b.qid, b.broken);

console.log('\nreport →', LOG);
console.log('changes →', CHANGES_LOG);
if (report.brokenAfter.length) process.exitCode = 1;
