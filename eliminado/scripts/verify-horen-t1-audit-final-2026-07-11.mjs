#!/usr/bin/env node
/**
 * Final verification for the 6 Hören T1 pool-verified files after audit consolidation.
 *   node scripts/verify-horen-t1-audit-final-2026-07-11.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { findDateWeekdayMismatches } from './lib/qualityGates/dateWeekdayGate.mjs';
import {
  SEPARABLE_INFINITIVES,
  separableRootsFromAllowlist,
} from './lib/enrichBatchMetadata.mjs';

const require = createRequire(import.meta.url);
const {
  findExplanationOptionLetters,
  alignExplanationOptionLetters,
} = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const FILES = [
  'horen-t1-gemini-001.json',
  'horen-t1-gemini-002.json',
  'horen-t1-gemini-003.json',
  'horen-t1-gemini-004.json',
  'horen-t1-gemini-005.json',
  'horen-t1-gemini-016.json',
];
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/horen-t1-audit-final-verify-2026-07-11.json',
);

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
}

function findExplDesyncs(batch) {
  const hits = [];
  for (const q of batch.questions || []) {
    if (q.type !== 'multiple_choice') continue;
    const want = normalizeCorrect(q.correctAnswer ?? q.correct);
    if (!want) continue;
    const letters = findExplanationOptionLetters(q.explanation || '');
    const wrong = letters.filter((h) => h.letter !== want);
    if (wrong.length) {
      hits.push({
        qid: q.id,
        want,
        found: wrong.map((w) => w.letter),
        preview: String(q.explanation || '').slice(0, 120),
      });
    }
    // also: align would change
    const aligned = alignExplanationOptionLetters(q.explanation || '', want);
    if (aligned.changed) {
      if (!hits.some((h) => h.qid === q.id)) {
        hits.push({ qid: q.id, want, found: aligned.fixes.map((f) => f.from), preview: aligned.explanation.slice(0, 120) });
      }
    }
  }
  return hits;
}

function countDialogueTurns(text) {
  return (String(text).match(/\b[A-ZÄÖÜ][a-zäöüß]{1,20}:/g) || []).length;
}

function looksLikeDialogue(text) {
  const t = String(text || '');
  if (countDialogueTurns(t) >= 2) return true;
  // em-dash / en-dash turn taking without Name:
  if ((t.match(/\s[–—-]\s+[A-ZÄÖÜ]/g) || []).length >= 2) return true;
  if (/\?\s*[–—-]\s+/g.test(t) && /\.\s*[–—-]\s+/g.test(t)) return true;
  return false;
}

function contentTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function redundantRfMcq(rf, mcq) {
  const rfL = String(rf.question || '').toLowerCase();
  const mcqL = `${mcq.question} ${(mcq.options || []).join(' ')}`.toLowerCase();
  // Explicit anti-patterns from audit (same datum paraphrased)
  if (
    /nachmittag/.test(rfL) &&
    /(?:dienstag|donnerstag).*(?:dienstag|donnerstag)|nachmittag.*geöffnet|wann.*nachmittag/.test(mcqL) &&
    /(?:zwei\s+nachmittag|dienstag|donnerstag)/.test(rfL)
  ) {
    return { redundant: true, shared: ['horario-nachmittag'] };
  }
  if (
    /mehr\s+obst\s+als\s+gemüse|mehr\s+gemüse\s+als\s+obst/.test(rfL) &&
    /(?:drei|zwei).*(?:gemüse|obst)|(?:gemüse|obst).*(?:drei|zwei)|aufteilen|portionen\s+gemüse/.test(mcqL)
  ) {
    return { redundant: true, shared: ['obst-gemuese-split'] };
  }
  return { redundant: false, shared: [] };
}

function brokenSeparables(q, passage) {
  const tags = (q.vocabularyTags || []).map((t) => String(t).toLowerCase());
  const text = [q.question, q.explanation, ...(q.options || []), passage?.title, passage?.text]
    .filter(Boolean)
    .join(' ');
  const hits = [];
  if (tags.includes('schlagen') && !tags.includes('vorschlagen') && /\bschlägt\b[\s\S]{0,80}\bvor\b/i.test(text)) {
    hits.push('schlagen←vorschlagen');
  }
  if (tags.includes('finden') && !tags.includes('stattfinden') && /\bfind(?:et|en)?\b[\s\S]{0,80}\bstatt\b/i.test(text)) {
    hits.push('finden←stattfinden');
  }
  return hits;
}

const report = {
  generatedAt: new Date().toISOString(),
  files: {},
  summary: { ok: true, failures: [] },
};

for (const file of FILES) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  const byId = new Map((batch.passages || []).map((p) => [p.id, p]));
  const entry = {
    dateWeekday: [],
    explDesync: [],
    separables: [],
    dialogueSegments: [],
    redundantPairs: [],
  };

  // date/weekday
  for (const p of batch.passages || []) {
    for (const hit of findDateWeekdayMismatches(p.text || '', { field: `passage:${p.id}` })) {
      entry.dateWeekday.push(hit);
    }
  }
  for (const q of batch.questions || []) {
    for (const field of ['question', 'explanation']) {
      for (const hit of findDateWeekdayMismatches(q[field] || '', { field: `${q.id}.${field}` })) {
        entry.dateWeekday.push(hit);
      }
    }
    for (const opt of q.options || []) {
      for (const hit of findDateWeekdayMismatches(String(opt), { field: `${q.id}.opt` })) {
        entry.dateWeekday.push(hit);
      }
    }
  }

  // explanation option letters
  entry.explDesync = findExplDesyncs(batch);

  // separables + dialogue + redundancy
  for (const p of batch.passages || []) {
    if (looksLikeDialogue(p.text)) {
      entry.dialogueSegments.push({ id: p.id, title: p.title });
    }
  }
  const bySeg = new Map();
  for (const q of batch.questions || []) {
    const key = q.segmentLabel || q.passageId;
    if (!bySeg.has(key)) bySeg.set(key, []);
    bySeg.get(key).push(q);
    const broken = brokenSeparables(q, byId.get(q.passageId));
    if (broken.length) entry.separables.push({ qid: q.id, broken });
  }
  for (const [seg, qs] of bySeg) {
    const rf = qs.find((q) => q.type === 'richtig_falsch');
    const mcq = qs.find((q) => q.type === 'multiple_choice');
    if (rf && mcq) {
      const r = redundantRfMcq(rf, mcq);
      if (r.redundant) entry.redundantPairs.push({ seg, shared: r.shared, rf: rf.question, mcq: mcq.question });
    }
  }

  report.files[file] = entry;
  for (const [k, v] of Object.entries(entry)) {
    if (Array.isArray(v) && v.length) {
      report.summary.ok = false;
      report.summary.failures.push(`${file}:${k}×${v.length}`);
    }
  }
  console.log(
    `${file}: date=${entry.dateWeekday.length} expl=${entry.explDesync.length} sep=${entry.separables.length} dlg=${entry.dialogueSegments.length} red=${entry.redundantPairs.length}`,
  );
}

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log('\nOK?', report.summary.ok);
if (!report.summary.ok) {
  console.log('Failures:', report.summary.failures.join(', '));
  process.exitCode = 1;
}
console.log('Log:', OUT);
