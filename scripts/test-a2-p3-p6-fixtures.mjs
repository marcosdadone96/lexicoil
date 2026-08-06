#!/usr/bin/env node
/**
 * Golden fixtures + quality gate validation for A2 P3–P6 fixes.
 *   node scripts/test-a2-p3-p6-fixtures.mjs
 */
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

const FIXTURES = {
  schreibenT2: {
    passages: [],
    questions: [{
      id: 'test-s-t2-a2',
      module: 'schreiben',
      teil: 2,
      lang: 'de',
      level: 'A2',
      type: 'short_answer',
      question:
        'Ihr Chef lädt Sie zu einer Firmenfeier ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
        '• Bedanken Sie sich für die Einladung\n' +
        '• Sagen Sie, dass Sie kommen und Ihre Partnerin mitbringen\n' +
        '• Fragen Sie, wie man am besten hinkommt',
      correct: 'rubric',
      correctAnswer: 'rubric',
      options: [],
    }],
  },
  lesenT2: {
    passages: [{
      id: 'p-t2',
      module: 'lesen',
      teil: 2,
      text: 'Gebäudeplan Stadtbibliothek\nErdgeschoss: Empfang\n1. Stock: Kinderbücher\n2. Stock: Deutschkurs\n3. Stock: Computer\n4. Stock: Café',
    }],
    questions: [
      {
        id: 'q1',
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        question: 'Maria sucht einen Deutschkurs. In welchem Stock befindet sich der Kursraum?',
        options: ['a) Erdgeschoss', 'b) 2. Obergeschoss', 'c) in einem anderen Stock'],
        correct: 'b',
        correctAnswer: 'b',
        passageId: 'p-t2',
      },
      {
        id: 'q2',
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        question: 'Peter möchte Kinderbücher ausleihen. In welchem Stock findet er sie?',
        options: ['a) 1. Obergeschoss', 'b) Keller', 'c) in einem anderen Stock'],
        correct: 'a',
        correctAnswer: 'a',
        passageId: 'p-t2',
      },
      {
        id: 'q3',
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        question: 'Lisa braucht einen Computer. In welchem Stock ist der Computerraum?',
        options: ['a) 3. Obergeschoss', 'b) Erdgeschoss', 'c) in einem anderen Stock'],
        correct: 'b',
        correctAnswer: 'b',
        passageId: 'p-t2',
      },
      {
        id: 'q4',
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        question: 'Herr Weber möchte einen Kaffee trinken. In welchem Stock ist das Café?',
        options: ['a) vierte Etage', 'b) erste Etage', 'c) in einem anderen Stock'],
        correct: 'a',
        correctAnswer: 'a',
        passageId: 'p-t2',
      },
      {
        id: 'q5',
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        question: 'Anna sucht den Empfang. In welchem Stock ist er?',
        options: ['a) Erdgeschoss', 'b) 2. Obergeschoss', 'c) in einem anderen Stock'],
        correct: 'a',
        correctAnswer: 'a',
        passageId: 'p-t2',
      },
    ],
  },
  horenT3: {
    passages: [1, 2, 3, 4, 5].map((n) => ({
      id: `s${n}`,
      module: 'horen',
      teil: 3,
      text: `Anna: Hallo!\nTom: Guten Tag!\nAnna: Wann ist der Kurs?\nTom: Am Montag.`,
    })),
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `q${n}`,
      module: 'horen',
      teil: 3,
      type: 'multiple_choice',
      level: 'A2',
      segmentLabel: `Text ${n}`,
      passageId: `s${n}`,
      question: `Was planen die Personen in Text ${n}?`,
      options: ['a) einen Kurs', 'b) eine Reise', 'c) ein Fest'],
      correct: 'a',
      correctAnswer: 'a',
    })),
  },
  horenT4: {
    passages: [{
      id: 'interview',
      module: 'horen',
      teil: 4,
      text:
        'Moderator: Willkommen!\nGast: Danke.\n'.repeat(40),
    }],
    questions: [1, 2, 3, 4, 5].map((n) => ({
      id: `q${n}`,
      module: 'horen',
      teil: 4,
      type: 'ja_nein',
      level: 'A2',
      passageId: 'interview',
      question: `Aussage ${n} zum Interview`,
      options: [],
      correct: n % 2 ? 'Ja' : 'Nein',
      correctAnswer: n % 2 ? 'Ja' : 'Nein',
    })),
  },
  lesenT4: {
    passages: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({
      id: `ad-${k}`,
      module: 'lesen',
      teil: 4,
      title: `Anzeige ${k}`,
      text: `Kurze Anzeige ${k} für Kurs oder Sport.`,
    })),
    questions: [
      {
        id: 'q1',
        module: 'lesen',
        teil: 4,
        type: 'matching',
        level: 'A2',
        question: 'Lisa ist 28 und sucht einen Abend-Deutschkurs. Welche Anzeige passt?',
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'X'],
        correct: 'b',
        correctAnswer: 'b',
      },
      {
        id: 'q2',
        module: 'lesen',
        teil: 4,
        type: 'matching',
        level: 'A2',
        question: 'Herr Weber möchte am Wochenende mit seiner Familie schwimmen. Welche Anzeige passt?',
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'X'],
        correct: 'd',
        correctAnswer: 'd',
      },
      {
        id: 'q3',
        module: 'lesen',
        teil: 4,
        type: 'matching',
        level: 'A2',
        question: 'Maria braucht einen Job als Verkäuferin. Welche Anzeige passt?',
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'X'],
        correct: 'a',
        correctAnswer: 'a',
      },
      {
        id: 'q4',
        module: 'lesen',
        teil: 4,
        type: 'matching',
        level: 'A2',
        question: 'Tom sucht einen Kochkurs für Anfänger. Welche Anzeige passt?',
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'X'],
        correct: 'f',
        correctAnswer: 'f',
      },
      {
        id: 'q5',
        module: 'lesen',
        teil: 4,
        type: 'matching',
        level: 'A2',
        question: 'Frau Schmidt sucht einen Job als Ärztin. Keine Anzeige passt. Markieren Sie X.',
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'X'],
        correct: 'X',
        correctAnswer: 'X',
      },
    ],
  },
};

const B1_FAIL = {
  horenT3b1: {
    passages: [{ id: 'p', text: 'A: Hi\nB: Hallo\n'.repeat(50) }],
    questions: Array.from({ length: 7 }, (_, i) => ({
      id: `q${i}`,
      module: 'horen',
      teil: 3,
      type: 'richtig_falsch',
      level: 'A2',
      question: `Aussage ${i}`,
      correct: 'Richtig',
      options: ['Richtig', 'Falsch'],
    })),
  },
};

function run() {
  const rows = [];

  const s2 = checkPromptBatchQuality(FIXTURES.schreibenT2, 'schreiben', 2, { level: 'A2' });
  rows.push(['P3 Schreiben T2', s2.ok, s2.issues]);

  const l2 = checkLesenBatchQuality(FIXTURES.lesenT2, 2, { level: 'A2' });
  rows.push(['P4 Lesen T2', l2.ok, l2.issues]);

  const h3 = checkHorenBatchQuality(FIXTURES.horenT3, 3, { level: 'A2' });
  rows.push(['P5 Hören T3 A2', h3.ok, h3.issues]);

  const h3b1 = checkHorenBatchQuality(B1_FAIL.horenT3b1, 3, { level: 'A2' });
  rows.push(['P5 Hören T3 rejects B1 RF×7', !h3b1.ok, h3b1.issues.slice(0, 2)]);

  const h4 = checkHorenBatchQuality(FIXTURES.horenT4, 4, { level: 'A2' });
  rows.push(['P5 Hören T4 A2', h4.ok, h4.issues]);

  const l4 = checkLesenBatchQuality(FIXTURES.lesenT4, 4, { level: 'A2' });
  rows.push(['P6 Lesen T4', l4.ok, l4.issues]);

  console.log('\n=== A2 P3–P6 fixture gates ===\n');
  let fail = 0;
  for (const [name, ok, issues] of rows) {
    console.log(`${ok ? 'OK' : 'FAIL'}  ${name}`);
    if (!ok) {
      fail++;
      for (const i of issues.slice(0, 3)) console.log(`      - ${i}`);
    }
  }
  console.log(`\n${rows.length - fail}/${rows.length} passed`);
  process.exit(fail ? 1 : 0);
}

run();
