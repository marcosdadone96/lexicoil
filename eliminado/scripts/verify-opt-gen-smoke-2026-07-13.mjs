#!/usr/bin/env node
/**
 * Post-opt generation smoke: first-attempt fail rate for Hören T2 + Schreiben.
 * Run: NODE_OPTIONS=--use-system-ca node scripts/verify-opt-gen-smoke-2026-07-13.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { runExamGenerator } from './lib/generatePartGeminiLib.mjs';

loadEnvFile();

const TOPICS_H2 = ['Gesundheit', 'Kultur', 'Freizeit', 'Arbeit', 'Wohnen'];
const TOPICS_SCH = ['Konsum', 'Arbeit', 'Familie'];

async function runBatch(module, teil, topics, count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length];
    const argv = [
      '--module', module,
      '--teil', String(teil),
      '--topic', topic,
      '--count', '1',
      '--from-coverage',
      '--max-api-calls', '25',
      '--fix-retries', '2',
      '--write-file',
    ];
    const { exitCode, results } = await runExamGenerator(argv);
    const r = results?.[0] || {};
    rows.push({
      topic,
      ok: !!r.ok,
      attempts: r.attempts ?? null,
      firstPass: !!(r.ok && (r.attempts === 1 || r.genCalls === 1)),
      genCalls: r.genCalls ?? r.apiCalls ?? null,
      reason: r.reason || null,
      file: r.file || null,
    });
  }
  return rows;
}

const h2 = await runBatch('horen', 2, TOPICS_H2, 5);
const sch = await runBatch('schreiben', 1, TOPICS_SCH, 3);

const summarize = (rows) => {
  const n = rows.length;
  const ok = rows.filter((r) => r.ok).length;
  const firstPass = rows.filter((r) => r.firstPass).length;
  const firstFail = rows.filter((r) => !r.ok || !r.firstPass).length;
  return { n, ok, firstPass, firstPassRate: n ? firstPass / n : 0, firstFailRate: n ? firstFail / n : 0 };
};

const out = {
  generatedAt: new Date().toISOString(),
  baselineTodayFirstFailRate: 0.79,
  horenT2: { summary: summarize(h2), rows: h2 },
  schreiben: { summary: summarize(sch), rows: sch },
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/verify-opt-gen-smoke-2026-07-13.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
