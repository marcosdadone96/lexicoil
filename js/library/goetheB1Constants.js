/**
 * Goethe B1 (Erwachsene) — fixed Modellsatz structures shared by blueprint, builder, and validator.
 */
const GOETHE_B1_SCHREIBEN_WORDS = Object.freeze({
  1: { min: 80, max: 80, target: 80 },
  2: { min: 80, max: 80, target: 80 },
  3: { min: 40, max: 40, target: 40 },
});

const GOETHE_A2_SCHREIBEN_WORDS = Object.freeze({
  1: { min: 20, max: 30, target: 25 },
  2: { min: 30, max: 40, target: 35 },
});

const GOETHE_B1_PRESENTATION_SLIDES = Object.freeze([
  { n: 1, title: 'Thema vorstellen + Struktur' },
  { n: 2, title: 'Persönliche Erfahrung' },
  { n: 3, title: 'Situation im Heimatland' },
  { n: 4, title: 'Vor- und Nachteile + Meinung' },
  { n: 5, title: 'Abschluss + Dank' },
]);

const GOETHE_B1_LESEN_T3_EXAMPLE = Object.freeze({
  number: 0,
  label: 'Beispiel',
  situation:
    'Sie möchten einen Sprachkurs für Ihre Oma buchen. Ihre Oma ist 78 Jahre alt und spricht kein Deutsch. Sie sucht einen Kurs, der speziell für ältere Menschen ist.',
  correct: '0',
});

const GOETHE_B1_AD_KEYS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);

if (typeof module !== 'undefined') {
  module.exports = {
    GOETHE_B1_SCHREIBEN_WORDS,
    GOETHE_A2_SCHREIBEN_WORDS,
    GOETHE_B1_PRESENTATION_SLIDES,
    GOETHE_B1_LESEN_T3_EXAMPLE,
    GOETHE_B1_AD_KEYS,
  };
}
if (typeof window !== 'undefined') {
  window.GoetheB1Constants = {
    GOETHE_B1_SCHREIBEN_WORDS,
    GOETHE_A2_SCHREIBEN_WORDS,
    GOETHE_B1_PRESENTATION_SLIDES,
    GOETHE_B1_LESEN_T3_EXAMPLE,
    GOETHE_B1_AD_KEYS,
  };
}
