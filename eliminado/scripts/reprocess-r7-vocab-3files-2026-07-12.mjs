#!/usr/bin/env node
/**
 * Surgical R7 vocab reprocess: only the 3 files with explanation-only meta residue.
 * Touches vocabularyTags + version stamp only. Does NOT rewrite the full pool (148).
 *
 *   node scripts/reprocess-r7-vocab-3files-2026-07-12.mjs
 *   node scripts/reprocess-r7-vocab-3files-2026-07-12.mjs --dry-run
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const dryRun = process.argv.includes('--dry-run');

const TARGET_FILES = [
  'horen-t3-gemini-008.json',
  'horen-t3-gemini-009.json',
  'lesen-t1-gemini-177.json',
];

const META = new Set([
  'bedeutet',
  'bedeuten',
  'zeigt',
  'zeigen',
  'widerspricht',
  'widersprechen',
  'entspricht',
  'entsprechen',
]);

function tagsEqual(a, b) {
  const sa = [...(a || [])].map(String).sort().join('\0');
  const sb = [...(b || [])].map(String).sort().join('\0');
  return sa === sb;
}

function metaIn(tags) {
  return (tags || []).filter((t) => META.has(String(t).toLowerCase()));
}

function reextractQuestionVocab(q, passage) {
  let words = extractVocabularyFromText(questionSpecificVocabBlob(q, passage), 6);
  if (words.length < 3) {
    words = extractVocabularyFromText(
      [q.question, q.signText, q.transcript, q.statement, passage?.title]
        .filter(Boolean)
        .join(' '),
      6,
    );
  }
  if (words.length < 2 && passage?.text) {
    words = extractVocabularyFromText(
      `${questionSpecificVocabBlob(q, passage)} ${passage.text}`,
      6,
    );
  }
  return words.length ? words.slice(0, 6) : ['Alltag', 'Mensch', 'Zeit'];
}

const stampAt = new Date().toISOString();
const report = {
  generatedAt: stampAt,
  dryRun,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  scope: 'surgical-3-files-R7-no-explanation',
  backlogNote:
    'Full pool forceVocab reprocess (148 files) remains BACKLOG — bundle with the next real reason to touch the whole pool; do not run as a standalone pass.',
  targetFiles: TARGET_FILES,
  perFile: [],
  postScanResidue: [],
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
    meta: metaIn(q.vocabularyTags),
  }));

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    q.vocabularyTags = reextractQuestionVocab(q, passagesById.get(q.passageId));
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const affected = [];
  const allChanges = [];
  for (let i = 0; i < questions.length; i++) {
    const oldTags = beforeByQ[i].tags;
    const newTags = [...(questions[i].vocabularyTags || [])];
    const entry = {
      id: questions[i].id,
      question: String(questions[i].question || '').slice(0, 100),
      before: oldTags,
      after: newTags,
      metaBefore: beforeByQ[i].meta,
      metaAfter: metaIn(newTags),
    };
    if (beforeByQ[i].meta.length) affected.push(entry);
    if (!tagsEqual(oldTags, newTags)) {
      allChanges.push(entry);
    } else {
      // keep original array reference/content when identical
      questions[i].vocabularyTags = batch.questions[i].vocabularyTags;
    }
  }

  const out = { ...batch, questions };
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._r7VocabNoExplanationReprocessedAt = stampAt;
  out._r7VocabNoExplanationNote =
    'Surgical R7: vocabularyTags re-extracted without explanation field (v2.3.10).';

  report.perFile.push({
    file,
    affectedQuestions: affected.length,
    questionsChanged: allChanges.length,
    affected,
    stamps: {
      _vocabTagsNormalizeVersion: out._vocabTagsNormalizeVersion,
      _r7VocabNoExplanationReprocessedAt: out._r7VocabNoExplanationReprocessedAt,
    },
  });

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
  }
}

// Post-scan residue on the 3 files
for (const file of TARGET_FILES) {
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) continue;
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const q of batch.questions || []) {
    const meta = metaIn(q.vocabularyTags);
    if (meta.length) {
      report.postScanResidue.push({ file, id: q.id, meta, tags: q.vocabularyTags });
    }
  }
}

report.residueCount = report.postScanResidue.length;
report.ok = report.residueCount === 0 && report.perFile.every((p) => !p.error);

const logPath = path.join(ROOT, 'batches/ready/gate-logs/r7-vocab-3files-reprocess-2026-07-12.json');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);

const backlogPath = path.join(
  ROOT,
  'batches/ready/gate-logs/BACKLOG-full-pool-vocab-reprocess-R7-2026-07-12.md',
);
fs.writeFileSync(
  backlogPath,
  `# BACKLOG — full-pool vocabularyTags reprocess (R7 / v2.3.10)

**Status:** pending (do not run standalone)

**Done surgically (2026-07-12):** only the 3 files with genuine explanation-only meta residue:
- \`horen-t3-gemini-008.json\`
- \`horen-t3-gemini-009.json\`
- \`lesen-t1-gemini-177.json\`

**Still pending:** force-reprocess of the remaining pool (~145 files; 148 total) under \`VOCAB_TAGS_NORMALIZE_VERSION = v2.3.10-no-explanation-2026-07-12\`.

**Why not now:** excluding \`explanation\` from the vocab blob can reshuffle tag ranking even when there is no meta residue. Touching all 148 without another reason creates noise and conflicts with other pool work.

**When to run:** bundle with the next *real* reason to rewrite pool-wide \`vocabularyTags\` (e.g. another lemmatizer/caps vocab version bump). Do **not** schedule a dedicated “R7 full pool” pass by itself.

**Evidence of surgical pass:** \`batches/ready/gate-logs/r7-vocab-3files-reprocess-2026-07-12.json\`
`,
);

console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, logPath)}`);
console.log(`Wrote ${path.relative(ROOT, backlogPath)}`);
if (!report.ok) process.exit(1);
