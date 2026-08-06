/**
 * qualityGates/__tests__/qualityGates.test.mjs
 * Run: node scripts/lib/qualityGates/__tests__/qualityGates.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t3MatchingFingerprint } from '../dedupCorpus.mjs';
import { runDuplicateContentGate } from '../duplicateContentGate.mjs';
import { runPassageCoherenceGate } from '../passageCoherenceGate.mjs';
import { runMetadataSchemaGate } from '../metadataSchemaGate.mjs';
import { buildDedupCorpus } from '../dedupCorpus.mjs';
import { ROOT } from '../../loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEN = path.join(ROOT, 'batches/generated');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(GEN, name), 'utf8'));
}

function testT3FingerprintEqual() {
  const a = load('lesen-t3-auto-qeh7ew.json');
  const b = load('lesen-t3-auto-tz7n7y.json');
  const fpA = t3MatchingFingerprint(a);
  const fpB = t3MatchingFingerprint(b);
  assert.ok(fpA, 'fpA');
  assert.equal(fpA, fpB, 'qeh7ew y tz7n7y deben compartir fingerprint T3');
}

function testT3DupDetect() {
  const qeh = load('lesen-t3-auto-qeh7ew.json');
  const tz = load('lesen-t3-auto-tz7n7y.json');
  const corpus = buildDedupCorpus({
    dirs: [GEN],
    excludeSources: ['batches/generated/lesen-t3-auto-qeh7ew.json'],
  });
  const v = runDuplicateContentGate(qeh, {
    file: 'batches/generated/lesen-t3-auto-qeh7ew.json',
    selfSource: 'batches/generated/lesen-t3-auto-qeh7ew.json',
    corpus,
    index: corpus.index,
  });
  assert.equal(v.verdict, 'block');
  assert.ok(v.findings.some((f) => f.rule === 'near_duplicate' && /tz7n7y/.test(f.detail)));
}

function testMarkdownBlock() {
  const batch = load('lesen-t5-gemini-063.json');
  const v = runPassageCoherenceGate(batch, { file: 'lesen-t5-gemini-063.json' });
  assert.equal(v.verdict, 'block');
  assert.ok(v.findings.some((f) => f.rule === 'markdown_leak'));
}

function testMetadataGeneratedProfile() {
  const batch = load('lesen-t3-auto-qeh7ew.json');
  const v = runMetadataSchemaGate(batch, { profile: 'generated' });
  assert.ok(['pass', 'warn'].includes(v.verdict), `unexpected ${v.verdict}`);
}

let passed = 0;
const tests = [
  ['T3 fingerprint equal qeh7ew↔tz7n7y', testT3FingerprintEqual],
  ['T3 dup detect block', testT3DupDetect],
  ['t5-063 markdown block', testMarkdownBlock],
  ['metadata generated profile', testMetadataGeneratedProfile],
];

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
