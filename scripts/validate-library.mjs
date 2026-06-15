#!/usr/bin/env node
/**
 * Validates /library/{lang}/{level}/questions.json for all 18 pairs (phase 13a).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { ALL_LANGS, ALL_LEVELS } from './seed-coverage-levels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/schemas/questions.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(SCHEMA);

let errors = 0;

for (const lang of ALL_LANGS) {
  for (const level of ALL_LEVELS) {
    const file = path.join(ROOT, 'library', lang, level, 'questions.json');
    if (!fs.existsSync(file)) {
      console.error('MISSING', path.relative(ROOT, file));
      errors++;
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validate(data)) {
      console.error('INVALID', path.relative(ROOT, file), validate.errors);
      errors++;
      continue;
    }
    if (data.meta?.contentStatus === 'scaffold') {
      console.log('SCAFFOLD', `${lang}/${level}`, 'ready for content generation');
      continue;
    }
    const lesen = data.questions.filter((q) => q.module === 'lesen' || q.module === 'reading').length;
    const horen = data.questions.filter((q) => q.module === 'horen' || q.module === 'listening').length;
    if (lesen < 2 || horen < 2) {
      console.error('INSUFFICIENT', path.relative(ROOT, file), `lesen=${lesen} horen=${horen}`);
      errors++;
      continue;
    }
    console.log('OK', `${lang}/${level}`, `${data.questions.length} questions`);
  }
}

if (errors) {
  console.error(`\n${errors} library validation error(s)`);
  process.exit(1);
}
console.log('\nAll 18 library files valid.');
