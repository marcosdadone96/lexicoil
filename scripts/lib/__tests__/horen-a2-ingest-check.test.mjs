#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkHorenBatchIngest,
  checkHorenA2Register,
  A2_HOREN_B1_REGISTER_RE,
  findZuInfinitiv,
  countRelativeClauses,
  analyzeRelativeClauses,
  checkRelativeClausesForPassage,
} from '../horenBatchIngestCheck.mjs';
import { normalizeBatch } from '../normalizeBatch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Retired 045 — known B1 register failure
const badPath = path.join(ROOT, 'batches/needs-regeneration/A2/horen-t4-gemini-045.json');
assert.ok(fs.existsSync(badPath), 'horen-t4-gemini-045.json in needs-regeneration');
const bad045 = JSON.parse(fs.readFileSync(badPath, 'utf8'));
const badReport = checkHorenBatchIngest(bad045, { lang: 'de', level: 'A2', teil: 4, batchId: 'test-045' });
assert.equal(badReport.ok, false, '045 must fail ingest');
assert.ok(
  badReport.results.some((r) => r.errors.some((e) => /register_gate|cefr_gate/.test(e))),
  `045 errors: ${JSON.stringify(badReport.results[0]?.errors)}`,
);

// Simple A2 monologue segment — should pass register
const goodT1 = {
  passages: [
    {
      id: 'p1',
      text: 'Guten Tag! Das Schwimmbad ist heute bis 18 Uhr geöffnet. Ein Ticket kostet fünf Euro.',
    },
  ],
  questions: [{ module: 'horen', teil: 1, type: 'multiple_choice' }],
};
const regOk = checkHorenA2Register(goodT1, 1);
assert.equal(regOk.ok, true);

assert.ok(A2_HOREN_B1_REGISTER_RE.test('Das ist eine Herausforderung'));
assert.ok(!A2_HOREN_B1_REGISTER_RE.test('Das Schwimmbad ist geöffnet'));

// normalizeBatch A2 Hören: default difficulty 3, strip on pool path
const norm = normalizeBatch(
  {
    passages: [{ id: 'p', module: 'horen', teil: 1, text: 'Hallo.' }],
    questions: [{ id: 'q', module: 'horen', teil: 1, type: 'multiple_choice', correct: 'a' }],
  },
  { module: 'horen', teil: 1, lang: 'de', level: 'A2', stripPoolLegacy: true },
);
assert.equal(norm.questions[0].difficulty, undefined, 'A2 horen pool strip removes difficulty');

const normGen = normalizeBatch(
  {
    passages: [{ id: 'p', module: 'horen', teil: 1, text: 'Hallo.' }],
    questions: [{ id: 'q', module: 'horen', teil: 1, type: 'multiple_choice', correct: 'a' }],
  },
  { module: 'horen', teil: 1, lang: 'de', level: 'A2', stripPoolLegacy: false },
);
assert.equal(normGen.questions[0].difficulty, 3, 'A2 horen default difficulty is 3');

// Retired 047 — Relativsatz + zu-Infinitiv B1 register (gate hole closed 2026-08-02)
const bad047Path = path.join(ROOT, 'batches/needs-regeneration/A2/horen-t4-gemini-047.json');
assert.ok(fs.existsSync(bad047Path), 'horen-t4-gemini-047.json in needs-regeneration');
const bad047 = JSON.parse(fs.readFileSync(bad047Path, 'utf8'));
const text047 = bad047.passages[0].text;
assert.ok(countRelativeClauses(text047) >= 2, '047 fixture has multiple Relativsätze');
assert.ok(findZuInfinitiv(text047).length >= 2, '047 fixture has zu-Infinitiv');
assert.ok(!findZuInfinitiv(text047).some((h) => /zu Hause/i.test(h)), 'zu Hause must not count');
const bad047Report = checkHorenBatchIngest(bad047, { lang: 'de', level: 'A2', teil: 4, batchId: 'test-047' });
assert.equal(bad047Report.ok, false, '047 must fail ingest with tightened register gate');
assert.ok(
  bad047Report.results.some((r) =>
    r.errors.some((e) =>
      /register_gate:(relative_clause|zu_infinitiv|es_ist_zu_verb)/.test(e),
    ),
  ),
  `047 register errors: ${JSON.stringify(bad047Report.results[0]?.errors)}`,
);

// Synthetic A2 T4 interview — no Relativsatz / zu-Infinitiv
const goodT4 = {
  passages: [
    {
      id: 'p4-good',
      module: 'horen',
      teil: 4,
      text:
        'Moderator: Guten Tag. Heute sprechen wir über Autofahren in der Stadt. ' +
        'Frau Hansen: In vielen Städten ist die Luft sehr schlecht. Der Verkehr verursacht viel Abgas und Lärm. ' +
        'Moderator: Was ist Ihre Meinung? ' +
        'Frau Hansen: Wir brauchen mehr Busse und Bahnen. Auch Fahrradwege sind wichtig. Das ist besser für alle.',
    },
  ],
  questions: [{ module: 'horen', teil: 4, type: 'ja_nein' }],
};
const goodT4Reg = checkHorenA2Register(goodT4, 4);
assert.equal(goodT4Reg.ok, true, `synthetic T4 register: ${goodT4Reg.errors}`);

// cur-health pattern — one simple subject relative (der/die/das + ≤4 words before final verb)
const curHealthRel = 'Und was ist mit den Menschen, die arbeiten müssen?';
const relAnalysis = analyzeRelativeClauses(curHealthRel);
assert.equal(relAnalysis.length, 1, 'cur-health sentence has one relative');
assert.equal(relAnalysis[0].kind, 'simple_subject', relAnalysis[0].reason);
assert.equal(checkRelativeClausesForPassage(curHealthRel).ok, true);

const goodT4SimpleRel = {
  passages: [
    {
      id: 'p4-simple-rel',
      module: 'horen',
      teil: 4,
      text:
        'Moderator: Guten Tag. Heute sprechen wir über Verkehr in der Stadt. ' +
        'Frau Hansen: In vielen Städten ist die Luft schlecht. Der Verkehr macht viel Lärm. ' +
        `Moderator: ${curHealthRel} ` +
        'Frau Hansen: Man muss den Nahverkehr besser machen. Dann fahren mehr Leute mit Bus und Bahn.',
    },
  ],
  questions: [{ module: 'horen', teil: 4, type: 'ja_nein' }],
};
const goodT4SimpleRelReg = checkHorenA2Register(goodT4SimpleRel, 4);
assert.equal(goodT4SimpleRelReg.ok, true, `T4 with simple subject relative: ${goodT4SimpleRelReg.errors}`);

console.log('PASS: horen-a2-ingest-check');
