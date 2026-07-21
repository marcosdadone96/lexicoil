#!/usr/bin/env node
/**
 * Apply today's post-generation fixes to the 9 canary staging files
 * (3× Lesen T4, 3× Lesen T5, 3× Hören T3). Does NOT promote to pool-verified.
 *
 * Steps: vocab (separables+hyphen) → caps v3.8 → expl option-letter resync → date/weekday.
 *
 *   node scripts/reprocess-canary-staging-fixes-2026-07-11.mjs
 *   node scripts/reprocess-canary-staging-fixes-2026-07-11.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
import { findDateWeekdayMismatches } from './lib/qualityGates/dateWeekdayGate.mjs';

const require = createRequire(import.meta.url);
const {
  alignExplanationOptionLetters,
  findExplanationOptionLetters,
} = require('../js/engine/prompts/explanationOptionResync.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY = path.join(ROOT, 'batches/ready');
const LOG = path.join(ROOT, 'batches/ready/gate-logs/canary-staging-fixes-2026-07-11.json');
const dryRun = process.argv.includes('--dry-run');

const CANARY_DIRS = [
  'lesen-t4-staging-2026-07-11-canary',
  'lesen-t5-staging-2026-07-11-canary',
  'horen-t3-staging-2026-07-11-canary',
];
const MIRROR_DIR = 'canary-all-staging-2026-07-11';

const WEEKDAYS_DE = {
  0: 'Sonntag',
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
};

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

function normalizeCorrect(c) {
  const s = String(c ?? '').trim().toLowerCase();
  const m = s.match(/^([abc])\b/);
  return m ? m[1] : null;
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

function patchSurgicalStrings(obj, pathPrefix, hits) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        const fixed = surgicalFixTag(obj[i]);
        if (fixed !== obj[i] && (/-/.test(obj[i]) || /-/.test(fixed))) {
          hits.push({ path: `${pathPrefix}[${i}]`, before: obj[i], after: fixed });
          obj[i] = fixed;
        }
      } else patchSurgicalStrings(obj[i], `${pathPrefix}[${i}]`, hits);
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
    } else if ((k === 'lemma' || k === 'concept' || k === 'word') && typeof v === 'string') {
      const fixed = surgicalFixTag(v);
      if (fixed !== v) {
        hits.push({ path: `${pathPrefix}.${k}`, before: v, after: fixed });
        obj[k] = fixed;
      }
    } else if (v && typeof v === 'object') {
      patchSurgicalStrings(v, `${pathPrefix}.${k}`, hits);
    }
  }
}

/** Replace mismatched weekday with the calendar-correct German weekday for that day/month/year. */
function fixDateWeekdayInText(text, hit) {
  if (!hit || hit.reason !== 'weekday_mismatch') return { text, changed: false };
  const actual = WEEKDAYS_DE[hit.actualDow ?? hit.actualWeekdayIndex];
  // Prefer numeric dow if present; else map from actualWeekday string already computed by gate
  let correctName = hit.actualWeekday;
  if (typeof hit.actualDow === 'number') correctName = WEEKDAYS_DE[hit.actualDow];
  if (!correctName || !hit.claimedWeekday) return { text, changed: false };
  // Replace only the claimed weekday token inside the matched span when possible
  const span = String(hit.match || '');
  if (span && text.includes(span)) {
    const fixedSpan = span.replace(new RegExp(`\\b${hit.claimedWeekday}\\b`, 'i'), correctName);
    if (fixedSpan !== span) {
      return { text: text.replace(span, fixedSpan), changed: true, from: hit.claimedWeekday, to: correctName, match: span };
    }
  }
  // Fallback: first occurrence of claimed weekday near the date
  const re = new RegExp(`\\b${hit.claimedWeekday}\\b`, 'i');
  if (re.test(text)) {
    return {
      text: text.replace(re, correctName),
      changed: true,
      from: hit.claimedWeekday,
      to: correctName,
      match: hit.match,
    };
  }
  return { text, changed: false };
}

function collectDateHits(batch) {
  const hits = [];
  for (const p of batch.passages || []) {
    for (const field of ['text', 'title', 'transcript']) {
      if (!p[field]) continue;
      for (const h of findDateWeekdayMismatches(p[field], { field: `passage.${p.id}.${field}` })) {
        hits.push({ ...h, target: 'passage', id: p.id, field });
      }
    }
    if (Array.isArray(p.audio)) {
      p.audio.forEach((a, i) => {
        if (!a?.text) return;
        for (const h of findDateWeekdayMismatches(a.text, { field: `passage.${p.id}.audio[${i}]` })) {
          hits.push({ ...h, target: 'audio', id: p.id, field: 'audio', index: i });
        }
      });
    }
  }
  for (const q of batch.questions || []) {
    for (const field of ['question', 'explanation', 'signText']) {
      if (!q[field]) continue;
      for (const h of findDateWeekdayMismatches(q[field], { field: `${q.id}.${field}` })) {
        hits.push({ ...h, target: 'question', id: q.id, field });
      }
    }
    (q.options || []).forEach((opt, i) => {
      for (const h of findDateWeekdayMismatches(String(opt), { field: `${q.id}.options[${i}]` })) {
        hits.push({ ...h, target: 'option', id: q.id, field: 'options', index: i });
      }
    });
  }
  return hits;
}

function applyDateFixes(batch, hits) {
  const fixes = [];
  for (const hit of hits) {
    if (hit.reason !== 'weekday_mismatch') continue;
    if (hit.target === 'passage') {
      const p = (batch.passages || []).find((x) => x.id === hit.id);
      if (!p) continue;
      const r = fixDateWeekdayInText(p[hit.field], hit);
      if (r.changed) {
        p[hit.field] = r.text;
        fixes.push({ where: `passage ${hit.id}.${hit.field}`, ...r, hit });
      }
    } else if (hit.target === 'audio') {
      const p = (batch.passages || []).find((x) => x.id === hit.id);
      if (!p?.audio?.[hit.index]) continue;
      const r = fixDateWeekdayInText(p.audio[hit.index].text, hit);
      if (r.changed) {
        p.audio[hit.index].text = r.text;
        fixes.push({ where: `passage ${hit.id}.audio[${hit.index}]`, ...r, hit });
      }
    } else if (hit.target === 'question') {
      const q = (batch.questions || []).find((x) => x.id === hit.id);
      if (!q) continue;
      const r = fixDateWeekdayInText(q[hit.field], hit);
      if (r.changed) {
        q[hit.field] = r.text;
        fixes.push({ where: `question ${hit.id}.${hit.field}`, ...r, hit });
      }
    } else if (hit.target === 'option') {
      const q = (batch.questions || []).find((x) => x.id === hit.id);
      if (!q?.options?.[hit.index]) continue;
      const r = fixDateWeekdayInText(String(q.options[hit.index]), hit);
      if (r.changed) {
        q.options[hit.index] = r.text;
        fixes.push({ where: `question ${hit.id}.options[${hit.index}]`, ...r, hit });
      }
    }
  }
  return fixes;
}

function listCanaryFiles() {
  const out = [];
  for (const dir of CANARY_DIRS) {
    const abs = path.join(READY, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.json')).sort()) {
      out.push({ dir, file: f, abs: path.join(abs, f) });
    }
  }
  return out;
}

const stampAt = new Date().toISOString();
const files = listCanaryFiles();
const report = {
  generatedAt: stampAt,
  dryRun,
  versions: {
    vocab: VOCAB_TAGS_NORMALIZE_VERSION,
    caps: GERMAN_CAPS_NORMALIZE_VERSION,
  },
  files: {},
};

console.log(`Canary reprocess · ${files.length} files · dryRun=${dryRun}`);

for (const { dir, file, abs } of files) {
  const key = `${dir}/${file}`;
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const entry = {
    path: key,
    vocab: { changed: false, questionChanges: [], surgicalHits: [] },
    caps: { changed: false, stats: null, samples: [] },
    expl: { changed: false, fixes: [] },
    date: { beforeHits: [], fixes: [], afterHits: [] },
    contentChanged: false,
  };

  // ── a) vocab ──────────────────────────────────────────────
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
  for (let i = 0; i < questions.length; i++) {
    if (!tagsEqual(beforeByQ[i].tags, questions[i].vocabularyTags)) {
      entry.vocab.questionChanges.push({
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
  const surgicalHits = [];
  patchSurgicalStrings(next, file, surgicalHits);
  entry.vocab.surgicalHits = surgicalHits;
  entry.vocab.changed = entry.vocab.questionChanges.length > 0 || surgicalHits.length > 0;

  // ── b) caps ───────────────────────────────────────────────
  const { batch: capped, stats, changes } = applyGermanCapsNormalize(structuredClone(next));
  next = stampGermanCapsVersion(capped);
  entry.caps.stats = stats;
  entry.caps.samples = (changes || [])
    .filter((c) => c.kind === 'token' || c.before != null)
    .slice(0, 40)
    .map((c) => ({
      field: c.field || c.path || c.ctx,
      before: c.before,
      after: c.after,
    }));
  entry.caps.changed = (stats.markdownFixed + stats.decapFixed + stats.capFixed) > 0;

  // ── c) explanation option-letter resync ───────────────────
  for (const q of next.questions || []) {
    const correct = normalizeCorrect(q.correct ?? q.correctAnswer);
    const before = String(q.explanation || '');
    const hits = findExplanationOptionLetters(before);
    if (!hits.length || !correct) continue;
    const desync = hits.filter((h) => h.letter !== correct);
    if (!desync.length) continue;
    const { explanation, changed, fixes } = alignExplanationOptionLetters(before, correct);
    if (changed) {
      q.explanation = explanation;
      entry.expl.fixes.push({
        qid: q.id,
        correct,
        fixes,
        before,
        after: explanation,
      });
      entry.expl.changed = true;
    }
  }

  // ── d) date/weekday ───────────────────────────────────────
  entry.date.beforeHits = collectDateHits(next).map((h) => ({
    match: h.match,
    claimedWeekday: h.claimedWeekday,
    actualWeekday: h.actualWeekday,
    reason: h.reason,
    field: h.field,
    id: h.id,
    target: h.target,
  }));
  const dateFixes = applyDateFixes(next, collectDateHits(next));
  entry.date.fixes = dateFixes.map((f) => ({
    where: f.where,
    from: f.from,
    to: f.to,
    match: f.match,
  }));
  // re-stamp caps after date text edits? optional — date fix only changes weekday token
  entry.date.afterHits = collectDateHits(next).map((h) => ({
    match: h.match,
    claimedWeekday: h.claimedWeekday,
    actualWeekday: h.actualWeekday,
    reason: h.reason,
    field: h.field,
    id: h.id,
  }));

  entry.contentChanged =
    entry.vocab.changed ||
    entry.caps.changed ||
    entry.expl.changed ||
    entry.date.fixes.length > 0;

  report.files[key] = entry;

  const flags = [
    entry.vocab.changed ? 'vocab' : null,
    entry.caps.changed ? `caps(d${stats.decapFixed}/c${stats.capFixed})` : null,
    entry.expl.changed ? `expl×${entry.expl.fixes.length}` : null,
    entry.date.fixes.length ? `date×${entry.date.fixes.length}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`  ${key}: ${flags || 'no content change (stamps only)'}`);

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`);
    // mirror into canary-all if present
    const mirrorAbs = path.join(READY, MIRROR_DIR, file);
    if (fs.existsSync(path.dirname(mirrorAbs))) {
      fs.writeFileSync(mirrorAbs, `${JSON.stringify(next, null, 2)}\n`);
    }
  }
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLog: ${LOG}`);
console.log(
  `Content-changed: ${Object.values(report.files).filter((f) => f.contentChanged).length}/${files.length}`,
);
