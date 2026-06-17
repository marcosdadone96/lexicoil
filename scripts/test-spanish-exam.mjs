#!/usr/bin/env node
/**
 * DELE normalization + validation acceptance (A1, B1, C1).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { normalizeSpanishExam } = require(path.join(ROOT, 'js/i18n/examSpanishNormalize.js'));
const { examUiStrings } = require(path.join(ROOT, 'js/i18n/examUiLocale.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const validator = new ExamValidator();

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('OK:', msg);
}

function baseFixture(level, topic) {
  return {
    lang: 'es',
    level,
    topic,
    readingParts: [
      {
        part: 1,
        instruction: 'Lea el texto y responda.',
        textTitle: topic,
        text: 'Texto de muestra sobre ' + topic + '.',
        questions: [
          {
            id: 'r1',
            type: 'multiple',
            question: '¿De qué trata el texto?',
            options: ['A) Viajes', 'B) ' + topic, 'C) Deportes'],
            correct: 'B',
          },
        ],
      },
    ],
    listeningParts: [
      {
        part: 1,
        instruction: 'Escuche la grabación.',
        segments: [
          {
            id: 'l1',
            label: 'Grabación 1',
            transcript: '— Hola, ¿reservaste la habitación?\n— Sí, para dos noches.',
            question: '¿Qué reservaron?',
            options: ['A) Un vuelo', 'B) Una habitación', 'C) Un coche'],
            correct: 'B',
          },
        ],
      },
    ],
    writingParts: [
      {
        part: 1,
        instruction: 'Escriba un correo corto.',
        minWords: 60,
      },
    ],
    speakingParts: [
      {
        part: 1,
        title: 'Presentación',
        situation: 'Hable de un tema que le interese.',
        points: ['Introducción', 'Detalles', 'Conclusión'],
      },
    ],
  };
}

function isRenderable(exam) {
  const lp = (exam.lesenParts || []).some(
    (p) => p.text || p.items?.length || p.questions?.length,
  );
  const hp = (exam.horenParts || []).some(
    (p) => p.segments?.length || p.transcript || p.questions?.length,
  );
  return lp && hp;
}

for (const level of ['A1', 'B1', 'C1']) {
  const raw = baseFixture(level, 'Medio ambiente');
  const exam = normalizeSpanishExam(JSON.parse(JSON.stringify(raw)));
  assert(exam.lang === 'es', `${level} lang es`);
  assert(exam.deleFormat === true, `${level} deleFormat`);
  assert(exam.goetheFormat === true, `${level} goetheFormat for renderer`);
  assert(exam.official?.board === 'Instituto Cervantes', `${level} board`);
  assert(exam.official?.certificate === `DELE ${level}`, `${level} certificate`);
  assert(exam.modules?.lesen?.title === 'Comprensión de lectura', `${level} reading module title`);
  assert(exam.lesenParts?.length === 1, `${level} lesenParts mapped`);
  assert(exam.horenParts?.[0]?.segments?.length === 1, `${level} listening segments`);
  assert(exam.schreibenParts?.length === 1, `${level} writing parts`);
  assert(exam.sprechenParts?.length === 1, `${level} speaking parts`);
  assert(isRenderable(exam), `${level} renderable structure`);
  const v = validator.validate(exam);
  assert(v.valid, `${level} ExamValidator: ${v.errors.join(', ')}`);
  const ui = examUiStrings('es');
  assert(ui.reading === 'Comprensión de lectura', `${level} Spanish UI reading label`);
  assert(ui.speechLang === 'es-ES', `${level} TTS locale`);
}

const demoPath = path.join(ROOT, 'data', 'demo', 'es_B1_v1.json');
const demo = JSON.parse(readFileSync(demoPath, 'utf8'));
assert(demo.lang === 'es' && demo.board === 'Instituto Cervantes', 'demo es_B1 metadata');
assert(demo.variant === 1 && demo.hookWord?.word, 'demo es_B1 v3 loop');
assert(Array.isArray(demo.modules) && demo.modules.length === 4, 'demo es_B1 modules');
const demoReading = demo.modules.find((m) => m.id === 'reading');
const demoItem = demoReading?.parts?.[0]?.items?.[0];
assert(demoItem?.options?.some((o) => o.correct), 'demo es_B1 answer key');

console.log('\nDELE Spanish acceptance tests passed (A1, B1, C1 + demo).');
