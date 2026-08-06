#!/usr/bin/env node
/**
 * Parse today's generate-cli Hören T2 logs — compare strict vs gated length bias.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  LENGTH_BIAS_BATCH_FAIL_COUNT,
  LENGTH_BIAS_MIN_CHARS,
  LENGTH_BIAS_MIN_PCT,
  LENGTH_BIAS_SEVERE_CHARS,
  LENGTH_BIAS_SEVERE_PCT,
  measureMcqQuestionLengthBias,
} from './lib/mcqLengthBias.mjs';

const LOGS = [
  'C:/Users/marco/.cursor/projects/c-Users-marco-Desktop-MDR-lexiloop/terminals/763187.txt',
  'C:/Users/marco/.cursor/projects/c-Users-marco-Desktop-MDR-lexiloop/terminals/763188.txt',
];

function parseLengthFailures(text) {
  const re =
    /sesgo de longitud MCQ — opción correcta «[abc]» es la más larga \((\d+) vs (\d+\/\d+); Δ \+(\d+) chars, \+(\d+)% vs media distractores\)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      diff: Number(m[3]),
      diffPct: Number(m[4]),
    });
  }
  return out;
}

function wouldPassGate({ diff, diffPct }) {
  const significant = diffPct >= LENGTH_BIAS_MIN_PCT || diff >= LENGTH_BIAS_MIN_CHARS;
  const severe = diffPct >= LENGTH_BIAS_SEVERE_PCT || diff >= LENGTH_BIAS_SEVERE_CHARS;
  return !significant && !severe;
}

function main() {
  let blob = '';
  for (const log of LOGS) {
    if (fs.existsSync(log)) blob += fs.readFileSync(log, 'utf8');
  }

  const attempts = [...blob.matchAll(/── horen T2 · intento \d+ · OK \d+\/4 ──/g)].length;
  const qualityOk = [...blob.matchAll(/Calidad Hören T2: OK/g)].length;
  const published = [...blob.matchAll(/poolReady.*horen-t2-gemini-0(28|29)/g)].length;
  const lengthFails = parseLengthFailures(blob);

  const marginalSaved = lengthFails.filter((x) => wouldPassGate(x));
  const stillFail = lengthFails.filter((x) => !wouldPassGate(x));

  const uniqueMarginal = marginalSaved.length;
  const uniqueStillFail = stillFail.length;

  const lastFailByAttempt = [...blob.matchAll(/⚠ Falló \(generate\): ([^\n]+)/g)].map((m) => m[1]);
  const lengthOnlyLast = lastFailByAttempt.filter((line) => line.includes('sesgo de longitud MCQ'));
  const lengthOnlyMarginalLast = lengthOnlyLast.filter((line) => {
    const m = line.match(/Δ \+(\d+) chars, \+(\d+)%/);
    if (!m) return false;
    return wouldPassGate({ diff: Number(m[1]), diffPct: Number(m[2]) });
  });

  const report = {
    at: new Date().toISOString(),
    proposal: {
      minPct: LENGTH_BIAS_MIN_PCT,
      minChars: LENGTH_BIAS_MIN_CHARS,
      severePct: LENGTH_BIAS_SEVERE_PCT,
      severeChars: LENGTH_BIAS_SEVERE_CHARS,
      batchFailCount: LENGTH_BIAS_BATCH_FAIL_COUNT,
      note:
        'Gate fails if ≥1 severe OR ≥2 significant; ties (correct not strictly longest) ignored.',
    },
    oldGate: {
      rule: 'correctLen === max (zero tolerance, incl. +1 char / +1%)',
    },
    logStats: {
      attempts,
      qualityOkPasses: qualityOk,
      published028029: published,
      lengthBiasTerminalFailures: lengthFails.length,
      uniqueLengthFailQuestions: lengthFails.length,
      marginalWouldPassNewGate: uniqueMarginal,
      stillFailNewGate: uniqueStillFail,
      lastFailureLengthOnly: lengthOnlyLast.length,
      lastFailureLengthOnlyMarginal: lengthOnlyMarginalLast.length,
      pctMarginalOfLengthFails: lengthFails.length
        ? Math.round((100 * marginalSaved.length) / lengthFails.length)
        : 0,
    },
    examplesMarginal: marginalSaved.slice(0, 8),
    examplesStillFail: stillFail.slice(0, 8),
  };

  const out = path.join(ROOT, 'batches/ready/gate-logs/mcq-length-bias-threshold-analysis-2026-07-13.json');
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
