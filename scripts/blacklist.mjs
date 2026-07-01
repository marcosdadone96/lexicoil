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
