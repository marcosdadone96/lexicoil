#!/usr/bin/env node
/**
 * Consolidated verify for 9 canary staging files after today's fixes.
 *   node scripts/verify-canary-staging-fixes-2026-07-11.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findDateWeekdayMismatches } from './lib/qualityGates/dateWeekdayGate.mjs';
import { VOCAB_TAGS_NORMALIZE_VERSION } from './lib/enrichBatchMetadata.mjs';
import { GERMAN_CAPS_NORMALIZE_VERSION } from './lib/germanCapsNormalize.mjs';

const require = createRequire(import.meta.url);
const { findExplanationOptionLetters } = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/canary-staging-verify-2026-07-11.json');

const DIRS = [
  'lesen-t4-staging-2026-07-11-canary',
  'lesen-t5-staging-2026-07-11-canary',
  'horen-t3-staging-2026-07-11-canary',
];

const HYPHEN_BAD_RE =
  /\byoga-kur\b|\bstreaming-dien\b|\bvier-tage-woch\b|\b\w+-nachhilf\b|\bsamstagvormittag-kur\b|\brepair-caf\b|\bdrahtesel-hilf\b|\brecycling-syst\b|\bonline-buchungssyst\b/i;
const CAPS_BAD_RE = /unserem Jährlichen|für die kleinen\./;

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
}

function brokenSeparables(q, passage) {
  const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
  const text = [q.question, q.explanation, ...(q.options || []), passage?.title, passage?.text]
    .filter(Boolean)
    .join(' ');
  const hits = [];
  if (tags.includes('schlagen') && !tags.includes('vorschlagen') && /\bschlägt\b[\s\S]{0,100}\bvor\b/i.test(text)) {
    hits.push('schlagen←vorschlagen');
  }
  if (tags.includes('finden') && !tags.includes('stattfinden') && /\bfind(?:et|en)?\b[\s\S]{0,100}\bstatt\b/i.test(text)) {
    hits.push('finden←stattfinden');
  }
  if (tags.includes('kündigen') && !tags.includes('ankündigen') && /\bkündigt\b[\s\S]{0,100}\ban\b/i.test(text)) {
    hits.push('kündigen←ankündigen');
  }
  return hits;
}

function collectDateHits(batch) {
  const hits = [];
  for (const p of batch.passages || []) {
    for (const field of ['text', 'title', 'transcript']) {
      if (!p[field]) continue;
      hits.push(...findDateWeekdayMismatches(p[field], { field: `${p.id}.${field}` }));
    }
  }
  for (const q of batch.questions || []) {
    for (const field of ['question', 'explanation']) {
      if (!q[field]) continue;
      hits.push(...findDateWeekdayMismatches(q[field], { field: `${q.id}.${field}` }));
    }
    for (const opt of q.options || []) {
      hits.push(...findDateWeekdayMismatches(String(opt), { field: `${q.id}.opt` }));
    }
  }
  return hits;
}

function explDesyncs(batch) {
  const out = [];
  for (const q of batch.questions || []) {
    if (q.type !== 'multiple_choice') continue;
    const want = normalizeCorrect(q.correctAnswer ?? q.correct);
    if (!want) continue;
    const letters = findExplanationOptionLetters(q.explanation || '');
    const wrong = letters.filter((h) => h.letter !== want);
    if (wrong.length) out.push({ qid: q.id, want, found: wrong.map((w) => w.letter) });
  }
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  expectedVocabVersion: VOCAB_TAGS_NORMALIZE_VERSION,
  expectedCapsVersion: GERMAN_CAPS_NORMALIZE_VERSION,
  files: {},
  summary: { ok: true, failures: [] },
};

for (const dir of DIRS) {
  const absDir = path.join(READY, dir);
  for (const file of fs.readdirSync(absDir).filter((f) => f.endsWith('.json')).sort()) {
    const key = `${dir}/${file}`;
    const batch = JSON.parse(fs.readFileSync(path.join(absDir, file), 'utf8'));
    const byId = new Map((batch.passages || []).map((p) => [p.id, p]));
    const blob = JSON.stringify(batch);
    const entry = {
      emptyVocabQuestions: (batch.questions || []).filter((q) => !(q.vocabularyTags || []).length).length,
      vocabVersion: batch._vocabTagsNormalizeVersion || null,
      capsVersion: batch._germanCapsNormalizeVersion || null,
      hyphenTruncationHits: HYPHEN_BAD_RE.test(blob),
      capsPatternHits: CAPS_BAD_RE.test(blob),
      dateWeekday: collectDateHits(batch),
      explDesync: explDesyncs(batch),
      separables: [],
    };
    for (const q of batch.questions || []) {
      const broken = brokenSeparables(q, byId.get(q.passageId));
      if (broken.length) entry.separables.push({ qid: q.id, broken, tags: q.vocabularyTags });
    }

    report.files[key] = entry;
    const fails = [];
    if (entry.emptyVocabQuestions > 0) fails.push(`emptyVocab×${entry.emptyVocabQuestions}`);
    if (entry.hyphenTruncationHits) fails.push('hyphenTruncation');
    if (entry.capsPatternHits) fails.push('capsPattern');
    if (entry.dateWeekday.length) fails.push(`date×${entry.dateWeekday.length}`);
    if (entry.explDesync.length) fails.push(`expl×${entry.explDesync.length}`);
    if (entry.separables.length) fails.push(`sep×${entry.separables.length}`);
    if (entry.vocabVersion !== VOCAB_TAGS_NORMALIZE_VERSION) fails.push('vocabStamp');
    if (entry.capsVersion !== GERMAN_CAPS_NORMALIZE_VERSION) fails.push('capsStamp');
    console.log(
      `${key}: empty=${entry.emptyVocabQuestions} hyphen=${entry.hyphenTruncationHits} capsPat=${entry.capsPatternHits} date=${entry.dateWeekday.length} expl=${entry.explDesync.length} sep=${entry.separables.length} stamps=${entry.vocabVersion?.slice(0, 12)}/${entry.capsVersion?.slice(0, 12)}`,
    );
    if (fails.length) {
      report.summary.ok = false;
      report.summary.failures.push(`${key}: ${fails.join(',')}`);
    }
  }
}

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log('\nOK?', report.summary.ok);
if (!report.summary.ok) {
  console.log('Failures:', report.summary.failures.join('\n'));
  process.exitCode = 1;
}
console.log('Log:', OUT);
