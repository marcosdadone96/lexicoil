#!/usr/bin/env node
/**
 * Calibrate mcqLengthBias gate from pool + today's logs (no API).
 *   node scripts/analyze-mcq-length-threshold-calibration.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { measureMcqQuestionLengthBias } from './lib/mcqLengthBias.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/mcq-length-threshold-calibration-2026-07-13.json');
const LOGS = [
  'C:/Users/marco/.cursor/projects/c-Users-marco-Desktop-MDR-lexiloop/terminals/763187.txt',
  'C:/Users/marco/.cursor/projects/c-Users-marco-Desktop-MDR-lexiloop/terminals/763188.txt',
];

function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const p = (q) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
  return {
    n: v.length,
    min: v[0],
    p25: p(0.25),
    p50: p(0.5),
    p75: p(0.75),
    p90: p(0.9),
    max: v[v.length - 1],
    mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
  };
}

function bucketsPct(arr) {
  const b = { '0-9': 0, '10-14': 0, '15-19': 0, '20-29': 0, '30-39': 0, '40+': 0 };
  for (const p of arr) {
    if (p < 10) b['0-9']++;
    else if (p < 15) b['10-14']++;
    else if (p < 20) b['15-19']++;
    else if (p < 30) b['20-29']++;
    else if (p < 40) b['30-39']++;
    else b['40+']++;
  }
  return b;
}

/** Original gate (2026-07-13 incident): any strict/tie longest → fail */
function oldGateFail(m) {
  return m.isLongest === true;
}

/** Proposed gate */
function proposedGateSignificant(m, { minPct = 20, minChars = 12, severePct = 30, severeChars = 18 } = {}) {
  if (!m.isLongest) return false;
  if (m.diffPct >= severePct || m.diff >= severeChars) return true;
  return m.diffPct >= minPct || m.diff >= minChars;
}

function proposedBatchFail(items, opts) {
  const sig = items.filter((m) => proposedGateSignificant(m, opts));
  const severe = sig.filter(
    (m) => m.diffPct >= opts.severePct || m.diff >= opts.severeChars,
  );
  return severe.length >= 1 || sig.length >= 2;
}

const parts = ['lesen-t2', 'lesen-t5', 'horen-t2'];
const biased = [];
const notLongest = [];

for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.json')).sort()) {
  if (!parts.some((p) => f.startsWith(p))) continue;
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
  for (const q of batch.questions || []) {
    const m = measureMcqQuestionLengthBias(q);
    if (!m.lens) continue;
    const row = { file: f, id: q.id, ...m };
    if (m.isLongest) biased.push(row);
    else notLongest.push(row);
  }
}

let logBlob = '';
for (const l of LOGS) if (fs.existsSync(l)) logBlob += fs.readFileSync(l, 'utf8');
const logFlags = [...logBlob.matchAll(/Δ \+(\d+) chars, \+(\d+)% vs media distractores/g)].map((m) => ({
  diff: Number(m[1]),
  diffPct: Number(m[2]),
}));

const PROPOSED = { minPct: 20, minChars: 12, severePct: 30, severeChars: 18, batchFailCount: 2 };

const sweep = [10, 15, 18, 20, 22, 25, 30].map((minPct) => {
  const poolFlagged = biased.filter((m) => proposedGateSignificant(m, { ...PROPOSED, minPct })).length;
  const logFlagged = logFlags.filter((m) => proposedGateSignificant(m, { ...PROPOSED, minPct })).length;
  return { minPct, poolBiasedFlagged: poolFlagged, poolBiasedPct: Math.round((100 * poolFlagged) / biased.length), logFlagsFlagged: logFlagged, logFlagsPct: Math.round((100 * logFlagged) / logFlags.length) };
});

const operatorCases = [
  { label: 'ruido +2%', diffPct: 2, diff: 2, expectFail: false },
  { label: 'ruido +6%', diffPct: 6, diff: 4, expectFail: false },
  { label: 'ruido +9%', diffPct: 9, diff: 5, expectFail: false },
  { label: 'ruido +15%', diffPct: 15, diff: 8, expectFail: false },
  { label: 'sesgo +22%', diffPct: 22, diff: 12, expectFail: true },
  { label: 'sesgo +35%', diffPct: 35, diff: 20, expectFail: true },
  { label: 'sesgo +41%', diffPct: 41, diff: 25, expectFail: true },
  { label: 'sesgo +98%', diffPct: 98, diff: 62, expectFail: true },
];

const caseResults = operatorCases.map((c) => {
  const m = { isLongest: true, diffPct: c.diffPct, diff: c.diff };
  return {
    ...c,
    oldGate: oldGateFail(m),
    proposedSignificant: proposedGateSignificant(m, PROPOSED),
    ok: proposedGateSignificant(m, PROPOSED) === c.expectFail,
  };
});

const report = {
  at: new Date().toISOString(),
  originalGateLogic: {
    rule: 'correctLen === max (incl. empates) → bad=true, sin umbral de % ni chars',
    zeroTolerance: true,
    note: 'Causó 689 flags en logs hoy; muchos +1–15% eran ruido de reintentos',
  },
  currentFileState: {
    note: 'mcqLengthBias.mjs ya tenía borrador tolerante (20%/10chars); esta calibración lo confirma/ajusta',
  },
  poolScope: { parts, totalMcq: biased.length + notLongest.length, biasedLongest: biased.length, notLongest: notLongest.length },
  distribution: {
    biasedDiffPct: stats(biased.map((x) => x.diffPct)),
    biasedDiffChars: stats(biased.map((x) => x.diff)),
    biasedBucketsPct: bucketsPct(biased.map((x) => x.diffPct)),
    logTodayDiffPct: stats(logFlags.map((x) => x.diffPct)),
    logTodayBucketsPct: bucketsPct(logFlags.map((x) => x.diffPct)),
    quarantineStamped2026_07_12: 196,
  },
  thresholdAnalysis: {
    interpretation:
      'Entre ítems con correcta estrictamente más larga, p25 pool=22% y p50=38%. ' +
      'Logs hoy: 48% de flags <20% (ruido). Corte natural ≈20%: bajo p25 histórico, encima del cluster 0–15% del operador.',
    proposed: PROPOSED,
    proposedRule:
      'Significativo si isLongest estricto Y (diffPct≥20 OR diff≥12); severo si diffPct≥30 OR diff≥18; ' +
      'batch falla con ≥1 severo OR ≥2 significativos.',
    sweepMinPct: sweep,
    oldVsProposedOnLog: {
      oldWouldFlag: logFlags.length,
      proposedWouldFlagSignificant: logFlags.filter((m) =>
        proposedGateSignificant({ isLongest: true, ...m }, PROPOSED),
      ).length,
      reductionPct: Math.round(
        (100 *
          (logFlags.length -
            logFlags.filter((m) => proposedGateSignificant({ isLongest: true, ...m }, PROPOSED)).length)) /
          logFlags.length,
      ),
    },
  },
  operatorCaseValidation: caseResults,
  allOperatorCasesPass: caseResults.every((c) => c.ok),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
