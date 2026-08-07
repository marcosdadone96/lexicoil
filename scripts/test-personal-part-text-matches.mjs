#!/usr/bin/env node
/**
 * Golden tests — scorePersonalPartTextMatches (Phase 1).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  scorePersonalPartTextMatches,
} = require(path.join(ROOT, 'netlify/functions/lib/personalPartTextMatches.js'));
const { planDecisionFromText } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

assert('planDecisionFromText re-export', planDecisionFromText(3, 3) === 'serve_now');
assert('planDecisionFromText partial', planDecisionFromText(2, 3) === 'serve_partial');
assert('planDecisionFromText reject', planDecisionFromText(0, 3) === 'reject');

const seed = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'),
);
const m15Part = (seed.records || []).find((r) => r.id === 'horen-t3-gemini-027');
assert('M15 golden part exists', !!m15Part?.passage || !!m15Part?.segments);

const m15Words = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];
const hit = scorePersonalPartTextMatches(m15Part, m15Words, { lang: 'de', level: 'B1' });
console.log('INFO: M15 part text matches', hit.count, hit.words);
assert('M15 golden >=3 text matches', hit.count >= 3);

const simReport = path.join(
  ROOT,
  'batches/ready/gate-logs/personal-vocab-threshold3-text-2026-07-28.json',
);
if (fs.existsSync(simReport)) {
  const sim = JSON.parse(fs.readFileSync(simReport, 'utf8'));
  const m15 = (sim.caseResults || []).find((c) => c.id === 'M15');
  if (m15) {
    assert(
      'sim JSON M15 assemblyTextGte3',
      m15.assemblyTextGte3 === true && m15.assemblyTextUnion >= 3,
    );
  }
}

console.log('\nAll personal-part-text-matches tests passed.');
