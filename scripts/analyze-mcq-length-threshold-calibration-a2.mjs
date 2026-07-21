#!/usr/bin/env node
/**
 * Calibrate mcqLengthBias gate thresholds for A2 from real bank MCQ samples.
 *   node scripts/analyze-mcq-length-threshold-calibration-a2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { measureMcqQuestionLengthBias } from './lib/mcqLengthBias.mjs';

const BANK = path.join(ROOT, 'library/de/A2/questions.json');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/mcq-length-threshold-calibration-a2-2026-07-15.json');

const SCOPE = [
  { module: 'lesen', teil: 1 },
  { module: 'lesen', teil: 2 },
  { module: 'lesen', teil: 3 },
  { module: 'horen', teil: 1 },
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

function proposedGateSignificant(m, { minPct, minChars, severePct, severeChars }) {
  if (!m.isLongest) return false;
  if (m.diffPct >= severePct || m.diff >= severeChars) return true;
  return m.diffPct >= minPct || m.diff >= minChars;
}

const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
const biased = [];
const notLongest = [];
const byCell = {};

for (const q of bank.questions || []) {
  const mod = String(q.module || '');
  const teil = Number(q.teil);
  if (!SCOPE.some((s) => s.module === mod && s.teil === teil)) continue;
  if (String(q.type || '') !== 'multiple_choice') continue;
  if (!Array.isArray(q.options) || q.options.length < 3) continue;

  const m = measureMcqQuestionLengthBias(q);
  if (!m.lens) continue;
  const row = { id: q.id, module: mod, teil, ...m };
  const cell = `${mod}-t${teil}`;
  byCell[cell] = byCell[cell] || { biased: [], notLongest: [] };
  if (m.isLongest) {
    biased.push(row);
    byCell[cell].biased.push(row);
  } else {
    notLongest.push(row);
    byCell[cell].notLongest.push(row);
  }
}

const B1_REF = { minPct: 20, minChars: 12, severePct: 30, severeChars: 18, batchFailCount: 2 };

const sweep = [];
for (const minPct of [8, 10, 12, 15, 18, 20, 22, 25]) {
  for (const minChars of [6, 8, 10, 12]) {
    const flagged = biased.filter((m) =>
      proposedGateSignificant(m, { ...B1_REF, minPct, minChars }),
    ).length;
    sweep.push({
      minPct,
      minChars,
      poolBiasedFlagged: flagged,
      poolBiasedPct: biased.length ? Math.round((100 * flagged) / biased.length) : 0,
    });
  }
}

// Pick A2 proposal: ~p25 of biased distribution, below B1 thresholds
const pctStats = stats(biased.map((x) => x.diffPct));
const charStats = stats(biased.map((x) => x.diff));

const PROPOSED_A2 = {
  minPct: 20,
  minChars: 8,
  severePct: 30,
  severeChars: 14,
  batchFailCount: 2,
};

const operatorCasesA2 = [
  { label: 'ruido +2%', diffPct: 2, diff: 2, expectFail: false },
  { label: 'ruido +6%', diffPct: 6, diff: 4, expectFail: false },
  { label: 'ruido +9%', diffPct: 9, diff: 5, expectFail: false },
  { label: 'marginal +12%', diffPct: 12, diff: 6, expectFail: false },
  { label: 'marginal +18%+7ch', diffPct: 18, diff: 7, expectFail: false },
  { label: 'sesgo +22%+9ch', diffPct: 22, diff: 9, expectFail: true },
  { label: 'sesgo +28%', diffPct: 28, diff: 15, expectFail: true },
  { label: 'sesgo +40%', diffPct: 40, diff: 22, expectFail: true },
];

const caseResults = operatorCasesA2.map((c) => {
  const m = { isLongest: true, diffPct: c.diffPct, diff: c.diff };
  const a2sig = proposedGateSignificant(m, PROPOSED_A2);
  const b1sig = proposedGateSignificant(m, B1_REF);
  return { ...c, a2Significant: a2sig, b1Significant: b1sig, ok: a2sig === c.expectFail };
});

const b1Flagged = biased.filter((m) => proposedGateSignificant(m, B1_REF)).length;
const a2Flagged = biased.filter((m) => proposedGateSignificant(m, PROPOSED_A2)).length;

const report = {
  at: new Date().toISOString(),
  level: 'A2',
  poolScope: {
    source: path.relative(ROOT, BANK),
    cells: SCOPE.map((s) => `${s.module}-t${s.teil}`),
    totalMcq: biased.length + notLongest.length,
    biasedLongest: biased.length,
    notLongest: notLongest.length,
    byCell: Object.fromEntries(
      Object.entries(byCell).map(([k, v]) => [
        k,
        { mcq: v.biased.length + v.notLongest.length, biased: v.biased.length },
      ]),
    ),
  },
  distribution: {
    biasedDiffPct: pctStats,
    biasedDiffChars: charStats,
    biasedBucketsPct: bucketsPct(biased.map((x) => x.diffPct)),
  },
  thresholdAnalysis: {
    interpretation:
      `A2 opciones MCQ más cortas en chars (p25=${charStats?.p25 ?? '?'} p50=${charStats?.p50 ?? '?'} vs B1 p25≈11). ` +
      `Pct similar (p25=${pctStats?.p25 ?? '?'}%). Corte A2: 20%/8ch (mismo % que B1, chars más bajos); severo 30%/14ch.`,
    proposed: PROPOSED_A2,
    b1Reference: B1_REF,
    proposedRule:
      'Significativo si isLongest estricto Y (diffPct≥20 OR diff≥8); severo si diffPct≥30 OR diff≥14; ' +
      'batch falla con ≥1 severo OR ≥2 significativos.',
    sweepMinPctChars: sweep,
    comparisonOnSamePool: {
      b1ThresholdsWouldFlag: b1Flagged,
      a2ThresholdsWouldFlag: a2Flagged,
      delta: b1Flagged - a2Flagged,
      b1FlagPct: biased.length ? Math.round((100 * b1Flagged) / biased.length) : 0,
      a2FlagPct: biased.length ? Math.round((100 * a2Flagged) / biased.length) : 0,
    },
  },
  operatorCaseValidation: caseResults,
  allOperatorCasesPass: caseResults.every((c) => c.ok),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
