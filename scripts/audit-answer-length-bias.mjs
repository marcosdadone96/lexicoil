/**
 * Audit correct-vs-distractor length bias in pool-verified MCQ parts.
 * Measurement only — does not modify content.
 *
 * Scope (same as answer-position bias):
 *   Lesen T2, Lesen T5, Hören T2
 *
 * Excluded:
 *   Hören T4 — fixed speaker-role labels, not content distractors.
 *   Other parts — not 3-way a/b/c content MCQ.
 *
 *   node scripts/audit-answer-length-bias.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/answer-length-bias-2026-07-11.json',
);

/** @typedef {'lesen-t2'|'lesen-t5'|'horen-t2'} PartKey */

const PART_KEYS = /** @type {const} */ (['lesen-t2', 'lesen-t5', 'horen-t2']);

/**
 * @param {string} filename
 * @returns {PartKey|null}
 */
function classifyFile(filename) {
  const base = filename.toLowerCase();
  if (base.startsWith('lesen-t2-')) return 'lesen-t2';
  if (base.startsWith('lesen-t5-')) return 'lesen-t5';
  if (base.startsWith('horen-t2-')) return 'horen-t2';
  return null;
}

/**
 * @param {object} q
 * @returns {'a'|'b'|'c'|null}
 */
function correctLetter(q) {
  const raw = String(q.correct ?? q.correctAnswer ?? '')
    .trim()
    .toLowerCase();
  const m = raw.match(/^[abc]/);
  return m ? /** @type {'a'|'b'|'c'} */ (m[0]) : null;
}

/**
 * Strip leading "a) " / "b)" / "c) " (optional space) from option text.
 * @param {unknown} opt
 * @returns {string}
 */
function optionBody(opt) {
  const t = typeof opt === 'string' ? opt : opt?.text || '';
  return String(t)
    .replace(/^\s*[a-cA-C]\)\s*/, '')
    .trim();
}

/**
 * @param {object} q
 */
function isContentMcq(q) {
  if (String(q.type || '') !== 'multiple_choice') return false;
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 3) return false;
  const letters = opts.slice(0, 3).map((o) => {
    const t = typeof o === 'string' ? o : o?.text || '';
    const m = String(t).trim().match(/^([a-cA-C])\)/);
    return m ? m[1].toLowerCase() : null;
  });
  return letters[0] === 'a' && letters[1] === 'b' && letters[2] === 'c';
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function emptyAgg() {
  return {
    n: 0,
    sumDiffChars: 0,
    sumDiffPct: 0,
    correctLongest: 0,
    correctShortest: 0,
    correctMid: 0,
    allEqual: 0,
    tiesForLongest: 0,
    tiesForShortest: 0,
    skipped: 0,
  };
}

/**
 * @param {ReturnType<typeof emptyAgg>} agg
 */
function summarize(agg) {
  const n = agg.n;
  const meanDiffChars = n > 0 ? agg.sumDiffChars / n : 0;
  const meanDiffPct = n > 0 ? agg.sumDiffPct / n : 0;
  const pct = (k) => (n > 0 ? (100 * agg[k]) / n : 0);
  return {
    n,
    skipped: agg.skipped,
    meanDiffChars: round1(meanDiffChars),
    meanDiffPctVsWrongAvg: round1(meanDiffPct),
    correctIsLongest: {
      count: agg.correctLongest,
      pct: round1(pct('correctLongest')),
      expectedByChancePct: round1(100 / 3),
      deviationPp: round1(pct('correctLongest') - 100 / 3),
    },
    correctIsShortest: {
      count: agg.correctShortest,
      pct: round1(pct('correctShortest')),
      expectedByChancePct: round1(100 / 3),
      deviationPp: round1(pct('correctShortest') - 100 / 3),
    },
    correctIsMid: {
      count: agg.correctMid,
      pct: round1(pct('correctMid')),
    },
    allEqualLength: {
      count: agg.allEqual,
      pct: round1(pct('allEqual')),
    },
    ties: {
      forLongest: agg.tiesForLongest,
      forShortest: agg.tiesForShortest,
    },
  };
}

/**
 * Rank correct among 3 lengths.
 * - All three equal → no length cue (neither longest nor shortest).
 * - Else if correct shares the max length → longest (tie with distractor still
 *   supports "pick the longest" for that item).
 * - Else if correct shares the min → shortest.
 * - Else → mid.
 * @param {number} correctLen
 * @param {number[]} allLens
 */
function rankCorrect(correctLen, allLens) {
  const max = Math.max(...allLens);
  const min = Math.min(...allLens);
  if (max === min) {
    return {
      isLongest: false,
      isShortest: false,
      isMid: false,
      allEqual: true,
      tieLongest: false,
      tieShortest: false,
    };
  }
  const nAtMax = allLens.filter((x) => x === max).length;
  const nAtMin = allLens.filter((x) => x === min).length;
  const isLongest = correctLen === max;
  const isShortest = correctLen === min;
  return {
    isLongest,
    isShortest,
    isMid: !isLongest && !isShortest,
    allEqual: false,
    tieLongest: isLongest && nAtMax > 1,
    tieShortest: isShortest && nAtMin > 1,
  };
}

const byPart = Object.fromEntries(PART_KEYS.map((k) => [k, emptyAgg()]));
const combined = emptyAgg();
const filesScanned = { lesen_t2: 0, lesen_t5: 0, horen_t2: 0, skipped: 0 };
/** @type {{ file: string, part: string, qid: string, reason: string }[]} */
const anomalies = [];

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();

for (const file of files) {
  const part = classifyFile(file);
  if (!part) {
    filesScanned.skipped++;
    continue;
  }
  if (part === 'lesen-t2') filesScanned.lesen_t2++;
  if (part === 'lesen-t5') filesScanned.lesen_t5++;
  if (part === 'horen-t2') filesScanned.horen_t2++;

  const data = JSON.parse(fs.readFileSync(path.join(POOL, file), 'utf8'));
  for (const q of data.questions || []) {
    if (!isContentMcq(q)) continue;
    const letter = correctLetter(q);
    const buckets = [byPart[part], combined];
    if (!letter) {
      for (const b of buckets) b.skipped++;
      anomalies.push({
        file,
        part,
        qid: q.id || '?',
        reason: `unparseable correct=${JSON.stringify(q.correct ?? q.correctAnswer)}`,
      });
      continue;
    }

    const bodies = q.options.slice(0, 3).map(optionBody);
    const lens = bodies.map((t) => t.length);
    const letterIdx = { a: 0, b: 1, c: 2 }[letter];
    const correctLen = lens[letterIdx];
    const wrongLens = lens.filter((_, i) => i !== letterIdx);
    const wrongAvg = (wrongLens[0] + wrongLens[1]) / 2;
    const diffChars = correctLen - wrongAvg;
    const diffPct = wrongAvg > 0 ? (100 * diffChars) / wrongAvg : 0;

    const rank = rankCorrect(correctLen, lens);

    for (const b of buckets) {
      b.n++;
      b.sumDiffChars += diffChars;
      b.sumDiffPct += diffPct;
      if (rank.allEqual) b.allEqual++;
      if (rank.isLongest) b.correctLongest++;
      if (rank.isShortest) b.correctShortest++;
      if (rank.isMid) b.correctMid++;
      if (rank.tieLongest) b.tiesForLongest++;
      if (rank.tieShortest) b.tiesForShortest++;
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  poolDir: 'batches/ready/pool-verified',
  scope: {
    included: [...PART_KEYS],
    excludedNote:
      'Hören T4 excluded: options are fixed speaker roles, not content distractors. ' +
      'Same scope as audit-answer-position-bias.mjs.',
  },
  method: {
    lengthUnit: 'characters of option body after stripping leading a)/b)/c) prefix',
    diff: 'correctLen - mean(wrong1, wrong2)',
    diffPct: '100 * diff / mean(wrong1, wrong2)',
    longestShortest:
      'correct counted as longest/shortest if its length equals max/min among the 3 (ties included)',
    chanceBaselineLongestShortestPct: round1(100 / 3),
  },
  filesScanned,
  byPart: Object.fromEntries(
    PART_KEYS.map((k) => [k, { raw: byPart[k], summary: summarize(byPart[k]) }]),
  ),
  combined: { raw: combined, summary: summarize(combined) },
  anomalies,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

function printBlock(title, summary) {
  console.log(`\n=== ${title} ===`);
  console.log(`n=${summary.n}` + (summary.skipped ? ` (skipped=${summary.skipped})` : ''));
  console.log(
    `mean Δ chars (correct − wrongAvg): ${summary.meanDiffChars}`,
  );
  console.log(
    `mean Δ % vs wrongAvg:              ${summary.meanDiffPctVsWrongAvg}%`,
  );
  console.log(
    `correct is LONGEST:  ${summary.correctIsLongest.count}/${summary.n} = ${summary.correctIsLongest.pct}%` +
      ` (chance ~${summary.correctIsLongest.expectedByChancePct}%, Δ ${summary.correctIsLongest.deviationPp} pp)`,
  );
  console.log(
    `correct is SHORTEST: ${summary.correctIsShortest.count}/${summary.n} = ${summary.correctIsShortest.pct}%` +
      ` (chance ~${summary.correctIsShortest.expectedByChancePct}%, Δ ${summary.correctIsShortest.deviationPp} pp)`,
  );
  console.log(
    `correct is MID:      ${summary.correctIsMid.count}/${summary.n} = ${summary.correctIsMid.pct}%`,
  );
  if (summary.allEqualLength.count) {
    console.log(
      `all 3 equal length:   ${summary.allEqualLength.count}/${summary.n} = ${summary.allEqualLength.pct}%`,
    );
  }
  if (summary.ties.forLongest || summary.ties.forShortest) {
    console.log(
      `ties (shared max/min): longest=${summary.ties.forLongest}, shortest=${summary.ties.forShortest}`,
    );
  }
}

printBlock('lesen-t2', report.byPart['lesen-t2'].summary);
printBlock('lesen-t5', report.byPart['lesen-t5'].summary);
printBlock('horen-t2', report.byPart['horen-t2'].summary);
printBlock('COMBINED', report.combined.summary);

console.log('\nFiles scanned:', filesScanned);
console.log('Anomalies:', anomalies.length);
console.log(`Wrote ${OUT}`);
