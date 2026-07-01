#!/usr/bin/env node
/**
 * Personal Lesen runtime — Teil 2 passage integrity, Teil 3 chunk parse 422, retry hooks.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  validateLesenT2PassageIntegrity,
  lesenT2PartIsValid,
  normalizeLesenT2FromPassages,
} = require(path.join(ROOT, 'js/engine/validation/lesenPassageIntegrity.js'));
const { extractJsonObject } = require(path.join(ROOT, 'netlify/functions/lib/proAiModes.js'));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

const validT2 = {
  teil: 2,
  blueprintSlot: 'press_mcq',
  passages: [
    { passageId: 'A', textTitle: 'Stadtgrün', text: 'Erster kurzer Zeitungstext über Parks in der Stadt mit genug Inhalt.' },
    { passageId: 'B', textTitle: 'Verkehr', text: 'Zweiter unabhängiger Text über Fahrradwege und Buslinien in der Region.' },
  ],
  questions: [
    ...Array.from({ length: 3 }, (_, i) => ({
      id: String(7 + i),
      passageId: 'A',
      type: 'multiple_choice',
      question: `Frage ${7 + i}?`,
      options: ['a) eins', 'b) zwei', 'c) drei'],
      correct: 'a',
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: String(10 + i),
      passageId: 'B',
      type: 'multiple_choice',
      question: `Frage ${10 + i}?`,
      options: ['a) eins', 'b) zwei', 'c) drei'],
      correct: 'b',
    })),
  ],
};

normalizeLesenT2FromPassages(validT2);
assert('Teil 2 valid dual passages passes', lesenT2PartIsValid(validT2));
assert('Teil 2 has two passage texts', validT2.passages.length === 2);

const ghostB = {
  teil: 2,
  blueprintSlot: 'press_mcq',
  passages: [{ passageId: 'A', textTitle: 'Only', text: 'Nur ein Text vorhanden.' }],
  questions: [
    ...Array.from({ length: 3 }, (_, i) => ({ id: String(7 + i), passageId: 'A', question: 'Q?', correct: 'a', options: ['a) x', 'b) y', 'c) z'] })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: String(10 + i), passageId: 'B', question: 'Q?', correct: 'a', options: ['a) x', 'b) y', 'c) z'] })),
  ],
};
const ghostErrors = validateLesenT2PassageIntegrity(ghostB);
assert('ghost Text B rejected', ghostErrors.some((e) => e.includes('passage_text_missing') && e.includes('passageId=B')));

const truncated = '{ "lesenParts": [{ "teil": 3, "ads": [';
assert('extractJsonObject null on truncated JSON', extractJsonObject(truncated) === null);

const parseable = '{"lesenParts":[{"teil":3,"items":[]}]}';
assert('extractJsonObject parses minimal chunk', extractJsonObject(parseable)?.lesenParts?.[0]?.teil === 3);

function lesenTeilNeedsRetry(exam, teil) {
  const part = (exam?.lesenParts || []).find((p) => Number(p.teil) === Number(teil));
  if (!part) return true;
  if (Number(teil) === 2) return validateLesenT2PassageIntegrity(part).length > 0;
  if (Number(teil) === 3) return (part.ads || []).length < 10;
  return false;
}
assert('Teil 2 ghost triggers retry need', lesenTeilNeedsRetry({ lesenParts: [ghostB] }, 2));
assert('Teil 2 valid skips retry', !lesenTeilNeedsRetry({ lesenParts: [validT2] }, 2));
assert('missing Teil 3 triggers retry', lesenTeilNeedsRetry({ lesenParts: [] }, 3));

console.log('\nPersonal Lesen runtime tests passed.');
