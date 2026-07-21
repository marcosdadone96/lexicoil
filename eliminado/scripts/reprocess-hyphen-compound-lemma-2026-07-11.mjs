#!/usr/bin/env node
/**
 * Reprocess vocabularyTags after hyphen-compound lemma fix (v2.3.8).
 * Targets the 14 pool-verified files with truncated hyphen tags.
 *
 *   node scripts/reprocess-hyphen-compound-lemma-2026-07-11.mjs
 *   node scripts/reprocess-hyphen-compound-lemma-2026-07-11.mjs --dry-run
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
const LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/hyphen-compound-lemma-reprocess-2026-07-11.json',
);
const CHANGES_LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/hyphen-compound-lemma-reprocess-2026-07-11.changes.json',
);
const dryRun = process.argv.includes('--dry-run');

/** Files identified by the hyphen-truncation scan (clear stripSuffix class). */
const TARGET_FILES = [
  'horen-t1-gemini-002.json',
  'horen-t2-gemini-016.json',
  'horen-t4-gemini-011.json',
  'lesen-t1-gemini-084.json',
  'lesen-t1-gemini-092.json',
  'lesen-t3-auto-ma7vt8.json',
  'lesen-t3-auto-w8hk4n.json',
  'lesen-t3-auto-wyw6fo.json',
  'lesen-t3-auto-xqens7.json',
  'lesen-t3-auto-yu9vyl.json',
  'lesen-t3-auto-zfand7.json',
  'lesen-t3-auto-zspq8n.json',
  'lesen-t4-gemini-019.json',
  'lesen-t5-gemini-073.json',
];

/** Surgical map for tags that may not reappear via re-extract (index stubs, etc.). */
const SURGICAL = new Map([
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

function tagsEqual(a, b) {
  const aa = (a || []).map(String);
  const bb = (b || []).map(String);
  if (aa.length !== bb.length) return false;
  return aa.every((t, i) => t === bb[i]);
}

function surgicalFixTag(tag) {
  const s = String(tag);
  const low = s.toLowerCase();
  if (SURGICAL.has(low)) {
    const fixed = SURGICAL.get(low);
    // Preserve original capitalization style lightly
    if (s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase()) {
      return fixed.charAt(0).toUpperCase() + fixed.slice(1);
    }
    return fixed;
  }
  // generic *-nachhilf
  if (/-nachhilf$/i.test(low)) return `${low}e`;
  return s;
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

function patchTagArraysInObject(obj, pathPrefix, hits) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        const fixed = surgicalFixTag(obj[i]);
        if (fixed !== obj[i]) {
          hits.push({ path: `${pathPrefix}[${i}]`, before: obj[i], after: fixed });
          obj[i] = fixed;
        }
      } else {
        patchTagArraysInObject(obj[i], `${pathPrefix}[${i}]`, hits);
      }
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'vocabularyTags' || k === 'passageVocab') {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          const fixed = surgicalFixTag(v[i]);
          if (fixed !== v[i]) {
            hits.push({ path: `${pathPrefix}.${k}[${i}]`, before: v[i], after: fixed });
            v[i] = fixed;
          }
        }
      }
    } else if (k === 'lemma' || k === 'concept' || k === 'word') {
      if (typeof v === 'string') {
        const fixed = surgicalFixTag(v);
        if (fixed !== v) {
          hits.push({ path: `${pathPrefix}.${k}`, before: v, after: fixed });
          obj[k] = fixed;
        }
      }
    } else if (v && typeof v === 'object') {
      patchTagArraysInObject(v, `${pathPrefix}.${k}`, hits);
    }
  }
}

const stampAt = new Date().toISOString();
const report = {
  generatedAt: stampAt,
  dryRun,
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  targetFiles: TARGET_FILES,
  filesModified: [],
  questionChanges: [],
  surgicalHits: [],
};

console.log(`Hyphen lemma reprocess · ${TARGET_FILES.length} files · ${VOCAB_TAGS_NORMALIZE_VERSION} · dryRun=${dryRun}`);

for (const file of TARGET_FILES) {
  const abs = path.join(POOL, file);
  if (!fs.existsSync(abs)) {
    console.warn(`  SKIP missing: ${file}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const passagesById = new Map((batch.passages || []).map((p) => [p.id, p]));
  const beforeByQ = (batch.questions || []).map((q) => ({
    id: q.id,
    tags: [...(q.vocabularyTags || [])],
  }));

  const questions = (batch.questions || []).map((q) => ({ ...q }));
  for (const q of questions) {
    const passage = passagesById.get(q.passageId);
    q.vocabularyTags = reextractQuestionVocab(q, passage);
  }
  ensureDistinctQuestionVocabTags(questions, (q) =>
    questionSpecificVocabBlob(q, passagesById.get(q.passageId)),
  );
  // surgical pass on final tags
  for (const q of questions) {
    q.vocabularyTags = (q.vocabularyTags || []).map(surgicalFixTag);
  }

  const qChanges = [];
  for (let i = 0; i < questions.length; i++) {
    const oldTags = beforeByQ[i].tags;
    const newTags = [...(questions[i].vocabularyTags || [])];
    if (!tagsEqual(oldTags, newTags)) {
      qChanges.push({ file, qid: questions[i].id, before: oldTags, after: newTags });
    }
  }

  const next = {
    ...batch,
    questions,
    _vocabTagsNormalizeVersion: VOCAB_TAGS_NORMALIZE_VERSION,
    _vocabTagsNormalizedAt: stampAt,
  };
  const surgicalHits = [];
  patchTagArraysInObject(next, file, surgicalHits);

  if (qChanges.length || surgicalHits.length) {
    report.filesModified.push(file);
    report.questionChanges.push(...qChanges);
    report.surgicalHits.push(...surgicalHits);
    console.log(`  ${file}: ${qChanges.length} q-tag diffs, ${surgicalHits.length} surgical`);
    if (!dryRun) {
      fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
    }
  } else {
    // still stamp version
    next._vocabTagsNormalizeVersion = VOCAB_TAGS_NORMALIZE_VERSION;
    next._vocabTagsNormalizedAt = stampAt;
    report.filesModified.push(file);
    console.log(`  ${file}: stamp only (no tag diffs)`);
    if (!dryRun) {
      fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
    }
  }
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  CHANGES_LOG,
  `${JSON.stringify({ generatedAt: stampAt, questionChanges: report.questionChanges, surgicalHits: report.surgicalHits }, null, 2)}\n`,
);
console.log(`\nDone. Modified ${report.filesModified.length} files.`);
console.log(`Log: ${LOG}`);
