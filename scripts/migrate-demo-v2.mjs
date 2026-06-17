#!/usr/bin/env node
/**
 * One-shot migration: flat demo schema → modules v2.
 * Run: node scripts/migrate-demo-v2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, 'data', 'demo');

const MODULES = {
  de: [
    { id: 'lesen', title: 'Lesen', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'horen', title: 'Hören', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'schreiben', title: 'Schreiben', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'sprechen', title: 'Sprechen', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
  ],
  en: [
    { id: 'reading', title: 'Reading', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'listening', title: 'Listening', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'writing', title: 'Writing', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
    { id: 'speaking', title: 'Speaking', wNote: 'Graded with feedback in the full app.', sNote: 'Evaluated with AI in the full app.' },
  ],
  es: [
    { id: 'reading', title: 'Comprensión de lectura', wNote: 'Corregido con feedback en la app completa.', sNote: 'Evaluado con IA en la app completa.' },
    { id: 'listening', title: 'Comprensión auditiva', wNote: 'Corregido con feedback en la app completa.', sNote: 'Evaluado con IA en la app completa.' },
    { id: 'writing', title: 'Expresión escrita', wNote: 'Corregido con feedback en la app completa.', sNote: 'Evaluado con IA en la app completa.' },
    { id: 'speaking', title: 'Expresión oral', wNote: 'Corregido con feedback en la app completa.', sNote: 'Evaluado con IA en la app completa.' },
  ],
};

const PASS = { de: 60, en: 70, es: 60 };

function wrapFlat(old) {
  const lang = old.lang;
  const r = old.reading;
  const h = old.listening;
  const w = old.writing;
  const s = old.speaking;
  const markWord = r.markWord || '';
  const markable = markWord
    ? [{ word: markWord, pos: 'noun', gender: lang === 'de' ? 'f' : undefined, translations: { en: markWord, es: markWord } }]
    : [];
  return {
    id: old.id,
    lang: old.lang,
    level: old.level,
    topic: old.topic,
    board: old.board,
    certificate: old.certificate,
    passPercent: PASS[lang] || 60,
    modules: MODULES[lang].map((m) => {
      if (m.id === 'lesen' || m.id === 'reading') {
        return {
          id: m.id,
          title: m.title,
          interactive: true,
          parts: [
            {
              type: 'multiple_choice',
              label: 'Part 1',
              instructions: lang === 'de' ? 'Lesen Sie den Text und wählen Sie die richtige Antwort.' : 'Read the text and choose the best answer.',
              passage: r.passage,
              markableWords: markable,
              items: [{ id: 'r1', question: r.question, options: r.options }],
            },
          ],
        };
      }
      if (m.id === 'horen' || m.id === 'listening') {
        return {
          id: m.id,
          title: m.title,
          interactive: true,
          parts: [
            {
              type: 'multiple_choice',
              label: 'Part 1',
              instructions: lang === 'de' ? 'Lesen Sie das Transkript und wählen Sie die richtige Antwort.' : 'Read the transcript and choose the best answer.',
              transcript: h.transcript,
              markableWords: [],
              items: [{ id: 'h1', question: h.question, options: h.options }],
            },
          ],
        };
      }
      if (m.id === 'schreiben' || m.id === 'writing') {
        return {
          id: m.id,
          title: m.title,
          interactive: false,
          parts: [{ type: 'writing_task', task: w.task, note: w.note || m.wNote }],
        };
      }
      return {
        id: m.id,
        title: m.title,
        interactive: false,
        parts: [{ type: 'speaking_task', task: s.task, note: s.prepNote ? s.prepNote + ' — ' + m.sNote : m.sNote }],
      };
    }),
  };
}

const RICH = {
  de_B1: null, // filled below
  de_B2: null,
  en_B2: null,
  en_C1: null,
};

function richDeB1() {
  return {
    id: 'de_B1',
    lang: 'de',
    level: 'B1',
    topic: 'Arbeit und Umwelt',
    board: 'Goethe-Institut',
    certificate: 'Goethe-Zertifikat B1',
    passPercent: 60,
    modules: [
      {
        id: 'lesen',
        title: 'Lesen',
        interactive: true,
        parts: [
          {
            type: 'multiple_choice',
            label: 'Teil 1',
            instructions: 'Lesen Sie den Text und wählen Sie die richtige Antwort (A, B oder C).',
            passage:
              'Immer mehr Unternehmen bieten ihren Mitarbeitenden die Möglichkeit, teilweise von zu Hause aus zu arbeiten. Laut einer aktuellen Umfrage sind 62 Prozent der Beschäftigten mit dieser Flexibilität zufrieden, wünschen sich aber klare Regeln für die Erreichbarkeit außerhalb der Kernarbeitszeit. Gleichzeitig berichten Stadtverwaltungen, dass weniger Pendlerverkehr die Luftqualität verbessern könnte, wenn Homeoffice dauerhaft etabliert wird.',
            markableWords: [
              { word: 'Flexibilität', gender: 'f', pos: 'noun', translations: { en: 'flexibility', es: 'flexibilidad' } },
              { word: 'Mitarbeitenden', gender: 'f', pos: 'noun', translations: { en: 'employees', es: 'empleados' } },
            ],
            items: [
              {
                id: 'l1q1',
                question: 'Was zeigt die Umfrage?',
                options: [
                  { key: 'A', text: 'Die meisten Beschäftigten lehnen Homeoffice ab.', correct: false },
                  { key: 'B', text: 'Viele sind zufrieden, möchten aber klare Regeln.', correct: true },
                  { key: 'C', text: 'Unternehmen verbieten Homeoffice vollständig.', correct: false },
                ],
              },
              {
                id: 'l1q2',
                question: 'Was könnte laut dem Text die Luftqualität verbessern?',
                options: [
                  { key: 'A', text: 'Mehr Autobahnen in der Stadt', correct: false },
                  { key: 'B', text: 'Weniger Pendlerverkehr durch Homeoffice', correct: true },
                  { key: 'C', text: 'Höhere Mieten im Stadtzentrum', correct: false },
                ],
              },
            ],
          },
          {
            type: 'true_false',
            label: 'Teil 2',
            instructions: 'Lesen Sie die Sätze. Entscheiden Sie: richtig oder falsch?',
            passage:
              'Ein Bericht der Umweltagentur empfiehlt, dass Firmen Energieverbrauch in Büros messen und jährlich veröffentlichen. Kritiker sagen, dass kleine Betriebe die Kosten nicht tragen können. Dennoch unterstützen viele Kommunen Pilotprojekte mit Zuschüssen.',
            markableWords: [
              { word: 'Energieverbrauch', gender: 'm', pos: 'noun', translations: { en: 'energy consumption', es: 'consumo de energía' } },
            ],
            items: [
              {
                id: 'l2q1',
                question: 'Der Bericht empfiehlt, Energieverbrauch zu messen.',
                options: [
                  { key: 'A', text: 'Richtig', correct: true },
                  { key: 'B', text: 'Falsch', correct: false },
                ],
              },
            ],
          },
          {
            type: 'multiple_choice',
            label: 'Teil 3',
            instructions: 'Lesen Sie den Blogeintrag und wählen Sie die beste Antwort.',
            passage:
              'Seit ich dreimal pro Woche im Homeoffice arbeite, habe ich mehr Zeit für Sport. Mein Chef war anfangs skeptisch, doch die Produktivität ist gleich geblieben. Wichtig ist eine stabile Internetverbindung und ein ruhiger Arbeitsplatz zu Hause.',
            markableWords: [
              { word: 'Internetverbindung', gender: 'f', pos: 'noun', translations: { en: 'internet connection', es: 'conexión a internet' } },
            ],
            items: [
              {
                id: 'l3q1',
                question: 'Was hat sich für die Autorin verbessert?',
                options: [
                  { key: 'A', text: 'Sie hat mehr Zeit für Sport.', correct: true },
                  { key: 'B', text: 'Sie verdient deutlich mehr Geld.', correct: false },
                  { key: 'C', text: 'Sie muss nie wieder ins Büro.', correct: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'horen',
        title: 'Hören',
        interactive: true,
        parts: [
          {
            type: 'multiple_choice',
            label: 'Teil 1',
            instructions: 'Lesen Sie das Transkript und wählen Sie die richtige Antwort.',
            transcript:
              'Moderatorin: Heute sprechen wir über Carsharing in der Stadt. Unser Gast, Herr Weber, nutzt kein eigenes Auto mehr.\nHerr Weber: Ich spare nicht nur Geld, sondern auch Parkplatzsuche. Allerdings brauche ich morgens manchmal länger, bis ein Fahrzeug frei ist.',
            markableWords: [
              { word: 'Fahrzeug', gender: 'n', pos: 'noun', translations: { en: 'vehicle', es: 'vehículo' } },
            ],
            items: [
              {
                id: 'h1q1',
                question: 'Welchen Nachteil nennt Herr Weber?',
                options: [
                  { key: 'A', text: 'Carsharing ist zu teuer.', correct: false },
                  { key: 'B', text: 'Morgens wartet er manchmal auf ein freies Auto.', correct: true },
                  { key: 'C', text: 'Er findet keine Parkplätze.', correct: false },
                ],
              },
            ],
          },
          {
            type: 'multiple_choice',
            label: 'Teil 2',
            instructions: 'Hören Sie das Gespräch (Transkript) und antworten Sie.',
            transcript:
              'Kollegin: Hast du die Einladung zum Team-Workshop gesehen?\nKollege: Ja, aber ich kann am Freitag nicht. Ich schlage vor, den Termin auf Montag zu verschieben.\nKollegin: Gute Idee. Ich informiere die Leitung.',
            markableWords: [
              { word: 'Workshop', gender: 'm', pos: 'noun', translations: { en: 'workshop', es: 'taller' } },
            ],
            items: [
              {
                id: 'h2q1',
                question: 'Was schlägt der Kollege vor?',
                options: [
                  { key: 'A', text: 'Den Workshop abzusagen', correct: false },
                  { key: 'B', text: 'Den Termin auf Montag zu verschieben', correct: true },
                  { key: 'C', text: 'Eine neue Einladung zu drucken', correct: false },
                ],
              },
              {
                id: 'h2q2',
                question: 'Wer informiert die Leitung über den neuen Termin?',
                options: [
                  { key: 'A', text: 'Der Kollege', correct: false },
                  { key: 'B', text: 'Die Kollegin', correct: true },
                  { key: 'C', text: 'Die Leitung selbst', correct: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'schreiben',
        title: 'Schreiben',
        interactive: false,
        parts: [
          {
            type: 'opinion_email',
            task: 'Sie haben in einer Zeitschrift einen Artikel über Plastikmüll im Meer gelesen. Schreiben Sie einen Leserbrief an die Redaktion: Was Sie beunruhigt und welche Maßnahmen Sie vorschlagen.',
            note: 'ca. 80 Wörter — Graded with feedback in the full app.',
          },
        ],
      },
      {
        id: 'sprechen',
        title: 'Sprechen',
        interactive: false,
        parts: [
          {
            type: 'presentation',
            task: 'Erzählen Sie von einer Reise, die Sie gemacht haben: Ziel, Transport, Erlebnis und ob Sie die Reise empfehlen würden.',
            note: 'Vorbereitungszeit: 1 Minute — Evaluated with AI in the full app.',
          },
        ],
      },
    ],
  };
}

function richDeB2() {
  const base = richDeB1();
  return {
    ...base,
    id: 'de_B2',
    level: 'B2',
    topic: 'Digitalisierung und Gesellschaft',
    certificate: 'Goethe-Zertifikat B2',
    modules: base.modules.map((m) => {
      if (m.id !== 'lesen') return m;
      return {
        ...m,
        parts: [
          {
            type: 'multiple_choice',
            label: 'Teil 1',
            instructions: 'Lesen Sie den Artikel und wählen Sie die beste Antwort.',
            passage:
              'Eine aktuelle Studie des Instituts für Arbeitsmarkt zeigt, dass die Digitalisierung viele Berufsbilder verändert, ohne sie vollständig zu ersetzen. Besonders repetitive Tätigkeiten werden automatisiert, während neue Stellen in der Datenanalyse entstehen. Kritiker warnen, dass ältere Beschäftigte seltener Zugang zu Weiterbildung erhalten. Die Autoren fordern deshalb staatlich geförderte Umschulungsprogramme, damit der Strukturwandel sozialverträglich gestaltet werden kann.',
            markableWords: [
              { word: 'Digitalisierung', gender: 'f', pos: 'noun', translations: { en: 'digitalisation', es: 'digitalización' } },
              { word: 'Weiterbildung', gender: 'f', pos: 'noun', translations: { en: 'further training', es: 'formación continua' } },
            ],
            items: [
              {
                id: 'l1q1',
                question: 'Was betont die Studie als zentrale Folge der Digitalisierung?',
                options: [
                  { key: 'A', text: 'Alle Berufe werden sofort ersetzt.', correct: false },
                  { key: 'B', text: 'Berufsbilder verändern sich, werden aber nicht alle ersetzt.', correct: true },
                  { key: 'C', text: 'Nur junge Menschen profitieren.', correct: false },
                ],
              },
              {
                id: 'l1q2',
                question: 'Was fordern die Autoren?',
                options: [
                  { key: 'A', text: 'Staatlich geförderte Umschulungsprogramme', correct: true },
                  { key: 'B', text: 'Ein Verbot von Homeoffice', correct: false },
                  { key: 'C', text: 'Höhere Steuern für IT-Firmen', correct: false },
                ],
              },
            ],
          },
          {
            type: 'matching',
            label: 'Teil 2',
            instructions: 'Ordnen Sie die Aussagen dem Text zu.',
            passage:
              'Der Kommentator schreibt, der Ausbau erneuerbarer Energien sei unverzichtbar, wenn Deutschland seine Klimaziele erreichen wolle. Gleichzeitig betont er, dass Verbraucher ihren Energieverbrauch nicht vollständig externalisieren dürften.',
            markableWords: [
              { word: 'Energieverbrauch', gender: 'm', pos: 'noun', translations: { en: 'energy consumption', es: 'consumo de energía' } },
            ],
            items: [
              {
                id: 'l2q1',
                question: 'Welche Kombination hält der Autor für wirksam?',
                options: [
                  { key: 'A', text: 'Nur Politik, ohne Verhaltensänderung', correct: false },
                  { key: 'B', text: 'Politik plus bewusster Verbrauch', correct: true },
                  { key: 'C', text: 'Nur individuelle Käufe', correct: false },
                ],
              },
            ],
          },
        ],
      };
    }),
  };
}

function richEnB2() {
  return {
    id: 'en_B2',
    lang: 'en',
    level: 'B2',
    topic: 'Remote Work and Society',
    board: 'Cambridge English',
    certificate: 'B2 First (FCE)',
    passPercent: 70,
    modules: [
      {
        id: 'reading',
        title: 'Reading and Use of English',
        interactive: true,
        parts: [
          {
            type: 'multiple_choice',
            label: 'Part 1',
            instructions: 'Read the text and choose the best answer (A, B or C).',
            passage:
              'The measures introduced to support remote workers are not yet sufficient, the minister told reporters. Although progress has been made on broadband access, binding standards for ergonomic home offices are still missing. Trade unions argue that employers should contribute to equipment costs, while small firms warn that uniform rules could threaten their survival.',
            markableWords: [
              { word: 'measures', pos: 'noun', translations: { en: 'measures', es: 'medidas' } },
              { word: 'ergonomic', pos: 'adjective', translations: { en: 'ergonomic', es: 'ergonómico' } },
            ],
            items: [
              {
                id: 'r1q1',
                question: 'Which statement matches the text?',
                options: [
                  { key: 'A', text: 'The measures are already sufficient.', correct: false },
                  { key: 'B', text: 'The measures are not yet sufficient.', correct: true },
                  { key: 'C', text: 'No measures have been introduced.', correct: false },
                ],
              },
              {
                id: 'r1q2',
                question: 'What is still missing according to the minister?',
                options: [
                  { key: 'A', text: 'Binding standards for ergonomic home offices', correct: true },
                  { key: 'B', text: 'International trade agreements', correct: false },
                  { key: 'C', text: 'Free laptops for students', correct: false },
                ],
              },
            ],
          },
          {
            type: 'multiple_choice',
            label: 'Part 2',
            instructions: 'Read the article extract and answer the question.',
            passage:
              'Review: Fitness Tracking Apps. The reviewer praises the app\'s clear layout but criticises the fact that it collects far more personal data than most users expect. Although the sleep-tracking feature is accurate, the terms and conditions are difficult to understand.',
            markableWords: [
              { word: 'accurate', pos: 'adjective', translations: { en: 'accurate', es: 'preciso' } },
            ],
            items: [
              {
                id: 'r2q1',
                question: 'What does the reviewer criticise?',
                options: [
                  { key: 'A', text: 'Excessive data collection', correct: true },
                  { key: 'B', text: 'Poor sleep tracking', correct: false },
                  { key: 'C', text: 'An ugly layout', correct: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'listening',
        title: 'Listening',
        interactive: true,
        parts: [
          {
            type: 'multiple_choice',
            label: 'Part 1',
            instructions: 'Read the transcript and choose the best answer.',
            transcript:
              '— Have you printed the documents for the conference in Vienna?\n— Almost. The flight is confirmed, but the hotel was full. I booked another one near the station.\n— Fine, we\'ll meet at the airport tomorrow morning.',
            markableWords: [
              { word: 'conference', pos: 'noun', translations: { en: 'conference', es: 'conferencia' } },
            ],
            items: [
              {
                id: 'h1q1',
                question: 'What is the main topic of the conversation?',
                options: [
                  { key: 'A', text: 'Moving to a new city', correct: false },
                  { key: 'B', text: 'Planning a business trip', correct: true },
                  { key: 'C', text: 'A problem with their flat', correct: false },
                ],
              },
            ],
          },
          {
            type: 'multiple_choice',
            label: 'Part 2',
            instructions: 'Read the interview transcript.',
            transcript:
              'Presenter: Can individual choices really fight climate change?\nScientist: They help, but systemic policy is essential. Governments must invest in renewable energy and public transport.\nPresenter: Are younger voters willing to pay more?\nScientist: Surveys show growing support among younger voters.',
            markableWords: [
              { word: 'renewable', pos: 'adjective', translations: { en: 'renewable', es: 'renovable' } },
            ],
            items: [
              {
                id: 'h2q1',
                question: 'What does the scientist emphasise?',
                options: [
                  { key: 'A', text: 'Systemic policy is essential', correct: true },
                  { key: 'B', text: 'Individual action is useless', correct: false },
                  { key: 'C', text: 'Young voters oppose green taxes', correct: false },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'writing',
        title: 'Writing',
        interactive: false,
        parts: [
          {
            type: 'essay',
            task: 'Write a formal email (about 100 words) complaining about a delayed delivery and requesting a specific solution.',
            note: 'Graded with feedback in the full app.',
          },
        ],
      },
      {
        id: 'speaking',
        title: 'Speaking',
        interactive: false,
        parts: [
          {
            type: 'presentation',
            task: 'Give a short presentation on a topic of your choice. Structure: introduction, main points, conclusion.',
            note: '1 minute preparation — Evaluated with AI in the full app.',
          },
        ],
      },
    ],
  };
}

function richEnC1() {
  const b2 = richEnB2();
  return {
    ...b2,
    id: 'en_C1',
    level: 'C1',
    topic: 'Technology and Ethics',
    certificate: 'C1 Advanced (CAE)',
    modules: b2.modules.map((m) => {
      if (m.id !== 'reading') return m;
      return {
        ...m,
        parts: [
          {
            ...m.parts[0],
            passage:
              'The measures introduced to support remote workers are not yet sufficient, ministers concluded after a cross-party review. While broadband rollout has accelerated, binding ergonomic standards remain absent, and smaller employers warn that compliance costs could force layoffs. Unions counter that long-term savings in office rent should fund worker equipment.',
            items: [
              ...m.parts[0].items,
              {
                id: 'r1q3',
                question: 'What do unions argue about funding?',
                options: [
                  { key: 'A', text: 'Office rent savings should fund equipment', correct: true },
                  { key: 'B', text: 'Workers should pay for all equipment', correct: false },
                  { key: 'C', text: 'Governments should ban remote work', correct: false },
                ],
              },
            ],
          },
          m.parts[1],
        ],
      };
    }),
  };
}

RICH.de_B1 = richDeB1;
RICH.de_B2 = richDeB2;
RICH.en_B2 = richEnB2;
RICH.en_C1 = richEnC1;

const manifest = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'manifest.json'), 'utf8'));

for (const id of manifest.exams) {
  const file = path.join(DEMO_DIR, `${id}.json`);
  let exam;
  if (RICH[id]) {
    exam = RICH[id]();
  } else {
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (old.modules) {
      exam = old;
    } else {
      exam = wrapFlat(old);
    }
  }
  fs.writeFileSync(file, JSON.stringify(exam, null, 2) + '\n', 'utf8');
  console.log('Wrote', id);
}

manifest.version = 2;
manifest.description = 'Frozen LexiCoil demo exams v2 — modular half-length structure, no AI.';
fs.writeFileSync(path.join(DEMO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('Done.');
