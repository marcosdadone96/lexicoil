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

/** @param {number} teil 1|2|3 */
export function canonicalSchreibenExplanation(teil) {
  return SCHREIBEN_DISPLAY_RUBRIC[Number(teil)] || null;
}
