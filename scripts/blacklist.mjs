/**
 * blacklist.mjs — única fuente de verdad de léxico C1/C2 prohibido en textos B1.
 *
 * Importada por: lexicalCheck.mjs (gate bloqueante en pipeline)
 *                audit-pass-2.mjs → chk6 (gate bloqueante en auditoría)
 *
 * Campos:
 *   term       {RegExp}  — patrón con \b…\b, case-insensitive
 *   suggestion {string}  — alternativa B1 recomendada
 *   grammar    {boolean} — true si es error gramatical (no solo nivel)
 */
export const BLACKLIST = [
  // ── Fremdwörter / latinismos claramente sobre B1 ──────────────────────────
  { term: /\bAntithese\b/i,            suggestion: 'Gegensatz / Unterschied' },
  { term: /\bDichotomie\b/i,           suggestion: 'Gegensatz / Unterschied' },
  { term: /\bimplementier\w*\b/i,      suggestion: 'einführen / umsetzen / einrichten' },
  { term: /\bevaluier\w*\b/i,          suggestion: 'bewerten / beurteilen / prüfen' },
  { term: /\binhärent\b/i,             suggestion: 'typisch für / natürlich' },
  { term: /\bsukzessive\b/i,           suggestion: 'schrittweise / nach und nach' },
  { term: /\bpartizipier\w*\b/i,       suggestion: 'teilnehmen / mitmachen' },
  { term: /\boptimier\w*\b/i,          suggestion: 'verbessern / besser machen' },
  { term: /\bKompatibilität\b/i,       suggestion: 'Vereinbarkeit / Verträglichkeit' },
  { term: /\bKonzeptionierung\b/i,     suggestion: 'Planung / Entwurf' },
  { term: /\bGrünanlage\b/i,           suggestion: 'Park / Grünfläche / Garten' },
  { term: /\bZerstreuung\b/i,          suggestion: 'Ablenkung / Entspannung / Spaß' },
  { term: /\bInfrastruktur\b/i,        suggestion: 'Einrichtungen / Versorgung / Verkehrsnetz' },
  { term: /\bLegitimation\b/i,         suggestion: 'Berechtigung / Ziel / Zweck' },
  { term: /\blegitimier\w*\b/i,        suggestion: 'erlauben / berechtigen / genehmigen' },
  { term: /\bUrbanisierung\b/i,        suggestion: 'Stadtentwicklung / Zuzug in Städte' },
  { term: /\bsystemisch\b/i,           suggestion: 'strukturell / grundlegend / übergreifend' },
  { term: /\bGesellschaftstheorie\b/i, suggestion: 'Gesellschaftslehre / Sozialwissenschaft' },
  { term: /\bKonsequenzen? der\b/i,    suggestion: 'Folgen von' },
  // ── Errores gramaticales (grammar: true) ─────────────────────────────────
  { term: /\bbeständen\b/i,  suggestion: 'bestünden (Konjunktiv II correcto)', grammar: true },
  { term: /\bbesass\b/,      suggestion: 'besaß (Standarddeutsch)',            grammar: true },
  { term: /\bheiss\b/,       suggestion: 'heiß (Standarddeutsch)',             grammar: true },
  { term: /\bweiss\b/,       suggestion: 'weiß (Standarddeutsch)',             grammar: true },
  { term: /zu viel zu \w+er\b/i, suggestion: 'zu [Adjektiv] (p.ej. "zu teuer")', grammar: true },
  // ── Artefactos de generación: palabras no-alemanas que no deben aparecer ──
  { term: /\bflojos?\b/i,    suggestion: '(artefacto de generación — eliminar)', grammar: true },
  { term: /\bStichworte:\s/i, suggestion: '(inyección artificial — eliminar del anuncio)', grammar: true },
  // ── Anglicismos puros que nunca deben aparecer en texto B1 alemán ────────
  // Estos tienen equivalentes alemanes directos y no deben usarse en textos B1.
  // Nota: los préstamos del inglés aceptados como sustantivos alemanes (Team,
  // Deadline, Meeting, etc.) son válidos si van capitalizados; su no-capitalización
  // se controla en CHK-14, no aquí.
  { term: /\bgardening\b/i,  suggestion: 'Gartenarbeit / Gartenpflege / Gärtnern' },
  { term: /\bjogging\b/i,    suggestion: 'Joggen / Laufen' },
  { term: /\bhiking\b/i,     suggestion: 'Wandern / Wanderung' },
  { term: /\bcycling\b/i,    suggestion: 'Radfahren / Fahrradfahren' },
  { term: /\bsurfing\b/i,    suggestion: 'Surfen / Wellenreiten' },
  { term: /\bswimming\b/i,   suggestion: 'Schwimmen / Schwimmtraining' },
  { term: /\bcooking class/i, suggestion: 'Kochkurs' },
  { term: /\bcleaning day\b/i, suggestion: 'Putztag / Reinigungstag' },
  { term: /\bopen space\b/i, suggestion: 'Freifläche / offener Bereich' },
  { term: /\bworkshop\b/i,   suggestion: 'Workshop → Kurs / Seminar / Werkstatt' },
  { term: /\blatecoming\b/i, suggestion: 'Verspätung / zu spät kommen / kein Einlass nach Filmstart' },
  // ── Vocabulario C1+ inapropiado para B1 ──────────────────────────────────
  { term: /\bkontextualisier\w*/i, suggestion: 'erklären / einordnen (B1-Niveau)', grammar: false },
  { term: /\bPolyphonie\b/i,       suggestion: 'Klang / Musik (B1-Niveau)',          grammar: false },
  { term: /\bEpistemologie\b/i,    suggestion: '(C1-Fachbegriff — nicht B1)',         grammar: false },
  { term: /\bManifestati\w+\b/i,   suggestion: 'Ausdruck / Zeichen (B1-Niveau)',      grammar: false },
  { term: /\bparadigmat\w*\b/i,    suggestion: 'typisch / grundlegend (B1-Niveau)',   grammar: false },
  { term: /\bdiskursiv\b/i,        suggestion: 'inhaltlich / sprachlich (B1-Niveau)', grammar: false },
  { term: /\binterdisziplin\w*\b/i,suggestion: 'fächerübergreifend (B1-Niveau)',      grammar: false },
  { term: /\bPräzedenz\w*\b/i,     suggestion: 'Beispiel / Vorbild (B1-Niveau)',      grammar: false },
];

/**
 * B2+ vocabulary forbidden in Lesen QUESTIONS (question, options, explanation, signText).
 * Passages may still use some of these; questions/explanations must stay ≤ B1 for comprehension.
 * Checked by checkLexical (pipeline) and CHK-6b (audit-pass-2).
 */
export const B2_QUESTION_BLACKLIST = [
  { term: /\bmodifizier\w*\b/i,              suggestion: 'ändern / anpassen' },
  { term: /\bGelassenheit\b/i,               suggestion: 'Ruhe / Entspannung / entspannt' },
  { term: /\bAngehörig\w*\b/i,               suggestion: 'Familie / Verwandte' },
  { term: /\belektronisch\w*\s+Mitteilung\w*\b/i, suggestion: 'Nachrichten / SMS' },
  { term: /\bMitteilungen\b/i,               suggestion: 'Nachrichten' },
  { term: /\bsich\s+austausch\w*\b/i,         suggestion: 'sprechen / schreiben / kommunizieren' },
  { term: /\bUmstellung\b/i,                 suggestion: 'Änderung / neue Regel' },
  { term: /\bDiskriminierung\b/i,            suggestion: 'Ungerechtigkeit / Unterschied' },
  { term: /\bPräzision\b/i,                  suggestion: 'Genauigkeit / richtig schreiben' },
  { term: /\bBürokratie\b/i,                 suggestion: 'viel Papierkram / viele Formulare' },
  { term: /\bPotenzial\b/i,                  suggestion: 'Möglichkeit / Chance' },
  { term: /\bRessourc\w*\b/i,                suggestion: 'Mittel / Möglichkeiten' },
  { term: /\bNutzererfahrung\b/i,            suggestion: 'Erfahrung mit der App' },
  { term: /\bBenutzerfreundlich\w*\b/i,      suggestion: 'einfach zu bedienen' },
  { term: /\bKommunikationsmittel\b/i,       suggestion: 'Nachrichten / Telefon' },
  { term: /\bKommunikationskanal\w*\b/i,    suggestion: 'Telefon / E-Mail / Chat' },
  { term: /\beigene\s+Marke\b/i,             suggestion: 'bekannter werden / mehr Kunden' },
  { term: /\bMarke\s+stärken\b/i,            suggestion: 'bekannter werden' },
  { term: /\bHerausforderung\w*\b/i,         suggestion: 'Probleme / Schwierigkeiten' },
  { term: /\bPerspektiv\w*\b/i,               suggestion: 'Sicht / Meinung' },
  { term: /\bReflexion\w*\b/i,               suggestion: 'Nachdenken / Überlegung' },
  { term: /\bReflektion\w*\b/i,              suggestion: 'Nachdenken / Überlegung' },
  { term: /\bAspekt\w*\b/i,                  suggestion: 'Teil / Punkt' },
  { term: /\bKonsequenz\w*\b/i,               suggestion: 'Folge / Ergebnis' },
  { term: /\bDatensicherheit\b/i,            suggestion: 'Sicherheit der Daten / Privatsphäre' },
  { term: /\bProtokoll\w*\b/i,               suggestion: 'Regeln / Anleitung' },
  { term: /\bPriorität\w*\b/i,               suggestion: 'Wichtigkeit / wichtig' },
  { term: /\bKlarheit\b/i,                   suggestion: 'deutlich / verständlich' },
  { term: /\bZugänglich\w*\b/i,              suggestion: 'einfach / offen' },
  { term: /\bReichweite\b/i,                 suggestion: 'viele Menschen / Bekanntheit' },
  { term: /\bZielgruppe\w*\b/i,              suggestion: 'Teilnehmer' },
  { term: /\bBranding\b/i,                   suggestion: 'Marke / Werbung' },
  { term: /\bCorporate\b/i,                  suggestion: 'Firma / Unternehmen' },
  { term: /\bMarketing\b/i,                  suggestion: 'Werbung / Reklame' },
];

/**
 * B1+ vocabulary forbidden in A2 QUESTIONS (question, options, explanation, signText).
 * Passages may use B1 words; questions/explanations must stay ≤ A2 for comprehension.
 * Checked by checkLexical (A2 pipeline) and CHK-6c (audit-pass-2).
 */
export const B1_QUESTION_BLACKLIST = [
  { term: /\bHerausforderung\w*\b/i,         suggestion: 'Probleme / Schwierigkeiten' },
  { term: /\bPerspektiv\w*\b/i,               suggestion: 'Sicht / Meinung' },
  { term: /\bDiskriminierung\b/i,            suggestion: 'Ungerechtigkeit / Unterschied' },
  { term: /\bPotenzial\b/i,                  suggestion: 'Möglichkeit / Chance' },
  { term: /\bRessourc\w*\b/i,                suggestion: 'Mittel / Möglichkeiten' },
  { term: /\bUmstellung\b/i,                 suggestion: 'Änderung / neue Regel' },
  { term: /\bReflexion\w*\b/i,               suggestion: 'Nachdenken / Überlegung' },
  { term: /\bReflektion\w*\b/i,              suggestion: 'Nachdenken / Überlegung' },
  { term: /\bKonsequenz\w*\b/i,               suggestion: 'Folge / Ergebnis' },
  { term: /\bAspekt\w*\b/i,                  suggestion: 'Teil / Punkt' },
  { term: /\bPriorität\w*\b/i,               suggestion: 'Wichtigkeit / wichtig' },
  { term: /\bBürokratie\b/i,                 suggestion: 'viel Papierkram / viele Formulare' },
  { term: /\bPräzision\b/i,                  suggestion: 'Genauigkeit / richtig schreiben' },
  { term: /\bGelassenheit\b/i,               suggestion: 'Ruhe / Entspannung' },
  { term: /\bNutzererfahrung\b/i,            suggestion: 'Erfahrung mit der App' },
  { term: /\bBenutzerfreundlich\w*\b/i,      suggestion: 'einfach zu bedienen' },
  { term: /\bKommunikationsmittel\b/i,       suggestion: 'Nachrichten / Telefon' },
  { term: /\bKommunikationskanal\w*\b/i,    suggestion: 'Telefon / E-Mail / Chat' },
  { term: /\bHerausfordernd\b/i,             suggestion: 'schwierig / anstrengend' },
  { term: /\bImplementierung\b/i,            suggestion: 'Einführung / Umsetzung' },
  { term: /\bFlexibilität\b/i,               suggestion: 'freie Zeiten / man kann wählen' },
  { term: /\bWork-Life-Balance\b/i,          suggestion: 'Freizeit und Arbeit' },
  { term: /\bEigenverantwortung\b/i,         suggestion: 'selbst entscheiden' },
  { term: /\bNachhaltigkeit\b/i,             suggestion: 'Umweltschutz / gut für die Natur' },
  { term: /\bDiversität\b/i,                 suggestion: 'Vielfalt / verschiedene Menschen' },
];

/** @param {string} level */
export function questionBlacklistForLevel(level) {
  const lv = String(level || 'B1').trim().toUpperCase();
  if (lv === 'A2') return B1_QUESTION_BLACKLIST;
  if (lv === 'B1') return B2_QUESTION_BLACKLIST;
  return B2_QUESTION_BLACKLIST;
}

/** @param {string} level */
export function questionBlacklistLabel(level) {
  const lv = String(level || 'B1').trim().toUpperCase();
  if (lv === 'A2') return 'vocabulario B1+ en pregunta';
  return 'vocabulario B2+ en pregunta';
}

/** @param {string} level */
export function questionBlacklistTargetLevel(level) {
  const lv = String(level || 'B1').trim().toUpperCase();
  if (lv === 'A2') return 'A2';
  return 'B1';
}
