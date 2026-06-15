#!/usr/bin/env node
/** Strategy B pipeline — validate gate + curated publish smoke tests */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isCuratedEntry } from './pipeline/lib/provenance.js';
import { buildCompositeB1Exam } from './pipeline/lib/sampleB1.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const { strategyBEnabled, isLevelServable } = require(path.join(ROOT, 'js/engine/strategyBFlags.js'));
const { loadBlueprintFileSync, BLUEPRINT_INDEX } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

assert(strategyBEnabled() === false, 'STRATEGY_B global default OFF without subject/level');
assert(strategyBEnabled({ subject: 'de', level: 'B1' }) === isLevelServable('de', 'B1'), 'per-level Strategy B tracks servability');
process.env.STRATEGY_B = '1';
assert(strategyBEnabled() === true, 'STRATEGY_B env ON globally');
delete process.env.STRATEGY_B;

const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/B1/questions.json'), 'utf8'));
const bp = loadBlueprintFileSync(BLUEPRINT_INDEX.de_B1);
ExamBlueprint.cacheBlueprint('de', 'B1', bp);
const { exam, sourceBankIds } = buildCompositeB1Exam({ ExamBlueprint, ExamBuilder, bank, blueprint: bp, attempt: 42 });
assert(exam.lesenParts?.length >= 1 && exam.horenParts?.length >= 1, 'composite B1 assembles from servable bank');
assert(sourceBankIds.length > 0, 'composite tracks sourceBankIds');

const curatedFile = path.join(ROOT, 'library', 'curated', 'de_B1.json');
if (fs.existsSync(curatedFile)) {
  const index = JSON.parse(fs.readFileSync(curatedFile, 'utf8'));
  assert(index.length >= 1, `curated de_B1 index has ${index.length} entry/entries`);
  const first = index[0];
  const entry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'library', 'curated', 'de', 'B1', first.file), 'utf8'),
  );
  assert(isCuratedEntry(entry), 'curated entry has provenance');
  assert(entry.provenance?.cefrGate?.withinRange === true, 'curated entry passed CefrGate');
} else {
  console.log('WARN  no curated de_B1.json yet — run npm run pipeline:curate:b1');
}

console.log('\nStrategy B pipeline tests passed.');
