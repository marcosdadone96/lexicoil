#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/loadEnv.mjs';
import { checkPassageContentTopic } from '../lib/qualityGates/contentTopicCheck.mjs';
import { detectTopic } from '../lib/topicRotation.mjs';
import { isPartPoolReady } from '../audit-pass-2.mjs';
import { findParticipleWithoutAuxiliaryIssues } from '../lib/lexicalCheck.mjs';

const A2_OFFICIAL = ['Reisen', 'Gesundheit', 'Stadtleben', 'Medien', 'Umwelt'];
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const files = fs.readdirSync(poolDir).filter((f) => f.endsWith('.json')).sort();

function inferModuleTeil(f, batch) {
  const m = f.match(/^(lesen|horen|schreiben|sprechen)-t?(\d+)?/);
  const mod = m?.[1] || batch.module || 'lesen';
  const teil = Number(m?.[2] || batch.questions?.[0]?.teil || batch.passages?.[0]?.teil || 1);
  return { mod, teil };
}

function allText(batch) {
  const parts = [];
  for (const p of batch.passages || []) parts.push(p.title, p.text, p.transcript);
  for (const q of batch.questions || []) parts.push(q.question, q.explanation, ...(q.options || []));
  return parts.filter(Boolean).join('\n');
}

function mapToOfficial(topic) {
  const t = String(topic || '').trim();
  if (A2_OFFICIAL.includes(t)) return t;
  const map = {
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
  };
  return map[t] || null;
}

const external21 = [];
const blocking = [];
const auditOnly = [];
const pointErrors = [];

for (const file of files) {
  const fp = path.join(poolDir, file);
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const { mod, teil } = inferModuleTeil(file, batch);
  const horenAudit = mod === 'horen' && (teil === 1 || teil === 3);
  const declared = batch.topicTag || batch.passages?.[0]?.topicTag;
  const slug = (file.match(/-cur-(\w+)\.json$/) || [])[1];
  const p0 = batch.passages?.[0];

  let batchMismatch = null;
  if (p0 && declared) {
    const ct0 = checkPassageContentTopic({ ...p0, topicTag: declared }, { level: 'A2', teil, module: mod });
    if (ct0.mismatch) {
      batchMismatch = {
        declared,
        detail: ct0.detail || ct0.reason,
        detected: ct0.detectedTopic,
        tagScore: ct0.tagScore,
        bestScore: ct0.bestScore,
      };
    }
  }

  const passageHits = [];
  for (const p of batch.passages || []) {
    const tag = batch.topicTag || p.topicTag;
    if (!tag) continue;
    const ct = checkPassageContentTopic({ ...p, topicTag: tag }, { level: 'A2', teil, module: mod });
    if (ct.mismatch) {
      passageHits.push({ id: p.id, detail: ct.detail || ct.reason, detected: ct.detectedTopic });
    }
  }

  const pool = isPartPoolReady(fp, { level: 'A2', failOn: 'none' });
  const ctReasons = (pool.details || []).filter((d) => /content_topic|topic_mismatch/.test(d.rule || ''));
  const poolReject = ctReasons.filter((r) => r.severity === 'reject');

  const contentText = allText(batch);
  const detectedFull = detectTopic(contentText, { level: 'A2' });

  if (batchMismatch) {
    external21.push({
      file,
      slug,
      mod,
      teil,
      declared,
      detected: batchMismatch.detected,
      detectedFull,
      officialFit: mapToOfficial(batchMismatch.detected) || mapToOfficial(detectedFull),
      detail: batchMismatch.detail,
      passageCount: passageHits.length,
    });
  }

  if (batchMismatch || passageHits.length || poolReject.length) {
    const row = {
      file,
      slug,
      mod,
      teil,
      declared,
      batchMismatch,
      detectedFull,
      passageCount: passageHits.length,
      poolReject: poolReject.map((r) => r.detail || r.rule),
      horenAuditOnly: horenAudit,
    };
    if (horenAudit && passageHits.length && !poolReject.length) auditOnly.push(row);
    else if (poolReject.length || (!horenAudit && passageHits.length)) blocking.push(row);
  }

  const hits = [];
  if (/Latecoming/i.test(contentText)) hits.push({ kind: 'Latecoming' });
  if (/Nachaltige/i.test(contentText)) hits.push({ kind: 'Nachaltige' });
  if (mod === 'horen') {
    for (const iss of findParticipleWithoutAuxiliaryIssues(contentText)) {
      if (/bestätigt/i.test(iss.context || iss.match || '')) hits.push({ kind: 'participle_no_aux', ...iss });
    }
  }
  for (const q of batch.questions || []) {
    if (/^Wichtig/.test(String(q.question || ''))) {
      hits.push({ kind: 'caps_adj', field: 'question', text: q.question });
    }
  }
  const bareGrammarIds = [];
  for (const q of batch.questions || []) {
    if (q.id && /^g-de-b1-/.test(q.id) && !/-[a-f0-9]{6,}/i.test(q.id)) bareGrammarIds.push(q.id);
  }
  for (const p of batch.passages || []) {
    if (p.id && /^g-de-b1-/.test(p.id) && !/-[a-f0-9]{6,}/i.test(p.id)) bareGrammarIds.push(p.id);
  }
  if (bareGrammarIds.length) hits.push({ kind: 'grammar_id_no_hash', ids: bareGrammarIds });

  if (hits.length) pointErrors.push({ file, hits });
}

const out = {
  scannedAt: new Date().toISOString(),
  totalFiles: files.length,
  external21Count: external21.length,
  external21,
  blockingCount: blocking.length,
  blocking,
  auditOnlyCount: auditOnly.length,
  pointErrors,
};

console.log(JSON.stringify(out, null, 2));
