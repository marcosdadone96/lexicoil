#!/usr/bin/env node
/**
 * Blueprint assembly smoke test (Node).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

for (const [lang, level, bpFile] of [
  ['de', 'B1', 'goethe_B1'],
  ['de', 'B2', 'goethe_B2'],
  ['en', 'B2', 'cambridge_B2'],
  ['en', 'C1', 'cambridge_C1'],
  ['es', 'B2', 'dele_B2'],
  ['es', 'C1', 'dele_C1'],
]) {
  const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints', `${bpFile}.json`), 'utf8'));
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
  ExamBlueprint.cacheBlueprint(lang, level, blueprint);

  const assembled = ExamBlueprint.assemble(bank, blueprint);
  assert(`${lang} ${level} lesen parts`, assembled.lesenParts.length >= 1);
  assert(`${lang} ${level} horen parts`, assembled.horenParts.length >= 1);
  assert(`${lang} ${level} coverage entries`, assembled.coverage.length >= 4);
  assert(`${lang} ${level} blueprint slot on lesen`, !!assembled.lesenParts[0].blueprintSlot);

  const exam = ExamBuilder.buildFromBlueprint(lang, level, bank, blueprint, { mode: 'standard' });
  assert(`${lang} ${level} exam blueprintId`, exam.blueprintId === blueprint.id);
  assert(`${lang} ${level} exam renderable lesen+horen`, (exam.lesenParts?.length || 0) + (exam.horenParts?.length || 0) >= 1);
  const hasExtra =
    exam.grammatikParts?.length || exam.useOfEnglishParts?.length || exam.schreibenParts?.length;
  assert(`${lang} ${level} extra modules optional`, !!hasExtra || bpFile.startsWith('cambridge'));
  if (bpFile.startsWith('cambridge')) {
    assert(`${lang} ${level} cambridgeFormat flag`, exam.cambridgeFormat === true);
    assert(`${lang} ${level} listening parts`, assembled.horenParts.length >= 1);
  }
}

console.log('\nBlueprint assembly tests passed.');
