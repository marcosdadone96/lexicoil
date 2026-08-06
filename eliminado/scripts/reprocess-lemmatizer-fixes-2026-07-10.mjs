/**
 * Reprocess vocabularyTags on pool-verified files hit by lemmatizer bugs
 * (ge- lexical, false zumachen, -sst/-ßt) after VOCAB_TAGS_NORMALIZE_VERSION v2.3.3.
 *
 * Only overwrites per-question vocabularyTags when the new extraction differs.
 * Does not touch question/options/explanation/correct/grammarTags/topicTags.
 *
 *   node scripts/reprocess-lemmatizer-fixes-2026-07-10.mjs
 *   node scripts/reprocess-lemmatizer-fixes-2026-07-10.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractVocabularyFromText,
  questionSpecificVocabBlob,
  ensureDistinctQuestionVocabTags,
  VOCAB_TAGS_NORMALIZE_VERSION,
} from './lib/enrichBatchMetadata.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const dryRun = process.argv.includes('--dry-run');

const BROKEN = [
  'zumachen',
  'bewusen',
  'selbstbewusen',
  'verantwortungsbewusen',
  'vergisen',
  'vermisen',
  'beeinflusen',
  'befasen',
  'währleisten',
  'fährden',
  'nießen',
];

/** Unique files from 6c + ge-/zumachen inventories (26). */
const TARGET_FILES = [
  'horen-t2-gemini-003.json',
  'horen-t2-gemini-005.json',
  'horen-t2-gemini-010.json',
  'horen-t2-gemini-011.json',
  'horen-t2-gemini-012.json',
  'horen-t2-gemini-013.json',
  'horen-t2-gemini-016.json',
  'horen-t2-gemini-019.json',
  'horen-t2-gemini-020.json',
  'horen-t3-gemini-004.json',
  'horen-t4-gemini-010.json',
  'horen-t4-gemini-011.json',
  'horen-t4-gemini-012.json',
  'horen-t4-gemini-013.json',
  'lesen-t1-gemini-075.json',
  'lesen-t1-gemini-081.json',
  'lesen-t1-gemini-117.json',
  'lesen-t1-gemini-126.json',
  'lesen-t1-gemini-135.json',
  'lesen-t1-gemini-138.json',
  'lesen-t1-gemini-144.json',
  'lesen-t1-gemini-165.json',
  'lesen-t1-gemini-179.json',
  'lesen-t2-gemini-097.json',
  'schreiben-gemini-004.json',
  'sprechen-gemini-001.json',
];

function tagsEqual(a, b) {
  const aa = (a || []).map(String);
  const bb = (b || []).map(String);
  if (aa.length !== bb.length) return false;
  return aa.every((t, i) => t === bb[i]);
}

function brokenIn(tags) {
  return (tags || []).filter((t) => BROKEN.includes(String(t).toLowerCase()));
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

const stampAt = new Date().toISOString();
const report = {
  generatedAt: stampAt,
  dryRun,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  targetCount: TARGET_FILES.length,
  modified: [],
  stampedOnly: [],
  perFile: [],
};

for (const file of TARGET_FILES) {
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) {
    report.perFile.push({ file, error: 'MISSING' });
    continue;
  }

  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (batch.questions || []).map((q) => ({
    id: q.id,
    tags: [...(q.vocabularyTags || [])],
    broken: brokenIn(q.vocabularyTags),
  }));

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    const passage = passagesById.get(q.passageId);
    q.vocabularyTags = reextractQuestionVocab(q, passage);
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const qChanges = [];
  let anyVocabChange = false;
  for (let i = 0; i < questions.length; i++) {
    const oldTags = beforeByQ[i].tags;
    const newTags = [...(questions[i].vocabularyTags || [])];
    if (!tagsEqual(oldTags, newTags)) {
      anyVocabChange = true;
      qChanges.push({
        id: questions[i].id,
        before: oldTags,
        after: newTags,
        brokenBefore: beforeByQ[i].broken,
        brokenAfter: brokenIn(newTags),
      });
    } else {
      questions[i].vocabularyTags = batch.questions[i].vocabularyTags;
    }
  }

  const out = { ...batch, questions };
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._lemmatizerFixReprocessedAt = stampAt;

  report.perFile.push({
    file,
    questionsChanged: qChanges.length,
    qChanges,
    stamps: {
      _vocabTagsNormalizeVersion: out._vocabTagsNormalizeVersion,
      _lemmatizerFixReprocessedAt: out._lemmatizerFixReprocessedAt,
    },
  });

  if (anyVocabChange) report.modified.push(file);
  else report.stampedOnly.push(file);

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
  }
}

const allFiles = fs.readdirSync(POOL).filter((f) => f.endsWith('.json'));
const remaining = [];
function deepTags(obj, file, acc) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((x) => deepTags(x, file, acc));
    return;
  }
  if (Array.isArray(obj.vocabularyTags)) {
    for (const t of obj.vocabularyTags) {
      const low = String(t).toLowerCase();
      if (BROKEN.includes(low)) acc.push({ file, tag: String(t) });
    }
  }
  for (const v of Object.values(obj)) deepTags(v, file, acc);
}
for (const f of allFiles) {
  if (dryRun && TARGET_FILES.includes(f)) {
    // In dry-run, simulate scan on in-memory result for targets; skip disk for those
    continue;
  }
  deepTags(JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8')), f, remaining);
}

// For dry-run final scan of targets, use report after-tags
if (dryRun) {
  for (const pf of report.perFile) {
    if (pf.error) continue;
    const batch = JSON.parse(fs.readFileSync(path.join(POOL, pf.file), 'utf8'));
    for (let i = 0; i < (batch.questions || []).length; i++) {
      const change = (pf.qChanges || []).find((c) => c.id === batch.questions[i].id);
      const tags = change ? change.after : batch.questions[i].vocabularyTags || [];
      for (const t of tags) {
        if (BROKEN.includes(String(t).toLowerCase())) {
          remaining.push({ file: pf.file, tag: String(t), note: 'dry-run-sim' });
        }
      }
    }
  }
  for (const f of allFiles) {
    if (TARGET_FILES.includes(f)) continue;
    deepTags(JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8')), f, remaining);
  }
}

report.finalScan = {
  filesScanned: allFiles.length,
  brokenHits: remaining.length,
  remaining,
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/lemmatizer-fix-reprocess-2026-07-10.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      dryRun,
      version: VOCAB_TAGS_NORMALIZE_VERSION,
      targets: TARGET_FILES.length,
      modified: report.modified.length,
      stampedOnly: report.stampedOnly.length,
      finalBrokenHits: remaining.length,
      remaining,
      report: outPath,
    },
    null,
    2,
  ),
);

console.log('\n=== BEFORE/AFTER (questions with broken tags) ===');
for (const pf of report.perFile) {
  if (pf.error) {
    console.log(pf.file, pf.error);
    continue;
  }
  const relevant = (pf.qChanges || []).filter((c) => c.brokenBefore.length);
  if (!relevant.length) continue;
  console.log(`\n## ${pf.file}`);
  for (const c of relevant) {
    console.log(`  q=${c.id}`);
    console.log(`  before: ${JSON.stringify(c.before)}`);
    console.log(`  after:  ${JSON.stringify(c.after)}`);
    console.log(
      `  brokenBefore=${JSON.stringify(c.brokenBefore)} brokenAfter=${JSON.stringify(c.brokenAfter)}`,
    );
  }
}
