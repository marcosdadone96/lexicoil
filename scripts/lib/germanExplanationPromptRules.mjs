/**
 * Shared German-only rules for MCQ explanation repair prompts (CHK-18b, length bias, pool remediation).
 */

export const FORBIDDEN_SPANISH_EXPLANATION_PHRASES = Object.freeze([
  'La opción',
  'El pasaje indica',
  'ha sido acortada',
  'Según el pasaje',
  'El texto indica',
  'sesgo de longitud',
]);

/** Compact block — prepend to any explanation repair prompt. */
export function germanExplanationLanguageRulesBlock() {
  return (
    `## Sprache (PFLICHT)\n` +
    `- NUR Deutsch B1 — die explanation ist Prüfungstext für Lernende.\n` +
    `- KEINE spanischen Meta-Kommentare, KEINE Reparatur-Narration.\n` +
    `- VERBOTEN (wörtlich oder sinngemäß): "La opción", "El pasaje indica", "ha sido acortada", ` +
    `"Según el pasaje", "El texto indica", "sesgo de longitud".\n` +
    `- Schreibe wie ein Goethe-Prüfer: sachlich, auf Deutsch, ohne Prozess-Kommentare.\n`
  );
}

/** Anchor justification to the correct option body (not wrong-option overlap alone). */
export function buildCorrectOptionAnchorBlock(letter, correctBody) {
  return (
    `## Pflicht-Inhalt der explanation\n` +
    `Schreibe 1–2 Sätze, die NUR begründen, warum Option ${letter}) laut Passage richtig ist.\n` +
    `Paraphrasiere den Inhalt der korrekten Option mit B1-Synonymen:\n` +
    `«${correctBody || '?'}»\n` +
    `- Mindestens 10 Wörter.\n` +
    `- Begründe die korrekte Option durch Bedeutung — nicht durch Länge oder Reparatur.\n` +
    `- Keine falschen Optionen rechtfertigen.\n` +
    `- Keine ≥5 Wörter hintereinander aus dem Passage kopieren.\n`
  );
}

/** One-liner for length-bias / batch repair prompts that also return explanation. */
export function germanExplanationRulesInline() {
  return (
    `- explanation: NUR Deutsch B1; VERBOTEN spanische Meta-Phrasen ("La opción", "El pasaje indica", ` +
    `"ha sido acortada", "Según el pasaje"); begründe nur die korrekte Option — keine Reparatur-Narration.\n`
  );
}
