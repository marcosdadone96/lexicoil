#!/usr/bin/env node
/**
 * Hören T3 A2 — equivalencia pool-verified ↔ data/exams/de_A2.json (slots e2/e4).
 *   node scripts/verify-a2-horen-t3-pool-served.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { buildOverlayForAssembledFiles, assembledExamPath } from './lib/verifiedExamPublishLib.mjs';

const slots = [2, 4];
const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const served = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams/de_A2.json'), 'utf8'));

function horenT3FromServed(slot) {
  const examId = `official-de-A2-e${slot}`;
  const ex = served.find((e) => e.examId === examId || e.id === examId);
  if (!ex) return null;
  const part = (ex.horenParts || []).find((p) => Number(p.teil) === 3);
  return part || null;
}

function fingerprintPart(batch, rec) {
  const segs = batch.passages || [];
  const texts = segs.map((p) => String(p.text || p.transcript || '').trim()).join('\n---\n');
  const qIds = (batch.questions || []).map((q) => q.id).join('|');
  const recTexts =
    rec.segments?.map((s) => String(s.text || s.transcript || '').trim()).join('\n---\n') ||
    String(rec.passage?.text || rec.passage?.transcript || '');
  const recQ = (rec.questions || []).map((q) => q.id).join('|');
  return { texts, qIds, recTexts, recQ };
}

const assembledPaths = slots.map((s) => assembledExamPath(s, 'A2'));
const { records } = buildOverlayForAssembledFiles(assembledPaths, 'A2');
const checks = [];

for (const slot of slots) {
  const asm = JSON.parse(fs.readFileSync(assembledExamPath(slot, 'A2'), 'utf8'));
  const partId = asm._meta?.partIds?.horen_3;
  const rec = records.find((r) => r.id === partId);
  const resolved = partId?.match(/^horen-t3-gemini-(\d+)$/);
  const batchFile = resolved ? `horen-t3-gemini-${resolved[1]}.json` : `${partId}.json`;
  const batch = JSON.parse(fs.readFileSync(path.join(poolDir, batchFile), 'utf8'));
  const servedPart = horenT3FromServed(slot);
  const servedQs = servedPart?.questions || servedPart?.items || [];
  const fp = fingerprintPart(batch, rec || { questions: batch.questions, segments: batch.passages?.map((p) => ({ text: p.text })) });
  const servedText = (servedPart?.segments || servedPart?.passages || [])
    .map((s) => String(s.text || s.transcript || servedPart?.text || '').trim())
    .filter(Boolean)
    .join('\n---\n');
  const servedQIds = servedQs.map((q) => q.id).join('|');
  checks.push({
    slot,
    partId,
    poolFile: batchFile,
    questionIdsMatch: fp.qIds === servedQIds,
    poolQuestionIds: fp.qIds,
    servedQuestionIds: servedQIds,
    overlayQuestionIdsMatch: rec ? fp.qIds === fp.recQ : null,
    textMatch: fp.texts === servedText || fp.recTexts === servedText,
    servedHas039040: /horen-t3-gemini-0(39|40)/.test(JSON.stringify(servedPart || {})),
  });
}

const out = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-t3-pool-served-verify.json');
fs.writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), checks }, null, 2)}\n`, 'utf8');
const failed = checks.filter((c) => !c.questionIdsMatch || c.servedHas039040);
console.log(JSON.stringify({ checks, failed: failed.length, out: out.replace(/\\/g, '/') }, null, 2));
process.exitCode = failed.length ? 1 : 0;
