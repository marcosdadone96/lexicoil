import { resolveQuestionStem } from './questionStemAliases.mjs';

/**
 * Lesen A2 T4 — mini-situaciones en question (signText suele ir vacío en pool curado).
 */
const GENERIC_STEM = /^Welche Anzeige passt\?\s*$/i;
const PERSON_SITU_RE =
  /\b(Herr|Frau|Lisa|Tom|Maria|Peter|Anna|Kinder|Jahre alt|möchte|sucht|braucht|Schüler|Schülerin|Arbeitnehmer|Lehrer|Lehrerin|Familie|Mensa|Schule|Schulleitung|Mutter|Vater)\b/i;

/** Enunciado matching T4 — all known Gemini stem aliases via questionStemAliases.mjs */
export function lesenA2T4QuestionStem(q) {
  return resolveQuestionStem(q);
}

export function isGenericLesenA2T4QuestionStem(stem) {
  const s = String(stem || '').trim();
  if (!s) return true;
  if (GENERIC_STEM.test(s)) return true;
  // "Welche Anzeige passt? — clause" sin persona → insuficiente para matching Goethe
  if (/^Welche Anzeige passt\?\s*[—–-]\s*/i.test(s) && !PERSON_SITU_RE.test(s)) {
    return true;
  }
  return false;
}

export function hasLesenA2T4PersonSituation(stem) {
  return PERSON_SITU_RE.test(String(stem || ''));
}

/** Situaciones alineadas a vegetarismus-schule-02 (passages a–f) y claves del pool health. */
export const LESEN_T4_VEGETARISMUS_SCHULE_02_SITUATIONS = [
  {
    correct: 'a',
    question:
      'Eine Schülerin möchte jeden Dienstag im Bio-Schulcafé der Schule ein vegetarisches Mittagessen essen. Welche Anzeige passt?',
    explanation:
      'Anzeige a beschreibt das Bio-Schulcafé mit vegetarischem Menü am Dienstag.',
  },
  {
    correct: 'c',
    question:
      'Ein Umweltteam an der Schule möchte, dass die Mensa weniger Fleisch anbietet, weil das der Umwelt hilft. Welche Anzeige passt?',
    explanation:
      'Anzeige c erklärt, dass weniger Fleischkonsum gut für die Umwelt ist und Schulen mehr vegetarische Mahlzeiten anbieten sollten.',
  },
  {
    correct: 'd',
    question:
      'Eine Schülerin achtet auf gesunde Ernährung und sucht Tipps zu vegetarischem Essen mit Bohnen, Nüssen und Milchprodukten. Welche Anzeige passt?',
    explanation:
      'Anzeige d handelt von gesunder vegetarischer Ernährung und Protein aus Bohnen, Nüssen und Milchprodukten.',
  },
  {
    correct: 'f',
    question:
      'Die Schulleitung möchte Geld sparen und überlegt, ob vegetarische Menüs günstiger sind als Fleischgerichte. Welche Anzeige passt?',
    explanation:
      'Anzeige f erklärt, dass vegetarisches Essen oft billiger ist und Schulen beim Budget sparen können.',
  },
  {
    correct: 'X',
    question:
      'Ein Schüler wünscht sich deutlich mehr Fleischgerichte und mehr Fleischauswahl in der Schulkantine — nicht mehr vegetarische Angebote. Welche Anzeige passt?',
    explanation:
      'Keine Anzeige a–f wirbt für mehr Fleisch; die Texte betonen vegetarische Optionen, Umwelt oder Kosten.',
  },
];

export function applyVegetarismusSchule02Situations(questions) {
  const byCorrect = new Map(LESEN_T4_VEGETARISMUS_SCHULE_02_SITUATIONS.map((s) => [s.correct, s]));
  return (questions || []).map((q) => {
    const key = String(q.correct ?? q.correctAnswer ?? '').trim();
    const norm = key.toUpperCase() === 'X' ? 'X' : key.toLowerCase();
    const sit = byCorrect.get(norm);
    if (!sit) return q;
    return {
      ...q,
      question: sit.question,
      explanation: sit.explanation,
      signText: q.signText ?? '',
    };
  });
}

/** pfand-erhoehung-02 → pool lesen-t4-cur-society.json */
export const LESEN_T4_PFAND_ERHOEHUNG_02_SITUATIONS = [
  {
    id: 'de-a2-l-t4-pfand-erhoehung-02-q1',
    correct: 'd',
    question:
      'Maria kauft oft im Supermarkt ein und hat gehört, dass ab Juni das Pfand von 8 auf 20 Cent steigt. Welche Anzeige passt?',
    explanation:
      'Anzeige d erwähnt die Pfanderhöhung ab Juni von 8 auf 20 Cent im Supermarkt.',
  },
  {
    id: 'de-a2-l-t4-pfand-erhoehung-02-q2',
    correct: 'e',
    question:
      'Ein Umweltlehrer sucht einen Text von Experten, die ein höheres Mindestpfand empfehlen. Welche Anzeige passt?',
    explanation:
      'Anzeige e ist ein Umweltbericht mit der Empfehlung von mindestens 25 Cent Pfand durch Experten.',
  },
  {
    id: 'de-a2-l-t4-pfand-erhoehung-02-q3',
    correct: 'c',
    question:
      'Tom liest online eine emotionale Debatte, ob höheres Pfand gut oder schlecht ist. Welche Anzeige passt?',
    explanation:
      'Anzeige c beschreibt eine Pfand-Debatte im Forum mit unterschiedlichen Meinungen.',
  },
  {
    id: 'de-a2-l-t4-pfand-erhoehung-02-q4',
    correct: 'f',
    question:
      'Eine Mutter mit kleinem Familienbudget fürchtet, dass eine Pfanderhöhung alle teurer macht. Welche Anzeige passt?',
    explanation:
      'Anzeige f kritisiert, dass höheres Pfand besonders Familien mit kleinem Budget belastet.',
  },
  {
    id: 'de-a2-l-t4-pfand-erhoehung-02-q5',
    correct: 'X',
    question:
      'Herr Becker sucht eine Anzeige, die kostenlose Mehrwegflaschen ohne Pfand und ohne Rückgabe-System anbietet. Welche Anzeige passt?',
    explanation:
      'Keine Anzeige a–f bietet kostenlose Flaschen ohne Pfand; alle Texte setzen auf Pfand oder Pfanderhöhung.',
  },
];

export const LESEN_T4_VIER_TAGE_WOCHE_01_Q1 = {
  id: 'de-a2-l-t4-vier-tage-woche-01-q1',
  correct: 'a',
  question:
    'Ein IT-Spezialist möchte flexibel arbeiten und eine Vier-Tage-Woche mit Homeoffice. Welche Anzeige passt?',
  explanation:
    'Anzeige a bietet flexible Arbeitszeiten, Homeoffice und eine Vier-Tage-Woche — passend zu dieser Suche.',
};

/** Map question id → { question, explanation } */
export function buildLesenT4SituationPatchById() {
  const map = new Map();
  for (const s of LESEN_T4_VEGETARISMUS_SCHULE_02_SITUATIONS) {
    const ids = [
      'de-a2-l-t4-vegetarismus-schule-02-q1',
      'de-a2-l-t4-vegetarismus-schule-02-q2',
      'de-a2-l-t4-vegetarismus-schule-02-q3',
      'de-a2-l-t4-vegetarismus-schule-02-q4',
      'de-a2-l-t4-vegetarismus-schule-02-q5',
    ];
    const i = LESEN_T4_VEGETARISMUS_SCHULE_02_SITUATIONS.indexOf(s);
    map.set(ids[i], { question: s.question, explanation: s.explanation });
  }
  for (const s of LESEN_T4_PFAND_ERHOEHUNG_02_SITUATIONS) {
    map.set(s.id, { question: s.question, explanation: s.explanation });
  }
  map.set(LESEN_T4_VIER_TAGE_WOCHE_01_Q1.id, {
    question: LESEN_T4_VIER_TAGE_WOCHE_01_Q1.question,
    explanation: LESEN_T4_VIER_TAGE_WOCHE_01_Q1.explanation,
  });
  return map;
}

export function applyPfandErhoehung02Situations(questions) {
  const byCorrect = new Map(
    LESEN_T4_PFAND_ERHOEHUNG_02_SITUATIONS.map((s) => [s.correct, s]),
  );
  return (questions || []).map((q) => {
    const key = String(q.correct ?? q.correctAnswer ?? '').trim();
    const norm = key.toUpperCase() === 'X' ? 'X' : key.toLowerCase();
    const sit = byCorrect.get(norm);
    if (!sit) return q;
    return {
      ...q,
      question: sit.question,
      explanation: sit.explanation,
      signText: q.signText ?? '',
    };
  });
}

export function patchBankLesenT4Situations(bank) {
  const patch = buildLesenT4SituationPatchById();
  let fixed = 0;
  for (const q of bank.questions || []) {
    const p = patch.get(q.id);
    if (!p) continue;
    q.question = p.question;
    q.explanation = p.explanation;
    fixed += 1;
  }
  return fixed;
}

export function listGenericLesenT4BankQuestions(bank) {
  return (bank.questions || []).filter(
    (q) =>
      q.module === 'lesen' &&
      Number(q.teil) === 4 &&
      q.type === 'matching' &&
      isGenericLesenA2T4QuestionStem(q.question),
  );
}
