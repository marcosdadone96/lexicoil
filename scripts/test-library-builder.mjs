#!/usr/bin/env node
/**
 * Smoke test: load library JSON and verify exam assembly shape (Node, no browser).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildMinimal(lang, level, bank) {
  const lesen = shuffle(bank.questions.filter((q) => q.module === 'lesen')).slice(0, 3);
  const horen = shuffle(bank.questions.filter((q) => q.module === 'horen')).slice(0, 2);
  const passage = bank.passages?.find((p) => p.id === lesen[0]?.passageId);
  const listenPassage = bank.passages?.find((p) => p.id === horen[0]?.passageId);
  return {
    lang,
    level,
    goetheFormat: true,
    libraryBuilt: true,
    lesenParts: [
      {
        teil: 1,
        instruction: 'Read and answer.',
        text: passage?.text || 'Sample text.',
        questions: lesen.map((q, i) => ({
          id: `t_${i}`,
          type: q.type,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          grammarTags: q.grammarTags,
        })),
      },
    ],
    horenParts: [
      {
        teil: 1,
        instruction: 'Listen and answer.',
        segments: [
          {
            id: 's1',
            label: 'Recording 1',
            transcript: listenPassage?.text || horen[0]?.transcript || 'Sample audio transcript.',
            questions: horen.map((q, i) => ({
              id: `h_${i}`,
              type: q.type,
              question: q.question,
              options: q.options,
              correct: q.correct,
              explanation: q.explanation,
            })),
          },
        ],
      },
    ],
  };
}

function hasScorableKeys(exam) {
  let n = 0;
  exam.lesenParts?.forEach((p) => {
    p.questions?.forEach((q) => {
      if (q.correct != null) n++;
    });
  });
  exam.horenParts?.forEach((p) => {
    p.segments?.forEach((s) => {
      s.questions?.forEach((q) => {
        if (q.correct != null) n++;
      });
    });
  });
  return n > 0;
}

const levels = [
  ['de', 'B1'],
  ['de', 'B2'],
  ['en', 'B2'],
  ['en', 'C1'],
  ['es', 'B2'],
  ['es', 'C1'],
];

let failed = 0;
for (const [lang, level] of levels) {
  const bank = loadBank(lang, level);
  const exam = buildMinimal(lang, level, bank);
  const ok = exam.lesenParts?.length && exam.horenParts?.length && hasScorableKeys(exam);
  if (!ok) {
    console.error('FAIL', `${lang}/${level}`);
    failed++;
  } else {
    console.log('PASS', `${lang}/${level}`, 'scorable exam shape OK');
  }
}

if (failed) process.exit(1);
console.log('Library builder smoke tests passed.');
