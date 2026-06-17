#!/usr/bin/env node
/** CefrGate — deterministic level verification tests (Phase 3) */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/engine/validation/CefrVocabLoader.js'));
require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
const CefrVocabLoader = require(path.join(ROOT, 'js/engine/validation/CefrVocabLoader.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

// Lemmatizer smoke
assert(Lemmatizer.normalizeLemma('Städten', 'de') === 'stadt', 'lemmatizer: Städten → stadt');
assert(Lemmatizer.normalizeLemma('studies', 'en') === 'study', 'lemmatizer: studies → study');
assert(Lemmatizer.normalizeLemma('ciudades', 'es') === 'ciudad', 'lemmatizer: ciudades → ciudad');

// Vocab loader points at library/vocab with expanded inventory
const deB1 = CefrVocabLoader.loadLevelVocabSync('de', 'B1');
assert(deB1.lemmaCount >= 400, `de B1 vocab ${deB1.lemmaCount} >= 400`);
const cumulative = CefrVocabLoader.loadCumulativeVocabSync('de', 'B1');
assert(cumulative.size >= CefrGate.MIN_VOCAB_FOR_HARD_COVERAGE, 'cumulative B1 vocab triggers hard coverage');

// B1 German sample — ~170 words, mixed simple/complex sentences
const B1_DE_TEXT = [
  'Stadtgärten boomen in deutschen Städten wie Berlin, Hamburg und München.',
  'Viele Bewohner entscheiden sich für ein Gartenprojekt, weil sie frische Produkte anbauen möchten.',
  'Die Gärten verbessern das Mikroklima und helfen Kindern, Pflanzen besser zu verstehen.',
  'Ein Bericht empfiehlt, den Energieverbrauch in Büros zu messen und zu veröffentlichen.',
  'Nachbarn lernen sich kennen und beschreiben Erfahrungen in lokalen Programmen.',
  'Obwohl der Platz begrenzt ist, bleibt der Trend wichtig für Umwelt und Bildung.',
  'Experten erklären, dass Nachhaltigkeit, Technologie und Gesundheit zentrale Themen sind.',
  'Gemeinschaftsgärten reduzieren Transport und stärken das Gefühl von Gemeinschaft.',
  'Artikel in Zeitungen beschreiben Wünsche, Pläne und Meinungen vieler Stadtbewohner.',
  'Kritiker sagen, die Nachfrage übersteigt das Angebot, trotzdem wachsen neue Projekte.',
  'Wenn Nachbarn zusammenarbeiten, entstehen positive Erfahrungen für Familien und Kinder.',
  'Der Bericht zeigt, dass Klima und Energie im Alltag wichtige Themen bleiben.',
  'Viele Programme empfehlen, den Verbrauch zu reduzieren und Produkte lokal anzubauen.',
  'Schule und Beruf profitieren, weil Kinder Natur und Ernährung praktisch erfahren.',
  'Insgesamt bleibt der Stadtgarten ein starkes Projekt für Nachhaltigkeit und Kultur.',
].join(' ');

const r1 = CefrGate.validatePassage(B1_DE_TEXT, { level: 'B1', lang: 'de' });
assert(r1.withinRange, `B1 text passes B1 (reasons: ${r1.reasons.join('; ') || 'none'})`);
assert(r1.metrics.wordCount >= 150, `B1 wordCount ${r1.metrics.wordCount} >= 150`);
assert(r1.metrics.coverageVsLevel >= 70, `B1 coverage ${r1.metrics.coverageVsLevel}%`);
assert(r1.metrics.vocabListSize >= CefrGate.MIN_VOCAB_FOR_HARD_COVERAGE, 'hard coverage enforced');

const rA1 = CefrGate.validatePassage(B1_DE_TEXT, { level: 'A1', lang: 'de' });
assert(!rA1.withinRange, 'B1 text fails A1');
assert(rA1.reasons.some((r) => r.startsWith('length_above_max')), 'A1 fails on length');

const rC1 = CefrGate.validatePassage(B1_DE_TEXT, { level: 'C1', lang: 'de' });
assert(!rC1.withinRange, 'B1 text fails C1');
assert(
  rC1.reasons.some((r) => r.startsWith('length_below_min') || r.startsWith('complexity_too_simple')),
  'C1 fails on length or complexity',
);

const r1b = CefrGate.validatePassage(B1_DE_TEXT, { level: 'B1', lang: 'de' });
assert(JSON.stringify(r1.metrics) === JSON.stringify(r1b.metrics), 'metrics are deterministic');

// extractAllExamTexts measures all passages, not only longest
const multiTextExam = {
  level: 'A1',
  lang: 'de',
  lesenParts: [
    { text: 'Ich wohne in der Stadt. Meine Familie kauft Brot.' },
    { text: B1_DE_TEXT },
  ],
};
const texts = CefrGate.extractAllExamTexts(multiTextExam);
assert(texts.length === 2, 'extractAllExamTexts collects all parts');
const multiGate = CefrGate.validateExam(multiTextExam, { level: 'A1', lang: 'de' });
assert(!multiGate.withinRange, 'validateExam fails when any text is out of range');
assert(multiGate.metrics.textsMeasured === 2, 'validateExam reports textsMeasured');

// Inference bands
const inferExam = {
  level: 'A1',
  lang: 'de',
  lesenParts: [
    {
      text: 'Ich wohne in der Stadt.',
      questions: [
        { question: 'Wo wohnt er?', inferenceLevel: 'literal' },
        { question: 'Was bedeutet das?', inferenceLevel: 'inference' },
        { question: 'Was bedeutet das?', inferenceLevel: 'inference' },
      ],
    },
  ],
};
const infer = CefrGate.validateInference(inferExam, { level: 'A1' });
assert(!infer.withinRange, 'A1 fails when inference ratio too high');
assert(infer.reasons.some((r) => r.startsWith('inference_above_max')), 'inference_above_max reason');

// Exam integration — flag off by default; ON adds cefr_gate errors when level mismatches
const exam = {
  level: 'A1',
  lang: 'de',
  lesenParts: [{ teil: 1, text: B1_DE_TEXT, questions: [] }],
};
const validator = new ExamValidator();
const off = validator.validate(exam);
assert(!off.errors.some((e) => e.startsWith('cefr_gate')), 'CEFR gate OFF by default');

const on = validator.validate(exam, { cefrGate: true, curation: true });
assert(on.errors.some((e) => e.startsWith('cefr_gate')), 'CEFR gate ON flags A1 exam with B1-length passage');

const examGate = CefrGate.validateExam({ level: 'B1', lang: 'de', lesenParts: [{ text: B1_DE_TEXT }] });
assert(examGate.withinRange, 'validateExam accepts B1 passage at B1 level');

// passageLengthExempt — official Goethe B1 Lesen Teil 3/4 (short ads / opinions)
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const goetheB1 = loadBlueprintFileSync('goethe_B1');
const shortExempt = 'Kurze Anzeige für einen Gartenkurs.';
const shortNormal = 'Kurzer Text ohne Ausnahme.';
const rExempt = CefrGate.validatePassage(shortExempt, {
  level: 'B1',
  lang: 'de',
  passageLengthExempt: true,
});
assert(
  !rExempt.reasons.some((r) => r.startsWith('length_below_min')),
  'passageLengthExempt skips length_below_min',
);
const rNormal = CefrGate.validatePassage(shortNormal, { level: 'B1', lang: 'de' });
assert(
  rNormal.reasons.some((r) => r.startsWith('length_below_min')),
  'normal part still fails length_below_min when too short',
);
const examExempt = CefrGate.validateExam(
  {
    level: 'B1',
    lang: 'de',
    lesenParts: [
      { teil: 3, ads: [{ key: 'A', text: shortExempt }], questions: [] },
      { teil: 1, text: B1_DE_TEXT, questions: [] },
    ],
  },
  { blueprint: goetheB1 },
);
assert(
  !examExempt.reasons.some((r) => r.startsWith('length_below_min')),
  'validateExam applies blueprint passageLengthExempt per lesen Teil',
);

const samples = [
  { label: 'B1-de-passage', level: 'B1', lang: 'de', text: B1_DE_TEXT },
  {
    label: 'A1-de-short',
    level: 'A1',
    lang: 'de',
    text: 'Ich wohne in der Stadt. Meine Familie kauft Brot und Milch. Das Haus ist klein, aber gut.',
  },
  {
    label: 'B1-en-passage',
    level: 'B1',
    lang: 'en',
    text:
      'Many residents join an urban garden project because they want fresh food and a stronger community. ' +
      'Although space is limited, the trend grows in many cities. Reports recommend measuring energy consumption in offices ' +
      'and publishing results when local programmes plan sustainability goals. Neighbours describe experiences and personal plans ' +
      'that explain why environment, education, technology and health remain important topics. Experts recommend reducing transport ' +
      'because climate and energy stay central in everyday life. When people cooperate, they improve the neighbourhood and share opinions ' +
      'about articles in local news programmes. The project helps children understand plants while adults discuss development and culture.',
  },
];

console.log('\nSample metrics:');
for (const s of samples) {
  const r = CefrGate.validatePassage(s.text, { level: s.level, lang: s.lang });
  console.log(
    `  ${s.label}: withinRange=${r.withinRange} words=${r.metrics.wordCount} coverage=${r.metrics.coverageVsLevel}% avgSent=${r.metrics.avgSentenceLen}`,
  );
}

console.log('\nCefrGate tests passed.');
