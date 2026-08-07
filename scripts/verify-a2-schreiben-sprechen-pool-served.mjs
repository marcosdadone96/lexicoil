#!/usr/bin/env node
/**
 * Verify pool-verified oral parts match data/exams/de_A2.json (published overlay path).
 *   node scripts/verify-a2-schreiben-sprechen-pool-served.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { buildOverlayForAssembledFiles, assembledExamPath } from './lib/verifiedExamPublishLib.mjs';

const level = 'A2';
const slots = [1, 2, 3, 4];
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const servedPath = path.join(ROOT, 'data/exams/de_A2.json');
const served = JSON.parse(fs.readFileSync(servedPath, 'utf8'));

const assembledPaths = slots.map((s) => assembledExamPath(s, level));
const { records } = buildOverlayForAssembledFiles(assembledPaths, level);

function findServedQuestion(examId, qid) {
  const ex = served.find((e) => e.examId === examId || e.id === examId);
  if (!ex) return null;
  for (const part of [...(ex.schreibenParts || []), ...(ex.sprechenParts || [])]) {
    for (const q of part.questions || []) {
      if (q.id === qid) return q;
    }
  }
  return null;
}

const checks = [];
for (const slot of slots) {
  const examId = `official-de-A2-e${slot}`;
  const asm = JSON.parse(fs.readFileSync(assembledExamPath(slot, level), 'utf8'));
  for (const [cell, partId] of Object.entries(asm._meta?.partIds || {})) {
    if (!/^(schreiben|sprechen)_/.test(cell)) continue;
    const rec = records.find((r) => r.id === partId);
    if (!rec) {
      checks.push({ slot, cell, partId, ok: false, error: 'overlay record missing' });
      continue;
    }
    const oral = partId.match(/^(schreiben|sprechen)-(.+)-t([123])$/i);
    if (!oral) continue;
    const batchFile = `${oral[1]}-${oral[2]}.json`;
    const batch = JSON.parse(fs.readFileSync(path.join(poolDir, batchFile), 'utf8'));
    const teil = Number(oral[3]);
    const poolQ = (batch.questions || []).find((q) => Number(q.teil) === teil);
    const overlayQ = (rec.questions || [])[0];
    const servedQ = poolQ ? findServedQuestion(examId, poolQ.id) : null;
    if (!poolQ || !overlayQ || !servedQ) {
      checks.push({ slot, cell, partId, ok: false, error: 'missing question row' });
      continue;
    }
    const poolTag = poolQ.topicTags?.[0] || poolQ.topicTag || '';
    const servedTag = servedQ.topicTags?.[0] || servedQ.topicTag || '';
    const explMatch = String(poolQ.explanation || '') === String(servedQ.explanation || '');
    const tagMatch = poolTag === servedTag;
    const qTextMatch = String(poolQ.question || '') === String(servedQ.question || '');
    checks.push({
      slot,
      cell,
      partId,
      qid: poolQ.id,
      ok: explMatch && tagMatch && qTextMatch,
      explanationMatch: explMatch,
      topicTagMatch: tagMatch,
      questionMatch: qTextMatch,
      poolTopicTag: poolTag,
      servedTopicTag: servedTag,
    });
  }
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-schreiben-sprechen-pool-served-verify.json');
fs.writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), checks }, null, 2)}\n`, 'utf8');
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ total: checks.length, failed: failed.length, out: out.replace(/\\/g, '/') }, null, 2));
if (failed.length) {
  console.log(JSON.stringify(failed.slice(0, 8), null, 2));
  process.exitCode = 1;
}
