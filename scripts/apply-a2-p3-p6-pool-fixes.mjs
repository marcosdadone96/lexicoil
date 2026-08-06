#!/usr/bin/env node
/**
 * Apply A2 P3–P6 pool + served exam fixes (offline, no API).
 *   node scripts/apply-a2-p3-p6-pool-fixes.mjs           # dry-run
 *   node scripts/apply-a2-p3-p6-pool-fixes.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const EXAMS_PATH = path.join(ROOT, 'data/exams/de_A2.json');
const DEMO_DIR = path.join(ROOT, 'batches/generated/A2');
const apply = process.argv.includes('--apply');

const STOCK_OPTS = (a, b) => [
  `a) im ${a}. Stock`,
  `b) im ${b}. Stock`,
  'c) in einem anderen Stock',
];

const SCHREIBEN_T2 = {
  health: {
    id: 'de-a2-s-t2-gesundheit-feier-01-q1',
    question:
      'Ihr Chef lädt Sie zu einer Firmenfeier ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
      '• Bedanken Sie sich für die Einladung\n' +
      '• Sagen Sie, dass Sie kommen und Ihren Partner mitbringen\n' +
      '• Fragen Sie, wie man am besten hinkommt',
    topicTags: ['health', 'Gesundheit'],
  },
  work: {
    id: 'de-a2-s-t2-arbeit-feier-01-q1',
    question:
      'Ihr Chef organisiert ein Sommerfest für die Mitarbeiter. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
      '• Bedanken Sie sich für die Einladung\n' +
      '• Sagen Sie, dass Sie kommen und Ihre Frau mitbringen\n' +
      '• Fragen Sie nach dem Weg und einem Parkplatz',
    topicTags: ['work', 'Arbeit'],
  },
  society: {
    id: 'de-a2-s-t2-gesellschaft-feier-01-q1',
    question:
      'Ihr Chef lädt Sie zu einer Weihnachtsfeier ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
      '• Bedanken Sie sich für die Einladung\n' +
      '• Sagen Sie, dass Sie kommen und Ihren Bruder mitbringen\n' +
      '• Fragen Sie, wie man mit der U-Bahn hinkommt',
    topicTags: ['society', 'Gesellschaft'],
  },
  education: {
    id: 'de-a2-s-t2-bildung-feier-01-q1',
    question:
      'Ihr Chef lädt Sie zu einer Informationsveranstaltung ein. Schreiben Sie eine E-Mail (30–40 Wörter) an Ihren Chef. Schreiben Sie zu drei Punkten:\n' +
      '• Bedanken Sie sich für die Einladung\n' +
      '• Sagen Sie, dass Sie kommen und eine Kollegin mitbringen\n' +
      '• Fragen Sie nach der genauen Adresse',
    topicTags: ['education', 'Bildung'],
  },
};

const LESEN_T2_UPGRADES = {
  'de-a2-p-lesen-t2-gesundheit-bewegung-02': {
    topicTags: ['health', 'Gesundheit'],
    questions: [
      {
        q: 'Maria möchte Yoga machen. In welchem Stock findet sie den Yoga-Kursraum?',
        opts: STOCK_OPTS(3, 1),
        correct: 'a',
        expl: 'Yoga findet im 3. Stock statt (Kurse & Yoga).',
      },
      {
        q: 'Herr Klein sucht die Sauna. In welchem Stock ist die Sauna?',
        opts: STOCK_OPTS(4, 2),
        correct: 'a',
        expl: 'Sauna & Wellness befindet sich im 4. Stock.',
      },
      {
        q: 'Lisa braucht Laufbänder. In welchem Stock ist der Cardio-Bereich?',
        opts: STOCK_OPTS(2, 4),
        correct: 'a',
        expl: 'Cardio & Gewichte sind im 2. Stock.',
      },
      {
        q: 'Anna sucht den Empfang. In welchem Stock ist der Empfang?',
        opts: ['a) im 1. Stock', 'b) im 3. Stock', 'c) in einem anderen Stock'],
        correct: 'a',
        expl: 'Empfang & Café befinden sich im 1. Stock.',
      },
      {
        q: 'Tom möchte schwimmen. In welchem Stock ist das Schwimmbad?',
        opts: STOCK_OPTS(4, 1),
        correct: 'a',
        expl: 'Schwimmbad ist im 4. Stock (Sauna & Wellness).',
      },
    ],
  },
  'de-a2-p-lesen-t2-arbeit-homeoffice-01': {
    topicTags: ['work', 'Arbeit'],
    questions: [
      {
        q: 'Frau Becker möchte Kaffee trinken. In welchem Stock befindet sich das Café?',
        opts: [
          'a) Erdgeschoss, Zimmer 015',
          'b) 2. Stock, Zimmer 220',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Café Pause ist in Zimmer 015 auf der linken Seite.',
      },
      {
        q: 'Herr Weber braucht das Fitness-Studio. In welchem Stock ist es?',
        opts: [
          'a) Keller-Ebene',
          'b) 1. Stock',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Fitness-Studio: Keller-Ebene, Treppe rechts.',
      },
      {
        q: 'Maria sucht Dr. Müller. In welchem Stock/Erdgeschoss ist die Arztpraxis?',
        opts: [
          'a) Erdgeschoss, Zimmer 012',
          'b) 2. Stock',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Arzt Dr. Müller: Zimmer 012 im Erdgeschoss.',
      },
      {
        q: 'Peter möchte Mittagessen. In welchem Stock im Erdgeschoss ist das Restaurant?',
        opts: [
          'a) Zimmer 020 (rechts hinten)',
          'b) Zimmer 005',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Restaurant Business Lunch: Zimmer 020.',
      },
      {
        q: 'Lisa braucht die Kopierwerkstatt. In welchem Stock ist sie?',
        opts: [
          'a) Erdgeschoss, Zimmer 005',
          'b) 1. Stock',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Kopierwerkstatt: Zimmer 005 im Erdgeschoss.',
      },
    ],
  },
  'de-a2-p-lesen-t2-einkauf-online-lokal-01': {
    topicTags: ['society', 'Gesellschaft', 'shopping'],
    questions: [
      {
        q: 'Familie Müller sucht Spielzeug für Kinder. In welchem Stock ist das Spielzeuggeschäft?',
        opts: STOCK_OPTS(1, 3),
        correct: 'a',
        expl: 'Spielzeugland ist im 1. Obergeschoss.',
      },
      {
        q: 'Herr Klein braucht einen neuen Fernseher. In welchem Stock ist der Elektromarkt?',
        opts: STOCK_OPTS(2, 1),
        correct: 'a',
        expl: 'Elektromarkt Blitz ist im 2. Obergeschoss.',
      },
      {
        q: 'Anna möchte ins Kino. In welchem Stock ist das Kino Traumwelt?',
        opts: STOCK_OPTS(3, 1),
        correct: 'a',
        expl: 'Kino Traumwelt ist im 3. Obergeschoss.',
      },
      {
        q: 'Tom sucht frisches Brot. In welchem Stock ist die Bäckerei?',
        opts: [
          'a) im Erdgeschoss',
          'b) im 2. Obergeschoss',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Bäckerei Müller ist im Erdgeschoss.',
      },
      {
        q: 'Lisa möchte Bücher kaufen. In welchem Stock ist die Buchhandlung?',
        opts: [
          'a) im Erdgeschoss',
          'b) im 3. Obergeschoss',
          'c) in einem anderen Stock',
        ],
        correct: 'a',
        expl: 'Buchhandlung Lesen & Mehr ist im Erdgeschoss.',
      },
    ],
  },
};

const VHS_PASSAGE = {
  id: 'de-a2-p-lesen-t2-bildung-vhs-plan-01',
  module: 'lesen',
  teil: 2,
  title: 'Volkshochschule — Gebäudeplan',
  text:
    'VOLKSHOCHSCHULE STADT — GEBÄUDEPLAN\n\n' +
    'Erdgeschoss:\n• Empfang & Information\n• Café\n• Bibliothek\n\n' +
    '1. Stock:\n• Deutschkurs A1/A2 (Raum 101)\n• Integrationskurs (Raum 102)\n\n' +
    '2. Stock:\n• Computerkurs (Raum 201)\n• Online-Lernzentrum (Raum 202)\n\n' +
    '3. Stock:\n• Sprachkurs B1 (Raum 301)\n• Konferenzraum\n\n' +
    '4. Stock:\n• Prüfungszentrum\n• Beratungsstelle',
  passageVocab: ['Volkshochschule', 'Kursraum', 'Stock', 'Empfang', 'Prüfung'],
  topicTags: ['education', 'Bildung'],
};

function baseQuestion(module, teil, id, extra = {}) {
  return {
    module,
    teil,
    lang: 'de',
    level: 'A2',
    type: 'short_answer',
    correct: 'rubric',
    correctAnswer: 'rubric',
    options: [],
    explanation: 'Bewertung A2: Dank, Zusage mit Begleitung, Wegfrage; 30–40 Wörter; Sie-Form.',
    difficulty: 2,
    skills: ['writing'],
    language: 'de',
    examType: 'goethe',
    ...extra,
    id,
  };
}

function buildSchreibenT2Bank() {
  return Object.entries(SCHREIBEN_T2).map(([topic, spec]) =>
    baseQuestion('schreiben', 2, spec.id, {
      question: spec.question,
      topicTags: spec.topicTags,
      examTopic: topic,
    }),
  );
}

function upgradeLesenT2Questions(bank) {
  let patched = 0;
  const questions = [...(bank.questions || [])];

  for (const [passageId, spec] of Object.entries(LESEN_T2_UPGRADES)) {
    const existing = questions.filter(
      (q) => q.module === 'lesen' && q.teil === 2 && q.passageId === passageId,
    );
    const slug = passageId.replace(/^de-a2-p-lesen-t2-/, '');
    spec.questions.forEach((def, i) => {
      const id = `de-a2-l-t2-${slug}-q${i + 1}`;
      const row = {
        id,
        module: 'lesen',
        teil: 2,
        type: 'multiple_choice',
        level: 'A2',
        lang: 'de',
        language: 'de',
        examType: 'goethe',
        passageId,
        question: def.q,
        options: def.opts,
        correct: def.correct,
        correctAnswer: def.correct,
        explanation: def.expl,
        topicTags: spec.topicTags,
        difficulty: 2,
        skills: ['reading'],
      };
      const idx = questions.findIndex((q) => q.id === id);
      if (idx >= 0) {
        questions[idx] = { ...questions[idx], ...row };
      } else {
        questions.push(row);
      }
      patched++;
    });
    // Remove stale questions for same passage not in our set
    for (const q of existing) {
      if (!spec.questions.some((_, i) => q.id === `de-a2-l-t2-${slug}-q${i + 1}`)) {
        const rm = questions.findIndex((x) => x.id === q.id);
        if (rm >= 0) questions.splice(rm, 1);
      }
    }
  }

  // Education: add VHS floor plan + 5 questions
  const passages = [...(bank.passages || [])];
  if (!passages.some((p) => p.id === VHS_PASSAGE.id)) {
    passages.push(VHS_PASSAGE);
  }
  const eduQs = [
    {
      q: 'Carlos sucht einen Deutschkurs A2. In welchem Stock ist der Kursraum?',
      opts: STOCK_OPTS(1, 3),
      correct: 'a',
    },
    {
      q: 'Frau Schmidt braucht den Computerkurs. In welchem Stock findet sie ihn?',
      opts: STOCK_OPTS(2, 1),
      correct: 'a',
    },
    {
      q: 'Lisa möchte Bücher ausleihen. In welchem Stock ist die Bibliothek?',
      opts: [
        'a) im Erdgeschoss',
        'b) im 2. Stock',
        'c) in einem anderen Stock',
      ],
      correct: 'a',
    },
    {
      q: 'Tom bereitet sich auf eine Prüfung vor. In welchem Stock ist das Prüfungszentrum?',
      opts: STOCK_OPTS(4, 2),
      correct: 'a',
    },
    {
      q: 'Anna sucht Beratung zu Kursen. In welchem Stock ist die Beratungsstelle?',
      opts: STOCK_OPTS(4, 1),
      correct: 'a',
    },
  ];
  eduQs.forEach((def, i) => {
    const id = `de-a2-l-t2-bildung-vhs-plan-01-q${i + 1}`;
    const row = {
      id,
      module: 'lesen',
      teil: 2,
      type: 'multiple_choice',
      level: 'A2',
      passageId: VHS_PASSAGE.id,
      question: def.q,
      options: def.opts,
      correct: def.correct,
      correctAnswer: def.correct,
      topicTags: ['education', 'Bildung'],
      difficulty: 2,
      skills: ['reading'],
      language: 'de',
      examType: 'goethe',
    };
    const idx = questions.findIndex((q) => q.id === id);
    if (idx >= 0) questions[idx] = { ...questions[idx], ...row };
    else questions.push(row);
    patched++;
  });

  return { questions, passages, patched };
}

function fixLesenT4Notation(bank) {
  let fixed = 0;
  const questions = (bank.questions || []).map((q) => {
    if (q.module !== 'lesen' || Number(q.teil) !== 4) return q;
    const opts = (q.options || []).map((o) => {
      const s = String(o).trim();
      if (/^g\)\s*X$/i.test(s)) {
        fixed++;
        return 'X';
      }
      return o;
    });
    let correct = String(q.correct || q.correctAnswer || '').trim();
    if (correct.toLowerCase() === 'g') {
      correct = 'X';
      fixed++;
    }
    return {
      ...q,
      options: opts,
      correct,
      correctAnswer: correct,
    };
  });
  return { questions, fixed };
}

function patchServedSchreibenT2(exams) {
  const topicMap = { health: 'health', work: 'work', society: 'society', education: 'education' };
  let patched = 0;
  for (const exam of exams) {
    const topic = String(exam.topic || '').toLowerCase();
    const spec = SCHREIBEN_T2[topicMap[topic] || topic];
    if (!spec) continue;
    for (const part of exam.schreibenParts || []) {
      if (Number(part.teil) !== 2) continue;
      const isBad = /\bForum|Lärm|Nachbarschaft|Meinung zu\b/i.test(String(part.task || ''));
      if (isBad || !/\bChef\b/i.test(String(part.task || ''))) {
        part.task = spec.question;
        part.taskType = 'semiformal_email';
        part.minWords = 30;
        part.maxWords = 40;
        part.targetWords = 35;
        part.topicTags = spec.topicTags;
        patched++;
      }
    }
  }
  return patched;
}

function writeDemoBatches(bank) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const demos = {
    'p3-schreiben-t2-demo.json': {
      passages: [],
      questions: buildSchreibenT2Bank().slice(0, 2),
    },
    'p4-lesen-t2-demo.json': {
      passages: [bank.passages.find((p) => p.id === 'de-a2-p-lesen-t2-gesundheit-bewegung-02')],
      questions: bank.questions.filter((q) => q.passageId === 'de-a2-p-lesen-t2-gesundheit-bewegung-02'),
    },
    'p6-lesen-t4-demo.json': {
      passages: bank.passages.filter((p) => p.id?.startsWith('de-a2-p-lesen-t4-vier-tage-woche-02')),
      questions: bank.questions.filter((q) => q.id?.startsWith('de-a2-l-t4-vier-tage-woche-02')),
    },
  };
  for (const [name, batch] of Object.entries(demos)) {
    fs.writeFileSync(path.join(DEMO_DIR, name), `${JSON.stringify(batch, null, 2)}\n`);
  }
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
  const exams = JSON.parse(fs.readFileSync(EXAMS_PATH, 'utf8'));

  const schreibenNew = buildSchreibenT2Bank();
  const existingIds = new Set((bank.questions || []).map((q) => q.id));
  const schreibenAdded = schreibenNew.filter((q) => !existingIds.has(q.id));

  let questions = [...(bank.questions || []), ...schreibenAdded];
  const { questions: q2, passages: p2, patched: l2patched } = upgradeLesenT2Questions({
    ...bank,
    questions,
  });
  questions = q2;
  const { questions: q4, fixed: t4fixed } = fixLesenT4Notation({ ...bank, questions });
  questions = q4;

  const nextBank = { ...bank, questions, passages: p2 };
  const servedPatched = patchServedSchreibenT2(exams);

  console.log('A2 P3–P6 pool fixes:');
  console.log(`  Schreiben T2: +${schreibenAdded.length} canonical Chef-E-Mails`);
  console.log(`  Lesen T2: ${l2patched} preguntas con fórmula Stock/Etage`);
  console.log(`  Lesen T4: ${t4fixed} correcciones g→X en opciones/correct`);
  console.log(`  Served exams Schreiben T2: ${servedPatched} partes corregidas`);

  if (!apply) {
    console.log('\n[dry-run] Pass --apply to write bank + exams + demo batches');
    return;
  }

  fs.writeFileSync(BANK_PATH, `${JSON.stringify(nextBank, null, 2)}\n`);
  fs.writeFileSync(EXAMS_PATH, `${JSON.stringify(exams, null, 2)}\n`);
  writeDemoBatches(nextBank);
  console.log('\nApplied. Demo batches in batches/generated/A2/');
}

main();
