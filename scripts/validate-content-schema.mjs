#!/usr/bin/env node
/**
 * Phase 1 — validate library content schemas + servability thresholds.
 * Servable levels must pass all blueprint-required thresholds; others listed with deficits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Ajv from 'ajv';
import { ALL_LANGS, ALL_LEVELS } from './seed-coverage-levels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const ContentServable = require(path.join(ROOT, 'js/library/contentServable.js'));
const LibraryCatalog = require(path.join(ROOT, 'js/library/libraryCatalog.js'));

const ajv = new Ajv({ allErrors: true });
const schemas = {
  questions: JSON.parse(fs.readFileSync(path.join(ROOT, 'library/schemas/questions.schema.json'), 'utf8')),
  passages: JSON.parse(fs.readFileSync(path.join(ROOT, 'library/schemas/passage.schema.json'), 'utf8')),
  writingSpeaking: JSON.parse(
    fs.readFileSync(path.join(ROOT, 'library/schemas/writing-speaking.schema.json'), 'utf8'),
  ),
};
const validateQuestions = ajv.compile(schemas.questions);
const validatePassages = ajv.compile(schemas.passages);
const validateWritingSpeaking = ajv.compile(schemas.writingSpeaking);

const thresholds = ContentServable.loadThresholdsSync(fs.readFileSync, ROOT);

function readJson(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint(lang, level) {
  const id = LibraryCatalog.blueprintId(lang, level);
  if (!id) return null;
  const file = path.join(ROOT, 'library/blueprints', `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

let schemaErrors = 0;
const servable = [];
const insufficient = [];

for (const lang of ALL_LANGS) {
  for (const level of ALL_LEVELS) {
    const base = `library/${lang}/${level}`;
    const qFile = `${base}/questions.json`;
    const questionsBank = readJson(qFile);
    if (!questionsBank) {
      console.error('MISSING', qFile);
      schemaErrors++;
      continue;
    }
    if (!validateQuestions(questionsBank)) {
      console.error('INVALID questions', qFile, validateQuestions.errors);
      schemaErrors++;
      continue;
    }

    const passagesFile = readJson(`${base}/passages.json`);
    if (passagesFile && !validatePassages(passagesFile)) {
      console.error('INVALID passages', `${base}/passages.json`, validatePassages.errors);
      schemaErrors++;
      continue;
    }

    const wsFile = readJson(`${base}/writing-speaking.json`);
    if (wsFile && !validateWritingSpeaking(wsFile)) {
      console.error('INVALID writing-speaking', `${base}/writing-speaking.json`, validateWritingSpeaking.errors);
      schemaErrors++;
      continue;
    }

    const blueprint = loadBlueprint(lang, level);
    const passages = ContentServable.mergePassages(questionsBank.passages, passagesFile?.passages);
    const report = ContentServable.assessLevel({
      lang,
      level,
      questions: questionsBank.questions,
      passages,
      writingSpeaking: wsFile || { writing: [], speaking: [] },
      blueprint,
      thresholds,
    });

    if (report.servable) {
      servable.push(`${lang}/${level}`);
      console.log('SERVABLE', `${lang}/${level}`, report.counts);
    } else {
      insufficient.push({ pair: `${lang}/${level}`, deficits: report.deficits });
      console.log(
        'INSUFFICIENT',
        `${lang}/${level}`,
        report.deficits.map((d) => d.message).join('; '),
      );
    }
  }
}

console.log('\n--- Summary ---');
console.log(`Schema errors: ${schemaErrors}`);
console.log(`Servable (${servable.length}):`, servable.length ? servable.join(', ') : '(none yet)');
console.log(`Insufficient: ${insufficient.length}`);

if (schemaErrors) {
  console.error('\nvalidate:content failed — fix schema errors above.');
  process.exit(1);
}

console.log('\nvalidate:content OK — schemas valid; servability report complete.');
process.exit(0);
