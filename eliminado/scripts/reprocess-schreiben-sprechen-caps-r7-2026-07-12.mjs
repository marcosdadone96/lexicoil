#!/usr/bin/env node
/**
 * Apply caps v3.13 (viel* inflections) + typo fix + R7 vocab to Schreiben/Sprechen (11 files).
 *
 *   node scripts/reprocess-schreiben-sprechen-caps-r7-2026-07-12.mjs
 *   node scripts/reprocess-schreiben-sprechen-caps-r7-2026-07-12.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
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
  'schreiben-gemini-004.json',
  'schreiben-gemini-005.json',
  'schreiben-gemini-006.json',
  'schreiben-gemini-007.json',
  'schreiben-gemini-009.json',
  'schreiben-gemini-010.json',
  'sprechen-gemini-001.json',
  'sprechen-gemini-005.json',
  'sprechen-gemini-006.json',
  'sprechen-gemini-007.json',
  'sprechen-gemini-008.json',
];

/** Rubric / evaluator meta that must not appear as vocabularyTags after R7.
 * Wortschatz/Grammatik/Aussprache can be legitimate task content (e.g. «Übung der Aussprache»,
 * «erweitert den Wortschatz») — only flag when they survive as pure exam-meta labels.
 * Pure-meta labels always blocked: */
const RUBRIC_META_ALWAYS = new Set([
  'argumentationsfähigkeit',
  'präzision',
  'klarheit',
  'wortschatzreichtum',
  'beispielfragen',
  'beispielfrage',
  'fluency',
  'flüssigkeit',
  'kohärenz',
  'erfüllung',
  'strukturen',
  'prosodie',
]);

/** Soft meta — flag only if co-occurring with other rubric labels in the same tag set
 * (explanation bleed). Lone «Wortschatz» about language-learning content is OK. */
const RUBRIC_META_SOFT = new Set(['wortschatz', 'grammatik', 'aussprache']);

function rubricMetaIn(tags) {
  const list = (tags || []).map(String);
  const low = list.map((t) => t.toLowerCase());
  const hard = list.filter((t) => RUBRIC_META_ALWAYS.has(t.toLowerCase()));
  const softHits = list.filter((t) => RUBRIC_META_SOFT.has(t.toLowerCase()));
  // Soft words count as residue only when ≥2 soft/hard meta tags share the set
  // (classic explanation-rubric bleed: Wortschatz+Grammatik together)
  const softAsResidue =
    softHits.length >= 2 || (softHits.length >= 1 && hard.length >= 1)
      ? softHits
      : [];
  return [...new Set([...hard, ...softAsResidue])];
}

function tagsEqual(a, b) {
  const sa = [...(a || [])].map(String).sort().join('\0');
  const sb = [...(b || [])].map(String).sort().join('\0');
  return sa === sb;
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
  capsVersion: GERMAN_CAPS_NORMALIZE_VERSION,
  vocabVersion: VOCAB_TAGS_NORMALIZE_VERSION,
  scope: 'schreiben+sprechen-11-files-caps-v313+R7',
  typoFixes: [],
  capsFixes: [],
  perFile: [],
  questionsChanged: 0,
  questionsTotal: 0,
  postScanRubricResidue: [],
};

for (const file of TARGET_FILES) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

  // ── Typo: anzuziechen → anzuziehen (sprechen-006) ────────────────────────
  if (file === 'sprechen-gemini-006.json') {
    for (const q of batch.questions || []) {
      for (const key of ['question', 'explanation', 'statement']) {
        const before = String(q[key] || '');
        if (!before.includes('anzuziechen')) continue;
        const after = before.replaceAll('anzuziechen', 'anzuziehen');
        q[key] = after;
        report.typoFixes.push({
          file,
          id: q.id,
          field: key,
          from: 'anzuziechen',
          to: 'anzuziehen',
        });
      }
    }
  }

  // ── Caps normalize (picks up Die Vielen → vielen) ─────────────────────────
  const { batch: capped, stats, changes } = applyGermanCapsNormalize(batch, { quiet: true });
  if (changes?.length) {
    report.capsFixes.push({
      file,
      stats,
      samples: changes.slice(0, 20).map((c) => ({
        path: c.path || c.field,
        from: c.from || c.before,
        to: c.to || c.after,
      })),
    });
  }

  // ── R7 vocab re-extract (no explanation in blob) ─────────────────────────
  const passagesById = new Map((capped.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (capped.questions || []).map((q) => ({
    id: q.id,
    teil: q.teil,
    tags: [...(q.vocabularyTags || [])],
    meta: rubricMetaIn(q.vocabularyTags),
  }));

  const questions = (capped.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    q.vocabularyTags = reextractQuestionVocab(q, passagesById.get(q.passageId));
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const allChanges = [];
  for (let i = 0; i < questions.length; i++) {
    report.questionsTotal += 1;
    const oldTags = beforeByQ[i].tags;
    const newTags = [...(questions[i].vocabularyTags || [])];
    if (!tagsEqual(oldTags, newTags)) {
      report.questionsChanged += 1;
      allChanges.push({
        id: questions[i].id,
        teil: questions[i].teil,
        before: oldTags,
        after: newTags,
        metaBefore: beforeByQ[i].meta,
        metaAfter: rubricMetaIn(newTags),
      });
    } else {
      questions[i].vocabularyTags = capped.questions[i].vocabularyTags;
    }
  }

  const out = { ...capped, questions };
  out._germanCapsNormalizeVersion = GERMAN_CAPS_NORMALIZE_VERSION;
  out._germanCapsNormalizedAt = stampAt;
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._vocabTagsNormalizedAt = stampAt;
  out._r7VocabNoExplanationReprocessedAt = stampAt;
  out._r7VocabNoExplanationNote =
    'Surgical R7 (Schreiben/Sprechen 11): vocabularyTags re-extracted without explanation (same criterion as Lesen R7).';

  report.perFile.push({
    file,
    questionsChanged: allChanges.length,
    changes: allChanges,
    capsChangeCount: changes?.length || 0,
  });

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
  }
}

// Post-scan rubric meta residue
for (const file of TARGET_FILES) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const q of batch.questions || []) {
    const meta = rubricMetaIn(q.vocabularyTags);
    if (meta.length) {
      report.postScanRubricResidue.push({
        file,
        id: q.id,
        teil: q.teil,
        meta,
        tags: q.vocabularyTags,
      });
    }
  }
}

report.residueCount = report.postScanRubricResidue.length;
report.ok = report.residueCount === 0;

const logPath = path.join(
  ROOT,
  'batches/ready/gate-logs/schreiben-sprechen-caps-r7-2026-07-12.json',
);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      ok: report.ok,
      dryRun,
      questionsTotal: report.questionsTotal,
      questionsChanged: report.questionsChanged,
      typoFixes: report.typoFixes,
      capsFixes: report.capsFixes,
      residueCount: report.residueCount,
      perFileSummary: report.perFile.map((p) => ({
        file: p.file,
        questionsChanged: p.questionsChanged,
        capsChangeCount: p.capsChangeCount,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${path.relative(ROOT, logPath)}`);
if (!report.ok && !dryRun) process.exit(1);
