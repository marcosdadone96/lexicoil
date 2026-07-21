#!/usr/bin/env node
/**
 * Self-test: T3 situation fingerprint + excluded premises.
 *   node scripts/test-t3-group-fingerprint.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeT3SituationText,
  t3SituationFingerprintFromBatch,
  t3SituationFingerprintFromFile,
  scanReadyT3Stats,
  validateDistinctT3Fingerprints,
} from './lib/t3GroupFingerprint.mjs';
import {
  textMatchesExcludedPremise,
  subtypeMatchesExcludedPremise,
  buildExcludedPremisesPromptBlock,
} from './lib/excludedPremises.mjs';
import { getSubtypeById } from './lib/lesenSubtypeRotation.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  OK  ${label}`);
}

function fail(label, detail) {
  failed += 1;
  console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ''}`);
}

// ── normalize ──
if (normalizeT3SituationText('  Bei   Frau  Held  ') === 'bei frau held') {
  ok('normalizeT3SituationText collapses spaces + lowercase');
} else {
  fail('normalizeT3SituationText');
}

// ── same situations, different ads ──
const fA = path.join(ROOT, 'batches/ready/lesen/lesen-t3-auto-010.json');
const fB = path.join(ROOT, 'batches/ready/lesen/lesen-t3-auto-1xjvus.json');
if (fs.existsSync(fA) && fs.existsSync(fB)) {
  const fpA = t3SituationFingerprintFromFile(fA);
  const fpB = t3SituationFingerprintFromFile(fB);
  if (fpA && fpA === fpB) {
    ok(`same situation fp for 010/1xjvus (${fpA})`);
  } else {
    fail('010 vs 1xjvus should share situation fp', `${fpA} vs ${fpB}`);
  }
  if (fpA === '1f47d9341f48e7ce') {
    ok('known diagnostic fp 1f47d9341f48e7ce');
  } else {
    fail('expected fp 1f47d9341f48e7ce', fpA);
  }
} else {
  console.log('  skip  ready/ pair 010/1xjvus (files missing)');
}

// ── synthetic batch ──
const synth = {
  questions: [
    { question: 'Situation A' },
    { question: 'Situation B' },
    { question: 'Situation C' },
    { question: 'Situation D' },
    { question: 'Situation E' },
    { question: 'Situation F' },
    { question: 'Situation G' },
  ],
};
const synthFp = t3SituationFingerprintFromBatch(synth);
const synthShuffled = {
  questions: [...synth.questions].reverse(),
};
if (t3SituationFingerprintFromBatch(synthShuffled) === synthFp) {
  ok('order-independent fingerprint');
} else {
  fail('order-independent fingerprint');
}

// ── ready stats ──
const stats = scanReadyT3Stats(path.join(ROOT, 'batches/ready/lesen'));
if (stats.total >= 1) {
  ok(`scanReadyT3Stats: ${stats.total} T3, ${Object.keys(stats.bySituationFp).length} unique fps`);
} else {
  fail('scanReadyT3Stats expected T3 files in ready/');
}

// ── catalog validation ──
const dupCheck = validateDistinctT3Fingerprints([
  { examFile: 'a.json', t3SituationFp: 'abc' },
  { examFile: 'b.json', t3SituationFp: 'xyz' },
  { examFile: 'c.json', t3SituationFp: 'abc' },
]);
if (!dupCheck.ok && dupCheck.errors.length === 1) {
  ok('validateDistinctT3Fingerprints detects duplicate');
} else {
  fail('validateDistinctT3Fingerprints duplicate detection');
}

// ── excluded premises ──
if (textMatchesExcludedPremise('Im Gemeinschaftsgarten pflanzen wir Gemüse.')) {
  ok('textMatchesExcludedPremise gemeinschaftsgarten');
} else {
  fail('textMatchesExcludedPremise gemeinschaftsgarten');
}
if (!textMatchesExcludedPremise('Die Bibliothek hat neue Regeln.')) {
  ok('textMatchesExcludedPremise negative');
} else {
  fail('textMatchesExcludedPremise negative');
}
const park = getSubtypeById('park');
if (subtypeMatchesExcludedPremise(park)) {
  ok('park subtype matches excluded (gemeinschaftsgarten in keywords)');
} else {
  fail('park subtype should match excluded');
}
if (buildExcludedPremisesPromptBlock().includes('PROHIBIDO')) {
  ok('buildExcludedPremisesPromptBlock');
} else {
  fail('buildExcludedPremisesPromptBlock');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
