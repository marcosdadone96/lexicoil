/**
 * Test real: dateWeekdayGate vs 4 casos LT confirmados + controles negativos.
 *
 *   node scripts/test-date-weekday-gate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  findDateWeekdayMismatches,
  runDateWeekdayGate,
} from './lib/qualityGates/dateWeekdayGate.mjs';

const YEAR = 2026;

const CONFIRMED_BAD = [
  {
    id: 'pool-016',
    file: 'batches/ready/pool-verified/horen-t1-gemini-016.json',
    expectSpans: ['Montag, den 15. Mai'],
  },
  {
    id: 'staging-004-a',
    file: 'batches/ready/horen-t1-staging-2026-07-11/horen-t1-gemini-004.json',
    expectSpans: ['Dienstag, dem 15. Mai', 'Donnerstag, dem 20. Juni'],
  },
  {
    id: 'staging-005',
    file: 'batches/ready/horen-t1-staging-2026-07-11/horen-t1-gemini-005.json',
    expectSpans: ['Samstag, den 15. Juni'],
  },
];

/** Fechas correctas para 2026 (controles negativos sintéticos — el pool no tenía ninguna). */
const CORRECT_FIXTURES = [
  {
    id: 'ok-1',
    text: 'Die Anmeldung beginnt am Freitag, den 15. Mai. Bitte kommen Sie pünktlich.',
  },
  {
    id: 'ok-2',
    text: 'Wir haben am Samstag, dem 20. Juni, um 16 Uhr einen Besichtigungstermin.',
  },
  {
    id: 'ok-3',
    text: 'Das Fest findet am kommenden Montag, den 15. Juni, von 14 bis 18 Uhr statt.',
  },
  {
    id: 'ok-4',
    text: 'Am Dienstag, dem 12. Mai, wird das Wasser abgestellt.',
  },
  {
    id: 'ok-5',
    text: 'Treffpunkt ist am Donnerstag, den 18. Juni, vor dem Museum.',
  },
  {
    id: 'ok-6',
    text: 'Der Kurs startet am Mittwoch, dem 1. Juli, um 18 Uhr.',
  },
  {
    id: 'ok-7-no-weekday',
    text: 'Die Reparatur erfolgt am 15. Mai von 8 bis 12 Uhr. Kein Wochentag genannt.',
  },
  {
    id: 'ok-8-weekday-only',
    text: 'Am Montag haben wir geöffnet. Am Freitag ist Ruhetag.',
  },
];

function loadBatch(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function spansCovered(findings, expectSpans) {
  const joined = findings.map((f) => f.span || '').join(' || ');
  return expectSpans.map((s) => ({
    span: s,
    detected: findings.some((f) => String(f.span || '').includes(s.replace(/^am\s+/i, '')) || String(f.span || '').includes(s)),
    evidence: joined,
  }));
}

console.log(`=== dateWeekdayGate test (year=${YEAR}) ===\n`);

console.log('--- CONFIRMED BAD (4 LT cases across 3 files) ---');
let badPass = 0;
let badFail = 0;
const badCaseHits = [];

for (const caseInfo of CONFIRMED_BAD) {
  const batch = loadBatch(caseInfo.file);
  const verdict = runDateWeekdayGate(batch, { file: caseInfo.file, year: YEAR });
  const dateFindings = verdict.findings.filter((f) => f.rule === 'date_weekday_mismatch');
  const coverage = spansCovered(dateFindings, caseInfo.expectSpans);
  const allDetected = coverage.every((c) => c.detected);

  console.log(`\n[${caseInfo.id}] ${caseInfo.file}`);
  console.log(`  findings=${dateFindings.length} verdict=${verdict.verdict}`);
  for (const f of dateFindings) {
    console.log(`  · ${f.span} — ${f.detail}`);
    badCaseHits.push({ file: caseInfo.file, span: f.span, detail: f.detail });
  }
  for (const c of coverage) {
    console.log(`  expect «${c.span}»: ${c.detected ? 'DETECTED' : 'MISSING'}`);
  }
  if (allDetected) badPass++;
  else badFail++;
}

// Count unique confirmed calendar mismatches (passage-level LT cases = 4)
const uniquePassageMismatches = new Set();
for (const hit of badCaseHits) {
  // normalize dem/den for uniqueness of calendar fact
  const norm = String(hit.span)
    .replace(/\bde[mn]\b/i, 'den')
    .replace(/^am\s+/i, '');
  uniquePassageMismatches.add(`${path.basename(hit.file)}|${norm}`);
}

console.log('\n--- CORRECT / NEGATIVE CONTROLS ---');
let okPass = 0;
let okFail = 0;
for (const fx of CORRECT_FIXTURES) {
  const hits = findDateWeekdayMismatches(fx.text, { year: YEAR });
  const batchHits = runDateWeekdayGate(
    { passages: [{ id: fx.id, text: fx.text }], questions: [] },
    { file: fx.id, year: YEAR },
  );
  const n = hits.length;
  const ok = n === 0 && batchHits.findings.length === 0;
  console.log(`[${fx.id}] mismatches=${n} ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) {
    console.log(`  text: ${fx.text}`);
    for (const h of hits) console.log(`  · ${JSON.stringify(h)}`);
    okFail++;
  } else okPass++;
}

console.log('\n=== RESULT ===');
console.log(`Confirmed-bad files covered: ${badPass}/${CONFIRMED_BAD.length} (expect all)`);
console.log(`Unique mismatch spans detected: ${uniquePassageMismatches.size}`);
console.log([...uniquePassageMismatches].map((s) => `  - ${s}`).join('\n'));
console.log(`Negative controls: ${okPass}/${CORRECT_FIXTURES.length} clean`);
const exitCode = badFail === 0 && okFail === 0 && uniquePassageMismatches.size >= 4 ? 0 : 1;
console.log(`exit=${exitCode}`);
process.exit(exitCode);
