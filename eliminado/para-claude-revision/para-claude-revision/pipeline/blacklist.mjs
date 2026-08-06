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
];
