#!/usr/bin/env node
/**
 * Apply A/B/C triage fixes for A2 topic debt (2026-08-02).
 *   node scripts/dev/apply-a2-topic-triage-fixes.mjs --dry-run
 *   node scripts/dev/apply-a2-topic-triage-fixes.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../lib/loadEnv.mjs';
import { enrichBatchMetadata } from '../lib/enrichBatchMetadata.mjs';

const apply = process.argv.includes('--apply');
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const stamp = new Date().toISOString();

/** B — topicTag-only retags (batch + passages + question topicTags). */
const TOPIC_RETAGS = {
  'lesen-t2-cur-education.json': 'Gesundheit',
  'lesen-t2-cur-work.json': 'Stadtleben',
  'lesen-t2-cur-society.json': 'Stadtleben',
  'lesen-t3-cur-work.json': 'Stadtleben',
  'lesen-t4-cur-education.json': 'Stadtleben',
  'lesen-t4-cur-health.json': 'Gesundheit',
  'lesen-t4-cur-society.json': 'Umwelt',
  'lesen-t4-cur-work.json': 'Stadtleben',
  'horen-t4-cur-society.json': 'Medien',
  'horen-t1-cur-society.json': 'Stadtleben',
  'schreiben-cur-education.json': 'Stadtleben',
  'schreiben-cur-society.json': 'Stadtleben',
  'schreiben-cur-work.json': 'Stadtleben',
  'sprechen-cur-education.json': 'Stadtleben',
  'sprechen-cur-health.json': 'Stadtleben',
  'sprechen-cur-work.json': 'Stadtleben',
  'sprechen-t1-gemini-016.json': 'Stadtleben',
  'schreiben-gemini-064.json': 'Stadtleben',
};

/** A — exact text substitutions [{file?, fieldPath?, find, replace}] */
const TEXT_FIXES = [
  {
    files: ['lesen-t2-cur-work.json'],
    find: 'Latecoming: Nach 15 Min. Filmstart kein Einlass mehr',
    replace: 'Verspätung: Nach 15 Min. Filmstart kein Einlass mehr',
  },
  {
    files: ['lesen-t4-cur-society.json'],
    find: 'Nachaltige Verpackung',
    replace: 'Nachhaltige Verpackung',
  },
  {
    files: ['horen-t1-cur-health.json'],
    find: 'Ihr Termin am Freitag um 14 Uhr bestätigt.',
    replace: 'Ihr Termin am Freitag um 14 Uhr ist bestätigt.',
  },
  {
    files: ['sprechen-t2-gemini-022.json'],
    find: 'Warum ist das Wichtig für Sie?',
    replace: 'Warum ist das wichtig für Sie?',
  },
];

function stableQSuffix(stem, idOrIndex) {
  return crypto.createHash('sha256').update(`${stem}:q:${idOrIndex}`).digest('hex').slice(0, 8);
}

function setTopicTag(batch, tag) {
  batch.topicTag = tag;
  batch._requestedTopic = tag;
  for (const p of batch.passages || []) {
    if (p.topicTag != null) p.topicTag = tag;
  }
  for (const q of batch.questions || []) {
    if (Array.isArray(q.topicTags) && q.topicTags.length) q.topicTags = [tag];
  }
}

function fixNumericQuestionIds(batch, stem) {
  let n = 0;
  batch.questions = (batch.questions || []).map((q, i) => {
    const id = String(q.id || '');
    if (!/^\d+$/.test(id)) return q;
    n++;
    return { ...q, id: `${id}-${stableQSuffix(stem, id)}` };
  });
  return n;
}

function fixB1GrammarTags(batch) {
  const { batch: out } = enrichBatchMetadata(structuredClone(batch), {
    forceGrammar: true,
    grammar: true,
    vocab: false,
    topic: false,
  });
  out._a2GrammarRetagAt = stamp;
  out._a2GrammarRetagNote = 'apply-a2-topic-triage-fixes.mjs';
  return out;
}

function applyTextFixes(batch, file) {
  let raw = JSON.stringify(batch);
  for (const fx of TEXT_FIXES) {
    if (fx.files && !fx.files.includes(file)) continue;
    if (raw.includes(fx.find)) {
      raw = raw.split(fx.find).join(fx.replace);
    }
  }
  return JSON.parse(raw);
}

const log = [];

for (const file of fs.readdirSync(poolDir).filter((f) => f.endsWith('.json')).sort()) {
  const abs = path.join(poolDir, file);
  const stem = file.replace(/\.json$/i, '');
  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const changes = [];

  const textBefore = JSON.stringify(batch);
  batch = applyTextFixes(batch, file);
  if (JSON.stringify(batch) !== textBefore) changes.push('A:text');

  const qRen = fixNumericQuestionIds(batch, stem);
  if (qRen) changes.push(`C:questionIds ${qRen}`);

  const hadB1 = (batch.questions || []).some((q) => (q.grammarTags || []).some((t) => /^g-de-b1-/.test(t)));
  if (hadB1) {
    batch = fixB1GrammarTags(batch);
    changes.push('C:grammarTags b1→a2');
  }

  if (TOPIC_RETAGS[file]) {
    const old = batch.topicTag || batch._requestedTopic;
    setTopicTag(batch, TOPIC_RETAGS[file]);
    changes.push(`B:topicTag ${old}→${TOPIC_RETAGS[file]}`);
  }

  if (changes.length) {
    batch._a2TopicTriageFixAt = stamp;
    batch._a2TopicTriageFixNote = changes.join('; ');
    log.push({ file, changes });
    if (apply) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  }
}

console.log(JSON.stringify({ apply, touched: log.length, log }, null, 2));
