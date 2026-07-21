#!/usr/bin/env node
/**
 * Real probe: generate parts with exactly 2 explicit target words.
 * Measures integration via TargetUsage (same as userVocabFeedback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/loadEnv.mjs';
import { generateExamPartSingle } from './lib/generatePartGeminiLib.mjs';
import { generateLesenPart, createLesenFactorySession } from './generate-lesen-part-gemini.mjs';
import { computeVocabFeedback } from './lib/generationFeedback.mjs';

loadEnvFile();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/two-word-integration-probe-2026-07-13.json');

/** 5 probes: distinct topic pairs from B1 bank / CASE decks */
const PROBES = [
  { module: 'lesen', teil: 2, topic: 'Arbeit', words: ['gehalt', 'kollege'] },
  { module: 'lesen', teil: 3, topic: 'Umwelt', words: ['recycling', 'energie'] },
  { module: 'horen', teil: 2, topic: 'Reisen', words: ['urlaub', 'hotel'] },
  { module: 'horen', teil: 3, topic: 'Arbeit', words: ['bewerbung', 'firma'] },
  { module: 'lesen', teil: 2, topic: 'Gesundheit', words: ['arzt', 'therapie'] },
];

async function runProbe(probe, index) {
  const t0 = Date.now();
  const common = {
    topic: probe.topic,
    words: probe.words,
    fixRetries: 2,
    maxApiCalls: 20,
    keepFailed: true,
    pauseMs: 4000,
  };

  let result;
  if (probe.module === 'lesen') {
    const session = await createLesenFactorySession({
      teil: probe.teil,
      ...common,
    });
    result = await generateLesenPart({
      teil: probe.teil,
      session,
      ...common,
    });
  } else {
    result = await generateExamPartSingle({
      module: probe.module,
      teil: probe.teil,
      ...common,
    });
  }

  let feedback = null;
  if (result.ok && result.file) {
    const abs = path.isAbsolute(result.file) ? result.file : path.join(ROOT, result.file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const requested = probe.words;
    feedback = computeVocabFeedback(batch, requested, { topic: probe.topic, prompted: requested });
  }

  return {
    index,
    ...probe,
    ok: !!result.ok,
    file: result.file || null,
    reason: result.reason || null,
    apiCalls: result.apiCalls,
    ms: Date.now() - t0,
    requested: probe.words.length,
    used: feedback?.used?.length ?? null,
    usedWords: feedback?.used ?? null,
    notUsed: feedback?.notUsed ?? null,
    bothHit: feedback ? feedback.used.length >= 2 : false,
    ratio: feedback?.ratio ?? null,
  };
}

console.log('Probe: 2-word explicit target integration (5 parts)\n');

const results = [];
for (let i = 0; i < PROBES.length; i++) {
  console.log(`[${i + 1}/${PROBES.length}] ${PROBES[i].module} T${PROBES[i].teil} ${PROBES[i].topic}: ${PROBES[i].words.join(', ')}`);
  const row = await runProbe(PROBES[i], i);
  results.push(row);
  const mark = row.bothHit ? 'OK 2/2' : row.ok ? `PARTIAL ${row.used}/2` : 'FAIL';
  console.log(`   → ${mark} · apiCalls=${row.apiCalls} · ${(row.ms / 1000).toFixed(0)}s\n`);
}

const okRows = results.filter((r) => r.ok);
const both = okRows.filter((r) => r.bothHit);
const summary = {
  generatedAt: new Date().toISOString(),
  probes: results,
  okCount: okRows.length,
  bothHitCount: both.length,
  bothHitRateOnOk: okRows.length ? both.length / okRows.length : null,
  avgUsedOnOk: okRows.length
    ? okRows.reduce((s, r) => s + (r.used || 0), 0) / okRows.length
    : null,
  totalApiCalls: results.reduce((s, r) => s + (r.apiCalls || 0), 0),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('Summary:', JSON.stringify(summary, null, 2));
console.log('Written:', OUT);
