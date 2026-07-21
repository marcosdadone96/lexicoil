/**
 * Canonical display rubric for Sprechen B1 (explanation field shown to users).
 * Does NOT affect productionEval / speaking scoring dimensions.
 *
 * Goethe B1 Sprechen: Aufgabenbewältigung, Flüssigkeit, Struktur, Grammatik, Wortschatz.
 * Teil 1 = gemeinsame Planung · Teil 2 = strukturierte Präsentation · Teil 3 = Feedback + Fragen.
 */

export const SPRECHEN_DISPLAY_RUBRIC = Object.freeze({
  1:
    'In diesem Teil des Sprechens geht es um Ihre Fähigkeit, eine Aufgabe gemeinsam zu planen, Vorschläge zu machen, darauf zu reagieren und sich zu einigen. Wichtig sind hierbei die Flüssigkeit des Sprechens, die korrekte Grammatik, der passende Wortschatz und die Aufgabenbewältigung.',
  2:
    'In diesem Teil des Sprechens geht es um Ihre Fähigkeit, ein Thema strukturiert zu präsentieren. Wichtig sind hierbei die Flüssigkeit des Sprechens, die korrekte Grammatik, der passende Wortschatz, die Struktur der Präsentation und die Aufgabenbewältigung.',
  3:
    'In diesem Teil des Sprechens geht es um Ihre Fähigkeit, konstruktives Feedback zu geben und auf Fragen zu einem Thema zu antworten. Wichtig sind hierbei die Flüssigkeit des Sprechens, die korrekte Grammatik, der passende Wortschatz und die Aufgabenbewältigung.',
});

/** Goethe A2 Sprechen display rubric (personal_questions / about_self / plan_together). */
export const SPRECHEN_DISPLAY_RUBRIC_A2 = Object.freeze({
  1:
    'In diesem Teil sprechen Sie mit Ihrem Partner/Ihrer Partnerin über persönliche Themen (Geburtstag, Wohnort, Beruf, Hobby). Wichtig sind verständliche Sätze und einfacher Wortschatz auf A2-Niveau.',
  2:
    'In diesem Teil erzählen Sie etwas über Ihr Leben zu einem Kartenthema. Wichtig sind verständliche Inhalte, einfache Satzstruktur und passender Wortschatz auf A2-Niveau.',
  3:
    'In diesem Teil planen Sie gemeinsam etwas und finden einen Termin. Wichtig sind Verständlichkeit, einfache Verhandlung und passender Wortschatz auf A2-Niveau.',
});

/** @param {number} teil 1|2|3 @param {string} [level] */
export function canonicalSprechenExplanation(teil, level = 'B1') {
  const t = Number(teil);
  const lv = String(level || 'B1').trim().toUpperCase();
  const map = lv === 'A2' ? SPRECHEN_DISPLAY_RUBRIC_A2 : SPRECHEN_DISPLAY_RUBRIC;
  return map[t] || null;
}
