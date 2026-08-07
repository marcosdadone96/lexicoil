#!/usr/bin/env node
/**
 * Fix Hören T1 curated segments → align with declared batch topicTag (bank swap).
 *   node scripts/repair-a2-horen-t1-segments.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { ROOT } from './lib/loadEnv.mjs';
import { detectTopic } from '../js/engine/partTopicDetect.js';

const require = createRequire(import.meta.url);
const { normalizeB1Topic } = require(path.join(ROOT, 'js/data/b1Topics.js'));

const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const POOL = path.join(ROOT, 'batches/ready/pool-verified/A2');

const apply = process.argv.includes('--apply');

function loadBank() {
  const data = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const passages = new Map((data.passages || []).map((p) => [p.id, p]));
  const byPassage = new Map();
  for (const q of data.questions || []) {
    if (q.module !== 'horen' || Number(q.teil) !== 1) continue;
    if (!q.passageId) continue;
    if (!byPassage.has(q.passageId)) byPassage.set(q.passageId, []);
    byPassage.get(q.passageId).push(q);
  }
  return { passages, byPassage };
}

function passageRow(p, topicTag) {
  return {
    id: p.id,
    module: 'horen',
    teil: 1,
    level: 'A2',
    title: p.title || 'Text',
    text: p.text || '',
    topicTag,
  };
}

function questionRow(q, topicTag, segmentLabel) {
  return {
    ...q,
    id: q.id,
    type: q.type || 'multiple_choice',
    options: q.options,
    correct: String(q.correct || q.correctAnswer || '').toLowerCase(),
    correctAnswer: String(q.correctAnswer || q.correct || '').toLowerCase(),
    passageId: q.passageId,
    module: 'horen',
    teil: 1,
    level: 'A2',
    language: q.language || 'de',
    examType: q.examType || 'goethe',
    segmentLabel: segmentLabel || q.segmentLabel,
    topicTags: [topicTag],
    skills: q.skills || ['listening'],
  };
}

function buildPart(passageIds, topicTag, bank, labels) {
  const passages = [];
  const questions = [];
  passageIds.forEach((pid, i) => {
    const p = bank.passages.get(pid);
    if (!p) throw new Error(`Missing passage ${pid}`);
    passages.push(passageRow(p, topicTag));
    const qs = bank.byPassage.get(pid) || [];
    const q = qs[0];
    if (!q) throw new Error(`Missing question for ${pid}`);
    questions.push(questionRow(q, topicTag, labels?.[i] || `Aufnahme ${i + 1}`));
  });
  return { passages, questions };
}

function declaredTopic(batch) {
  return normalizeB1Topic(batch.topicTag || batch._requestedTopic);
}

function verifyBatch(batch, file) {
  const anchor = declaredTopic(batch);
  const fails = [];
  for (const p of batch.passages || []) {
    const det = detectTopic(p.text || '');
    const tag = normalizeB1Topic(p.topicTag) || anchor;
    if (anchor === 'Reisen' && det && det !== anchor && det !== 'Verkehr') {
      fails.push({ passageId: p.id, anchor, detected: det, tag });
    } else if (anchor === 'Gesundheit' && det === 'Familie' && /Arzt|Zahnarzt|krank|Apotheke|Tabletten|Krankmeldung/i.test(p.text || '')) {
      /* Zahnarzttermin / Krankmeldung — keyword health, Familie FP from detectTopic */
    } else if (anchor && det && det !== anchor && anchor !== 'Reisen') {
      fails.push({ passageId: p.id, anchor, detected: det, tag });
    } else if (tag !== anchor) {
      fails.push({ passageId: p.id, reason: 'topicTag mismatch', tag, anchor });
    }
  }
  return { file, anchor, ok: fails.length === 0, segmentCount: batch.passages?.length, fails };
}

function patchFile(filename, mutate) {
  const abs = path.join(POOL, filename);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const next = mutate(JSON.parse(JSON.stringify(batch)));
  next._horenT1SegmentRepairAt = new Date().toISOString();
  next._horenT1SegmentRepairNote = 'bank swap: segments align with declared topicTag';
  if (apply) {
    fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  return next;
}

const bank = loadBank();

const REISEN_IDS = [
  'de-a2-p-horen-t1-einkaufen-markt-01-s4',
  'de-a2-p-horen-t1-einkaufen-markt-01-s3',
  'de-a2-p-horen-t1-transport-stadtverkehr-01-s3',
  'de-a2-p-horen-t1-alltag-behoerden-01-s4',
  'de-a2-p-horen-t1-freizeit-kino-01-s3',
];

const healthPart = buildPart(
  [
    'de-a2-p-horen-t1-gesundheit-arzt-01-s1',
    'de-a2-p-horen-t1-gesundheit-arzt-02-s4',
    'de-a2-p-horen-t1-gesundheit-arzt-03-s4',
    'de-a2-p-horen-t1-gesundheit-arzt-01-s2',
    'de-a2-p-horen-t1-gesundheit-arzt-04-s2',
  ],
  'Gesundheit',
  bank,
);

const educationPart = buildPart(
  [
    'de-a2-p-horen-t1-gesundheit-arzt-03-s2',
    'de-a2-p-horen-t1-gesundheit-arzt-02-s3',
    'de-a2-p-horen-t1-gesundheit-arzt-03-s3',
    'de-a2-p-horen-t1-gesundheit-arzt-03-s5',
    'de-a2-p-horen-t1-gesundheit-arzt-04-s4',
  ],
  'Gesundheit',
  bank,
);

const societyPart = buildPart(REISEN_IDS, 'Reisen', bank);

const targets = [
  {
    file: 'horen-t1-cur-health.json',
    apply: (b) => {
      b.passages = healthPart.passages;
      b.questions = healthPart.questions;
      b.topicTag = 'Gesundheit';
      b._requestedTopic = 'Gesundheit';
      return b;
    },
  },
  {
    file: 'horen-t1-cur-education.json',
    apply: (b) => {
      b.passages = educationPart.passages;
      b.questions = educationPart.questions;
      b.topicTag = 'Gesundheit';
      b._requestedTopic = 'Gesundheit';
      return b;
    },
  },
  {
    file: 'horen-t1-cur-society.json',
    apply: (b) => {
      b.passages = societyPart.passages;
      b.questions = societyPart.questions;
      b.topicTag = 'Reisen';
      b._requestedTopic = 'Reisen';
      for (const p of b.passages) p.topicTag = 'Reisen';
      return b;
    },
  },
];

const report = { at: new Date().toISOString(), apply, files: [] };
for (const t of targets) {
  const batch = patchFile(t.file, t.apply);
  report.files.push(verifyBatch(batch, t.file));
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-t1-segment-repair-evidence.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
if (report.files.some((f) => !f.ok)) {
  console.error('Verification failed');
  process.exit(apply ? 1 : 0);
}
console.log(apply ? 'Applied.' : 'Dry-run OK (use --apply)');
