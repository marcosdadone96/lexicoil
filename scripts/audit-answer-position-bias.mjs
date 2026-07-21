/**
 * Audit a/b/c answer-position bias in pool-verified MCQ parts.
 * Measurement only — does not modify content.
 *
 * Scope (content MCQ with interchangeable letter options):
 *   Lesen T2, Lesen T5, Hören T2
 *
 * Excluded:
 *   Hören T4 — matching attribution (Moderator / Guest A / Guest B). Letters
 *   label fixed speaker roles, not content distractors; letter bias would mean
 *   "who spoke" imbalance, a different phenomenon.
 *   Lesen T3 — matching A–H ads (not 3-way a/b/c content MCQ).
 *   Lesen T4 — Ja/Nein (2-way).
 *   Richtig/Falsch parts — binary, not a/b/c.
 *
 *   node scripts/audit-answer-position-bias.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';

const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const OUT = path.join(
  ROOT,
  'batches/ready/gate-logs/answer-position-bias-2026-07-11.json',
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
 * Normalize correct field to a|b|c or null.
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
 * @param {object} q
 */
function isContentMcq(q) {
  if (String(q.type || '') !== 'multiple_choice') return false;
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 3) return false;
  // Prefer classic 3-option a/b/c items
  const letters = opts.slice(0, 3).map((o) => {
    const t = typeof o === 'string' ? o : o?.text || '';
    const m = String(t).trim().match(/^([a-cA-C])\)/);
    return m ? m[1].toLowerCase() : null;
  });
  return letters[0] === 'a' && letters[1] === 'b' && letters[2] === 'c';
}

function emptyCounts() {
  return { a: 0, b: 0, c: 0, other: 0, total: 0 };
}

/**
 * @param {{ a: number, b: number, c: number, other: number, total: number }} counts
 */
function summarize(counts) {
  const n = counts.a + counts.b + counts.c;
  const expectedPct = n > 0 ? 100 / 3 : 0;
  const pct = (k) => (n > 0 ? (100 * counts[k]) / n : 0);
  const row = (k) => {
    const p = pct(k);
    return {
      count: counts[k],
      pct: round1(p),
      expectedPct: round1(expectedPct),
      deviationPp: round1(p - expectedPct),
    };
  };
  return {
    nScored: n,
    otherSkipped: counts.other,
    totalSeen: counts.total,
    a: row('a'),
    b: row('b'),
    c: row('c'),
    maxAbsDeviationPp: round1(
      Math.max(
        Math.abs(pct('a') - expectedPct),
        Math.abs(pct('b') - expectedPct),
        Math.abs(pct('c') - expectedPct),
      ),
    ),
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

const byPart = Object.fromEntries(PART_KEYS.map((k) => [k, emptyCounts()]));
const combined = emptyCounts();
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
    const bucket = byPart[part];
    bucket.total++;
    combined.total++;
    if (!letter) {
      bucket.other++;
      combined.other++;
      anomalies.push({
        file,
        part,
        qid: q.id || '?',
        reason: `unparseable correct=${JSON.stringify(q.correct ?? q.correctAnswer)}`,
      });
      continue;
    }
    bucket[letter]++;
    combined[letter]++;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  poolDir: 'batches/ready/pool-verified',
  scope: {
    included: [...PART_KEYS],
    excludedNote:
      'Hören T4 excluded: options are fixed speaker roles (Moderator/A/B), not content distractors. ' +
      'Letter bias there = attribution/turn imbalance, not classic MCQ position exploit.',
  },
  filesScanned,
  expectedUnderUniform: {
    letters: ['a', 'b', 'c'],
    pctEach: round1(100 / 3),
  },
  byPart: Object.fromEntries(
    PART_KEYS.map((k) => [k, { counts: byPart[k], summary: summarize(byPart[k]) }]),
  ),
  combined: { counts: combined, summary: summarize(combined) },
  anomalies,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

function printBlock(title, summary, counts) {
  console.log(`\n=== ${title} ===`);
  console.log(
    `n=${summary.nScored}` +
      (summary.otherSkipped ? ` (other skipped=${summary.otherSkipped})` : ''),
  );
  console.log(
    'letter | count | pct   | expected | deviation_pp',
  );
  for (const L of ['a', 'b', 'c']) {
    const r = summary[L];
    console.log(
      `${L.padEnd(6)} | ${String(r.count).padStart(5)} | ${String(r.pct).padStart(5)}% | ${String(r.expectedPct).padStart(8)}% | ${String(r.deviationPp).padStart(6)}`,
    );
  }
  console.log(`max |deviation| = ${summary.maxAbsDeviationPp} pp`);
  console.log('raw counts', counts);
}

printBlock('lesen-t2', report.byPart['lesen-t2'].summary, report.byPart['lesen-t2'].counts);
printBlock('lesen-t5', report.byPart['lesen-t5'].summary, report.byPart['lesen-t5'].counts);
printBlock('horen-t2', report.byPart['horen-t2'].summary, report.byPart['horen-t2'].counts);
printBlock('COMBINED', report.combined.summary, report.combined.counts);

console.log('\nFiles scanned:', filesScanned);
console.log('Anomalies:', anomalies.length);
console.log(`Wrote ${OUT}`);
