#!/usr/bin/env node
/**
 * Surgical reprocess: gezeigen→zeigen after v2.3.11 ge-participle fix.
 * Only files that currently carry the garbage tag (scan: 1 file).
 *
 *   node scripts/reprocess-gezeigen-2026-07-12.mjs
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

function findAffected() {
  const out = [];
  for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.json'))) {
    const b = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
    for (const q of b.questions || []) {
      if ((q.vocabularyTags || []).some((t) => String(t).toLowerCase() === 'gezeigen')) {
        out.push(f);
        break;
      }
    }
  }
  return out;
}

function reextract(q, passage) {
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

const targets = findAffected();
if (!targets.length) {
  console.log('No gezeigen tags found — nothing to reprocess.');
  process.exit(0);
}

const stampAt = new Date().toISOString();
const report = {
  generatedAt: stampAt,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  diagnosis:
    'tryDeFiniteT did gezeigt→gezeigen (blind -t→-en keeping ge-). enrich toVerbInfinitive had ge-strip but looksLikeInfinitive rejected zeigen via /ig/en$/ false positive. Fixed: strip ge- before -en in tryDeFiniteT; ge-strip first in toVerbInfinitive; looksLikeInfinitive only treats -igen as adj when len>=9.',
  poolTagScan: {
    garbageTag: 'gezeigen',
    filesWithTag: targets,
    note: 'Only lowercase verb-garbage tag in pool; noun tags like Generationen are unrelated.',
  },
  perFile: [],
};

for (const file of targets) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const before = (batch.questions || []).map((q) => ({
    id: q.id,
    tags: [...(q.vocabularyTags || [])],
  }));

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    q.vocabularyTags = reextract(q, passagesById.get(q.passageId));
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );

  const changes = [];
  for (let i = 0; i < questions.length; i++) {
    const a = before[i].tags;
    const b = [...(questions[i].vocabularyTags || [])];
    const same =
      [...a].map(String).sort().join('\0') === [...b].map(String).sort().join('\0');
    if (!same) {
      changes.push({
        id: questions[i].id,
        question: String(questions[i].question || '').slice(0, 100),
        before: a,
        after: b,
      });
    } else {
      questions[i].vocabularyTags = batch.questions[i].vocabularyTags;
    }
  }

  const out = { ...batch, questions };
  out._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
  out._geParticipleLemmaReprocessedAt = stampAt;

  report.perFile.push({ file, changes });
  fs.writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
}

// post-scan
const still = findAffected();
report.postScanGezeigenFiles = still;
report.ok = still.length === 0;

const log = path.join(ROOT, 'batches/ready/gate-logs/gezeigen-fix-reprocess-2026-07-12.json');
fs.writeFileSync(log, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, log)}`);
if (!report.ok) process.exit(1);
