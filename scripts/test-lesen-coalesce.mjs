#!/usr/bin/env node
/** Haiku often returns R/F statements in items[] — normalize must promote to questions[]. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

globalThis.S = { subject: 'de', level: 'B1', history: [] };
globalThis.window = globalThis;
globalThis.lcDebug = { log() {}, warn() {} };

const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examGeneration.js'), 'utf8');
vm.runInThisContext(src, { filename: 'examGeneration.js' });

const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const raw = {
  level: 'B1',
  lang: 'de',
  lesenParts: [
    {
      teil: 1,
      text: 'Ein langer Text ueber Umwelt und Natur in der Stadt mit vielen Details und Beispielen.',
      items: Array.from({ length: 6 }, (_, i) => ({
        id: `l${i + 1}`,
        question: `Aussage ${i + 1}?`,
        correct: i % 2 ? 'F' : 'R',
        type: 'multiple',
      })),
    },
  ],
};

const norm = normalizeExam(raw);
assert(norm.lesenParts[0].questions?.length === 6, 'items promoted to questions[]');
assert(!norm.lesenParts[0].items?.length, 'items cleared after promotion');
assert(norm.lesenParts[0].questions[0].type === 'rf', 'type coerced to rf');

const check = new ExamValidator().validate(
  { ...norm, vocabPersonal: true },
  { strict: false, blueprint: false },
);
assert(check.valid, 'personal lesen-only exam validates after normalize');

console.log('\nAll lesen-coalesce tests passed.');
