#!/usr/bin/env node
/**
 * Generation conformance gate (sin API).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import {
  buildConformanceRetryNote,
  gateBatchBeforeWrite,
} from './lib/generateConformanceGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'),
);

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const bad = normalizeBatch(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/_fixtures/horen-t4-bad-no-options.json'), 'utf8')),
);
const badGate = gateBatchBeforeWrite(bad, blueprint);
assert('batch malo bloqueado antes de escribir', !badGate.ok);
assert(
  'nota correctora incluye matching_missing_options',
  buildConformanceRetryNote(badGate.items).includes('matching_missing_options'),
);

const good = normalizeBatch(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'batches/merged/horen-t4-englischklasse-02.json'), 'utf8')),
);
const goodGate = gateBatchBeforeWrite(good, blueprint);
assert('batch bueno pasa gate', goodGate.ok);

console.log('\nGenerate conformance gate tests passed.\n');
