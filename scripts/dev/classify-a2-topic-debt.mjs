#!/usr/bin/env node
/** Classify the canonical 21 A2 topic-debt files + point errors. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/loadEnv.mjs';
import { checkPassageContentTopic } from '../lib/qualityGates/contentTopicCheck.mjs';
import { detectTopic } from '../lib/topicRotation.mjs';
import { isPartPoolReady } from '../audit-pass-2.mjs';

const A2_OFFICIAL = ['Reisen', 'Gesundheit', 'Stadtleben', 'Medien', 'Umwelt'];
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');

/** Canonical 21 from external review (Aug 1) + blocking re-scan. */
const CANONICAL_21 = [
  'horen-t4-cur-society.json',
  'lesen-t2-cur-society.json',
  'lesen-t2-cur-work.json',
  'lesen-t3-cur-work.json',
  'lesen-t4-cur-education.json',
  'lesen-t4-cur-health.json',
  'lesen-t4-cur-society.json',
  'lesen-t4-cur-work.json',
  'schreiben-cur-education.json',
  'schreiben-cur-health.json',
  'schreiben-cur-society.json',
  'schreiben-cur-work.json',
  'sprechen-cur-education.json',
  'sprechen-cur-health.json',
  'sprechen-cur-work.json',
  'sprechen-t1-gemini-016.json',
  'lesen-t2-cur-education.json',
  'lesen-t2-cur-health.json',
  'horen-t1-cur-education.json',
  'horen-t1-cur-work.json',
  'horen-t1-cur-society.json',
];

const B1_TO_A2 = {
  Sport: 'Gesundheit',
  Bildung: 'Medien',
  Arbeit: 'Stadtleben',
  Freizeit: 'Stadtleben',
  Wohnen: 'Stadtleben',
  Verkehr: 'Reisen',
  Kultur: 'Stadtleben',
  Familie: 'Stadtleben',
  Ernährung: 'Gesundheit',
  Konsum: 'Stadtleben',
  Technik: 'Medien',
  Umwelt: 'Umwelt',
  Reisen: 'Reisen',
  Gesundheit: 'Gesundheit',
  Stadtleben: 'Stadtleben',
  Medien: 'Medien',
};

function inferModuleTeil(f, batch) {
  const m = f.match(/^(lesen|horen|schreiben|sprechen)-t?(\d+)?/);
  return {
    mod: m?.[1] || batch.module || 'lesen',
    teil: Number(m?.[2] || batch.questions?.[0]?.teil || 1),
  };
}

function allText(batch) {
  const p = [];
  for (const x of batch.passages || []) p.push(x.title, x.text, x.transcript);
  for (const q of batch.questions || []) {
    p.push(q.question, q.explanation, ...(q.options || []));
  }
  return p.filter(Boolean).join('\n');
}

function analyzeFile(file) {
  const fp = path.join(poolDir, file);
  if (!fs.existsSync(fp)) return { file, missing: true };
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const { mod, teil } = inferModuleTeil(file, batch);
  const slug = (file.match(/-cur-(\w+)\.json$/) || [])[1];
  const declared = batch.topicTag || batch.passages?.[0]?.topicTag || batch.questions?.[0]?.topicTags?.[0];
  const text = allText(batch);
  const detected = detectTopic(text, { level: 'A2' });
  const official = B1_TO_A2[detected] || (A2_OFFICIAL.includes(detected) ? detected : null);

  const p0 = batch.passages?.[0];
  let firstPassMismatch = null;
  if (p0 && declared) {
    const ct = checkPassageContentTopic({ ...p0, topicTag: declared }, { level: 'A2', teil, module: mod });
    if (ct.mismatch) firstPassMismatch = ct.detail || ct.reason;
  }

  const pool = isPartPoolReady(fp, { level: 'A2', failOn: 'none' });
  const topicIssues = (pool.details || []).filter((d) => /content_topic|topic_mismatch/.test(d.rule || ''));

  const numericIds = (batch.questions || []).filter((q) => /^\d+$/.test(String(q.id || ''))).map((q) => q.id);
  const b1Grammar = [];
  for (const q of batch.questions || []) {
    for (const t of q.grammarTags || []) {
      if (/^g-de-b1-/.test(t)) b1Grammar.push(t);
    }
  }

  return {
    file,
    slug,
    mod,
    teil,
    declared,
    detected,
    official,
    firstPassMismatch,
    topicIssues: topicIssues.map((t) => ({ rule: t.rule, sev: t.severity, detail: (t.detail || '').slice(0, 140) })),
    numericIds,
    b1Grammar,
    title: batch.passages?.[0]?.title?.slice(0, 60) || batch.questions?.[0]?.question?.slice(0, 60),
  };
}

const rows = CANONICAL_21.map(analyzeFile);
console.log(JSON.stringify({ rows, missing: rows.filter((r) => r.missing).map((r) => r.file) }, null, 2));
