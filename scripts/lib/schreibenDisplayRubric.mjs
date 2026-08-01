/**
 * Canonical display rubric for Schreiben B1 (explanation field shown to users).
 * Does NOT affect writingCorrectionPrompt / productionEval scoring dimensions.
 *
 * Goethe B1: Erfüllung, Kohärenz, Wortschatz, Strukturen — T1/T2 0–10 each; T3 split 4/4/6/6.
 */

export const SCHREIBEN_DISPLAY_RUBRIC = Object.freeze({
  1:
    'Bewertung (Goethe-offiziell): Erfüllung (0–10) – alle 3 Punkte behandelt; Kohärenz (0–10) – Textaufbau und Verknüpfung; Wortschatz (0–10) – B1-Niveau; Strukturen (0–10) – Grammatik B1. Ca. 80 Wörter (unter 50 % oder Thema verfehlt → Erfüllung 0). Anrede/Gruß: informell – du-Form.',
  2:
    'Bewertung (Goethe-offiziell): Erfüllung (0–10) – Meinung, Begründung, Vor- und Nachteile behandelt; Kohärenz (0–10) – Textaufbau und Verknüpfung; Wortschatz (0–10) – B1-Niveau; Strukturen (0–10) – Grammatik B1. Ca. 80 Wörter (unter 50 % oder Thema verfehlt → Erfüllung 0). Anrede/Gruß: Forumsbeitrag – kein Briefregister nötig.',
  3:
    'Bewertung (Goethe-offiziell): Erfüllung (0–4) – Mitteilung vollständig (alle 3 Punkte); Kohärenz (0–4) – Textaufbau; Wortschatz (0–6) – B1-Niveau; Strukturen (0–6) – Grammatik B1. Ca. 40 Wörter (unter 50 % oder Thema verfehlt → Erfüllung 0). Anrede/Gruß passend zum Empfänger im Aufgabentext.',
});

export const SCHREIBEN_DISPLAY_RUBRIC_B2 = Object.freeze({
  1:
    'Bewertung (Goethe-offiziell B2): Erfüllung – Meinung, Gründe, Vorschläge, Vor- und Nachteile; Kohärenz; Wortschatz B2; Strukturen B2. Mindestens 150 Wörter (unter 50 % → Erfüllung 0). Forumsregister.',
  2:
    'Bewertung (Goethe-offiziell B2): Erfüllung – Situation, Bitte um Verständnis, Vorschlag, Verständnis zeigen; Kohärenz; Wortschatz B2; Strukturen B2. Mindestens 100 Wörter (unter 50 % → Erfüllung 0). Anrede und Gruß zum Vorgesetzten.',
});

/** Goethe A2 Schreiben: Teil 1 (20–30 Wörter, oft du/informell) + Teil 2 (30–40 Wörter, Sie an Chef/Behörde). */
export const SCHREIBEN_DISPLAY_RUBRIC_A2 = Object.freeze({
  1:
    'Bewertung (Goethe-offiziell A2): Erfüllung (0–10) – alle 3 Punkte behandelt; Kohärenz (0–10) – Textaufbau und Verknüpfung; Wortschatz (0–10) – A2-Niveau; Strukturen (0–10) – Grammatik A2. 20–30 Wörter (unter 50 % oder Thema verfehlt → Erfüllung 0). Anrede/Gruß passend zum Empfänger im Aufgabentext (oft informell – du-Form).',
  2:
    'Bewertung (Goethe-offiziell A2): Erfüllung (0–10) – alle 3 Punkte behandelt; Kohärenz (0–10) – Textaufbau und Verknüpfung; Wortschatz (0–10) – A2-Niveau; Strukturen (0–10) – Grammatik A2. 30–40 Wörter (unter 50 % oder Thema verfehlt → Erfüllung 0). Anrede/Gruß: formell – Sie-Form zum Empfänger im Aufgabentext.',
});

/** @param {number} teil 1|2|3 @param {string} [level] */
export function canonicalSchreibenExplanation(teil, level = 'B1') {
  const lv = String(level || 'B1').trim().toUpperCase();
  if (lv === 'B2') return SCHREIBEN_DISPLAY_RUBRIC_B2[Number(teil)] || null;
  if (lv === 'A2') return SCHREIBEN_DISPLAY_RUBRIC_A2[Number(teil)] || null;
  return SCHREIBEN_DISPLAY_RUBRIC[Number(teil)] || null;
}
