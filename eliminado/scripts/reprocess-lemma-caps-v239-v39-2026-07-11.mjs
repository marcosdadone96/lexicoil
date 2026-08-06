#!/usr/bin/env node
/**
 * Reprocess vocab (v2.3.9) + caps (v3.9) over pool-verified + canary staging + mirror.
 * Only writes files that actually change (or need version stamp bump).
 * Does NOT promote canary → pool-verified.
 *
 *   node scripts/reprocess-lemma-caps-v239-v39-2026-07-11.mjs
 *   node scripts/reprocess-lemma-caps-v239-v39-2026-07-11.mjs --dry-run
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
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/lemma-caps-v239-v39-reprocess-2026-07-11.json',
);
const dryRun = process.argv.includes('--dry-run');

const DIRS = [
  'pool-verified',
  'lesen-t4-staging-2026-07-11-canary',
  'lesen-t5-staging-2026-07-11-canary',
  'horen-t3-staging-2026-07-11-canary',
  'canary-all-staging-2026-07-11',
];

const SURGICAL = new Map([
  ['robuen', 'robust'],
  ['mindesten', 'mindestens'],
  ['hinterlässen', 'hinterlassen'],
  ['läsen', 'lassen'],
  ['laesen', 'lassen'],
  // Preserve prior hyphen-compound fixes (re-extract can re-truncate)
  ['yoga-kur', 'yoga-kurs'],
  ['streaming-dien', 'streaming-dienst'],
  ['vier-tage-woch', 'vier-tage-woche'],
  ['samstagvormittag-kur', 'samstagvormittag-kurs'],
  ['repair-caf', 'repair-cafe'],
  ['drahtesel-hilf', 'drahtesel-hilfe'],
  ['recycling-syst', 'recycling-system'],
  ['online-buchungssyst', 'online-buchungssystem'],
  ['spanisch-nachhilf', 'spanisch-nachhilfe'],
  ['mathe-nachhilf', 'mathe-nachhilfe'],
  ['physik-nachhilf', 'physik-nachhilfe'],
  ['bwl-nachhilf', 'bwl-nachhilfe'],
  ['jura-nachhilf', 'jura-nachhilfe'],
  ['deutsch-nachhilf', 'deutsch-nachhilfe'],
  ['rechnungswesen-nachhilf', 'rechnungswesen-nachhilfe'],
]);

function surgicalFixTag(tag) {
  const s = String(tag);
  const low = s.toLowerCase();
  if (SURGICAL.has(low)) return SURGICAL.get(low);
  if (/-nachhilf$/i.test(low)) return `${low}e`;
  return s;
}

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
  return (words.length ? words.slice(0, 6) : ['Alltag', 'Mensch', 'Zeit']).map(surgicalFixTag);
}

function listFiles() {
  const out = [];
  for (const dir of DIRS) {
    const abs = path.join(READY, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.json')).sort()) {
      out.push({ dir, file: f, abs: path.join(abs, f) });
    }
  }
  return out;
}

const stampAt = new Date().toISOString();
const files = listFiles();
const report = {
  generatedAt: stampAt,
  dryRun,
  versions: {
    vocab: VOCAB_TAGS_NORMALIZE_VERSION,
    caps: GERMAN_CAPS_NORMALIZE_VERSION,
  },
  filesScanned: files.length,
  filesChanged: [],
  stampOnly: [],
  vocabTagChanges: 0,
  capsTextChanges: 0,
  details: {},
};

console.log(
  `Lemma+caps reprocess · ${files.length} files · ${VOCAB_TAGS_NORMALIZE_VERSION} / ${GERMAN_CAPS_NORMALIZE_VERSION} · dryRun=${dryRun}`,
);

for (const { dir, file, abs } of files) {
  const raw = fs.readFileSync(abs, 'utf8');
  const batch = JSON.parse(raw);
  const beforeVocabVer = batch._vocabTagsNormalizeVersion || null;
  const beforeCapsVer = batch._germanCapsNormalizeVersion || null;

  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (batch.questions || []).map((q) => ({
    id: q.id,
    tags: [...(q.vocabularyTags || [])],
  }));
  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    q.vocabularyTags = reextractQuestionVocab(q, passagesById.get(q.passageId));
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );
  for (const q of questions) {
    q.vocabularyTags = (q.vocabularyTags || []).map(surgicalFixTag);
  }

  const vocabChanges = [];
  for (let i = 0; i < questions.length; i++) {
    if (!tagsEqual(beforeByQ[i].tags, questions[i].vocabularyTags)) {
      vocabChanges.push({
        qid: questions[i].id,
        before: beforeByQ[i].tags,
        after: [...questions[i].vocabularyTags],
      });
    }
  }

  let next = {
    ...batch,
    questions,
    _vocabTagsNormalizeVersion: VOCAB_TAGS_NORMALIZE_VERSION,
    _vocabTagsNormalizedAt: stampAt,
  };

  const { batch: capped, stats, changes: capsChanges } = applyGermanCapsNormalize(
    structuredClone(next),
  );
  next = stampGermanCapsVersion(capped);
  next._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  next._vocabTagsNormalizedAt = stampAt;

  const nextJson = `${JSON.stringify(next, null, 2)}\n`;
  const contentChanged = nextJson !== raw;
  const vocabStampBump = beforeVocabVer !== VOCAB_TAGS_NORMALIZE_VERSION;
  const capsStampBump = beforeCapsVer !== GERMAN_CAPS_NORMALIZE_VERSION;
  const capsFixed =
    (stats?.markdownFixed || 0) + (stats?.decapFixed || 0) + (stats?.capFixed || 0);

  if (contentChanged || vocabStampBump || capsStampBump) {
    report.details[`${dir}/${file}`] = {
      vocabTagDiffs: vocabChanges.length,
      vocabSamples: vocabChanges.slice(0, 4),
      capsFixed,
      capsSamples: (capsChanges || [])
        .filter((c) => c.before != null)
        .slice(0, 4)
        .map((c) => ({ before: c.before, after: c.after, field: c.field || c.path })),
      contentChanged,
      stampOnly: !contentChanged,
    };
    report.vocabTagChanges += vocabChanges.length;
    if (capsFixed > 0) report.capsTextChanges += 1;
    if (contentChanged) report.filesChanged.push(`${dir}/${file}`);
    else report.stampOnly.push(`${dir}/${file}`);

    if (!dryRun) fs.writeFileSync(abs, nextJson);
  }
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nContent changed: ${report.filesChanged.length}`);
console.log(`Stamp only: ${report.stampOnly.length}`);
console.log(`Vocab tag diffs: ${report.vocabTagChanges}`);
console.log(`Files with caps text changes: ${report.capsTextChanges}`);
console.log(`Log: ${LOG}`);
