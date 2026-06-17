/**
 * Build a validated B1 sample exam from bank assembly + CEFR-calibrated reading passage.
 * Reading passage matches scripts/test-cefr-gate.mjs fixture (deterministic, in-repo).
 */
export const B1_DE_READING_PASSAGE = [
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

export function buildCompositeB1Exam({ ExamBlueprint, ExamBuilder, bank, blueprint, attempt = 1 }) {
  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rng = mulberry32(attempt * 7919);
  const orig = Math.random;
  Math.random = rng;
  try {
    const assembled = ExamBlueprint.assemble(bank, blueprint);
    const exam = ExamBuilder.buildFromBlueprint('de', 'B1', bank, blueprint, { assembled });
    let hasText = false;
    (exam.lesenParts || []).forEach((p) => {
      if (p.text != null) {
        p.text = B1_DE_READING_PASSAGE;
        hasText = true;
      }
    });
    if (!hasText && exam.lesenParts?.[0]) {
      exam.lesenParts[0].text = B1_DE_READING_PASSAGE;
    }
    (exam.horenParts || []).forEach((p) => {
      p.transcript = B1_DE_READING_PASSAGE;
      (p.segments || []).forEach((s) => {
        s.transcript = B1_DE_READING_PASSAGE;
      });
    });
    exam.libraryCurated = true;
    return { exam, sourceBankIds: assembled.selected.map((q) => q.id), attempt };
  } finally {
    Math.random = orig;
  }
}
