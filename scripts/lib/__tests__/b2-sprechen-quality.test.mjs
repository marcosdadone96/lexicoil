#!/usr/bin/env node
/** B2 Sprechen quality gates (official strings). */
import assert from 'node:assert/strict';
import { checkPromptBatchQuality } from '../promptBatchQuality.mjs';
import { GOETHE_B2_INSTRUCTIONS } from '../goethe-b2-modellsatz.mjs';

const t1q = `Thema: Medien.\n${GOETHE_B2_INSTRUCTIONS.sprechen[0]}\nGliedern Sie: Einleitung, Beispiele, Meinung.`;
const t2q = `Thema: Homeoffice.\n${GOETHE_B2_INSTRUCTIONS.sprechen[1]}\nArgumentieren Sie und reagieren Sie auf Ihre Partnerin.`;

const r1 = checkPromptBatchQuality(
  {
    questions: [{
      module: 'sprechen',
      teil: 1,
      type: 'short_answer',
      question: t1q,
      explanation: 'Bewertung B2 Vortrag.',
    }],
  },
  'sprechen',
  1,
  { level: 'B2' },
);
assert.equal(r1.ok, true, r1.issues.join('; '));

const r2 = checkPromptBatchQuality(
  {
    questions: [{
      module: 'sprechen',
      teil: 2,
      type: 'short_answer',
      question: t2q,
      explanation: 'Bewertung B2 Diskussion.',
    }],
  },
  'sprechen',
  2,
  { level: 'B2' },
);
assert.equal(r2.ok, true, r2.issues.join('; '));

const bad = checkPromptBatchQuality(
  { questions: [{ module: 'sprechen', teil: 1, question: 'Planen Sie gemeinsam einen Ausflug.', explanation: 'x'.repeat(12) }] },
  'sprechen',
  1,
  { level: 'B2' },
);
assert.ok(!bad.ok);

console.log('PASS: B2 Sprechen promptBatchQuality gates');
