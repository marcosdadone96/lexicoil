#!/usr/bin/env node
/**
 * Dry simulation: R7 no-explanation vocab extraction (does NOT write pool files).
 *   node scripts/sim-r7-vocab-no-explanation-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichBatchMetadata,
  questionSpecificVocabBlob,
  extractVocabularyFromText,
  VOCAB_TAGS_NORMALIZE_VERSION,
} from './lib/enrichBatchMetadata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

/** Meta lemmas/surfaces the audit flagged as explanation residue. */
const META = [
  'bedeutet',
  'bedeuten',
  'zeigt',
  'zeigen',
  'widerspricht',
  'widersprechen',
  'entspricht',
  'entsprechen',
];

const SAMPLE = [
  'horen-t3-gemini-008.json',
  'horen-t3-gemini-009.json',
  'horen-t3-gemini-010.json',
  'horen-t3-gemini-001.json',
  'horen-t3-gemini-002.json',
  'lesen-t4-gemini-043.json',
  'lesen-t5-gemini-076.json',
  'horen-t1-gemini-004.json',
].filter((f) => fs.existsSync(path.join(POOL, f)));

function tagHits(tags) {
  const low = (tags || []).map((t) => String(t).toLowerCase());
  return META.filter((m) => low.includes(m));
}

function onlyInExplanation(q, lemmaOrSurface) {
  const needle = String(lemmaOrSurface).toLowerCase();
  const expl = String(q.explanation || '').toLowerCase();
  const content = [q.question, q.signText, q.transcript, q.statement, ...(q.options || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const inExpl = expl.includes(needle) || (needle.endsWith('en') && expl.includes(needle.slice(0, -2)));
  // rough: surface form check for zeigt/bedeutet/widerspricht
  const surfaces = {
    zeigen: ['zeigt', 'zeigen'],
    bedeuten: ['bedeutet', 'bedeuten'],
    widersprechen: ['widerspricht', 'widersprechen'],
    entsprechen: ['entspricht', 'entsprechen'],
  };
  const forms = surfaces[needle] || [needle];
  const inContent = forms.some((f) => content.includes(f));
  const inExplForm = forms.some((f) => expl.includes(f));
  return inExplForm && !inContent;
}

const sampleResults = [];
for (const file of SAMPLE) {
  const before = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  const beforeHits = [];
  for (const q of before.questions || []) {
    const hits = tagHits(q.vocabularyTags);
    if (hits.length) {
      beforeHits.push({
        id: q.id,
        oldTags: hits,
        onlyFromExpl: hits.filter((h) => onlyInExplanation(q, h)),
      });
    }
  }

  const { batch: sim } = enrichBatchMetadata(structuredClone(before), {
    topic: false,
    grammar: false,
    vocab: true,
    forceVocab: true,
  });

  const afterHits = [];
  for (const q of sim.questions || []) {
    const hits = tagHits(q.vocabularyTags);
    const blob = questionSpecificVocabBlob(
      q,
      (sim.passages || []).find((p) => p.id === q.passageId),
    );
    const candidates = extractVocabularyFromText(blob, 16).map((t) => String(t).toLowerCase());
    const candMeta = META.filter((m) => candidates.includes(m));
    if (hits.length || candMeta.length) {
      afterHits.push({ id: q.id, newTags: hits, candidatesMeta: candMeta });
    }
  }

  sampleResults.push({
    file,
    beforeMetaTagQuestions: beforeHits.length,
    beforeDetail: beforeHits,
    afterMetaTagQuestions: afterHits.filter((x) => x.newTags.length).length,
    afterDetail: afterHits,
    version: sim._vocabTagsNormalizeVersion,
  });
}

// Full pool estimate (read-only): files where ≥1 current tag is a META form
// that appears in explanation but NOT in question/options/signText/transcript/statement
// (passage excluded for "only explanation" — if also in passage, reprocess may keep it)
let affectedFiles = 0;
let affectedQuestions = 0;
const affectedList = [];
for (const file of fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort()) {
  const b = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  let fileHit = false;
  for (const q of b.questions || []) {
    const hits = tagHits(q.vocabularyTags).filter((h) => onlyInExplanation(q, h));
    if (hits.length) {
      fileHit = true;
      affectedQuestions++;
    }
  }
  if (fileHit) {
    affectedFiles++;
    if (affectedList.length < 25) affectedList.push(file);
  }
}

const report = {
  version: VOCAB_TAGS_NORMALIZE_VERSION,
  note: 'Simulation only — pool files not modified',
  sampleCount: SAMPLE.length,
  sampleResults,
  poolEstimate: {
    totalPoolJson: fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).length,
    filesWithMetaTagOnlyFromExplanation: affectedFiles,
    questionsWithMetaTagOnlyFromExplanation: affectedQuestions,
    sampleAffectedFiles: affectedList,
    estimateNote:
      'Counts files where vocabularyTags already contain bedeutet/zeigt/widerspricht/entspricht (or lemmas) AND that form appears in explanation but not in question/options/signText/transcript/statement. Tags that also occur in passage/content may remain after reprocess — this is the lower-bound "explanation residue" set.',
  },
};

const out = path.join(ROOT, 'batches/ready/gate-logs/r7-vocab-no-explanation-sim-2026-07-12.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, out)}`);
