/**
 * A2 wiring fixes (post code audit) — no API.
 * Run: node scripts/lib/__tests__/a2-wiring-fixes.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractStructuralMold,
  checkStructuralMoldDuplicate,
} from '../structuralMoldDedup.mjs';
import { isHorenCombinedCalidadLexicoTeil } from '../horenCombinedCalidadLexico.mjs';
import { buildExamFixNote } from '../generatePartGeminiLib.mjs';
import { buildExamVariableSuffix } from '../examTemplatePrompt.mjs';
import { checkHorenBatchQuality } from '../horenBatchQuality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const a2T4Sample = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'batches/ready/pool-verified/A2/lesen-t4-cur-health.json'),
    'utf8',
  ),
);

const a2Mold = extractStructuralMold(a2T4Sample, 4, { level: 'A2' });
assert.equal(a2Mold.kind, 'a2_anzeigen');
assert.ok(a2Mold.key.startsWith('a2_anzeigen:'), a2Mold.key);

const b1ForumBatch = {
  level: 'B1',
  topicTag: 'Umwelt',
  passages: [{ title: 'Forum: Autofreie Innenstadt', text: 'Debatte im Forum…' }],
  questions: [{ teil: 4, level: 'B1', signText: 'Ich bin dafür…' }],
  debateTopic: 'autofrei',
};
const b1Mold = extractStructuralMold(b1ForumBatch, 4, { level: 'B1' });
assert.equal(b1Mold.kind, 't4_debate');

const dup = checkStructuralMoldDuplicate(a2T4Sample, [b1ForumBatch], {
  teil: 4,
  level: 'A2',
});
assert.equal(dup.ok, true, 'A2 T4 must not collide with B1 forum mold');

assert.equal(isHorenCombinedCalidadLexicoTeil(3, 'A2'), true);
assert.equal(isHorenCombinedCalidadLexicoTeil(4, 'A2'), true);
assert.equal(isHorenCombinedCalidadLexicoTeil(2, 'A2'), false);

const a2T4Note = buildExamFixNote(['longitud'], 'calidad', 'horen', 4, 'Umwelt', 'A2');
assert.ok(!/ANCLA TEMATICA|transcripcion max 450|12-14 turnos/i.test(a2T4Note));
assert.ok(/150–250|Ja\/Nein/i.test(a2T4Note));

const b1T4Note = buildExamFixNote(['longitud'], 'calidad', 'horen', 4, 'Umwelt', 'B1');
assert.ok(/ANCLA TEMATICA|450 palabras/i.test(b1T4Note));

const a2SchreibSuffix = buildExamVariableSuffix('schreiben', 1, ['termin', 'arzt'], {
  level: 'A2',
  topic: 'Gesundheit',
});
assert.ok(!/Nachbar|Schreiben T3|Herr\/Frau/i.test(a2SchreibSuffix));

const b1SchreibSuffix = buildExamVariableSuffix('schreiben', 1, ['termin'], {
  level: 'B1',
  topic: 'Wohnen',
  schreibenT3Surname: 'Müller',
});
assert.ok(/Nachbar|Schreiben T3|Herr\/Frau Müller/i.test(b1SchreibSuffix));

const goodH1 = {
  level: 'A2',
  passages: Array.from({ length: 5 }, (_, i) => ({
    id: `s${i + 1}`,
    text: 'Guten Tag. Der Zug fährt heute pünktlich ab. Bitte achten Sie auf Ihre Fahrkarte und Gepäck.',
  })),
  questions: Array.from({ length: 5 }, (_, i) => ({
    id: `q${i + 1}`,
    type: 'multiple_choice',
    segmentLabel: `Text ${i + 1}`,
    passageId: `s${i + 1}`,
    question: 'Wann fährt der Zug?',
    options: ['a) früh', 'b) spät', 'c) nie'],
    correctAnswer: 'a',
  })),
};
const h1q = checkHorenBatchQuality(goodH1, 1, { level: 'A2' });
assert.equal(h1q.ok, true, h1q.issues.join('; '));

const badH1 = { ...goodH1, passages: goodH1.passages.slice(0, 3) };
const h1bad = checkHorenBatchQuality(badH1, 1, { level: 'A2' });
assert.ok(h1bad.issues.some((i) => /5 segmentos/i.test(i)));

console.log('a2-wiring-fixes.test.mjs: OK');
