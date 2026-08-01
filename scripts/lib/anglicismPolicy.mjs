/**
 * B2 Tier-A anglicism policy (Goethe workplace register).
 * A2/B1: stricter — Tier A not promoted; raw English always blocked.
 */
export const B2_TIER_A_LOANWORDS = [
  'Deadline',
  'Meeting',
  'Team',
  'Homeoffice',
  'Feedback',
  'E-Mail',
  'Projekt',
];

/** Preferred German alternatives in new generation (~50% rotation in prompts). */
export const B2_TIER_A_GERMAN_PREFER = {
  Deadline: ['Frist', 'Abgabetermin', 'Termin'],
  Meeting: ['Besprechung', 'Termin'],
  Team: ['Gruppe', 'Kollegium'],
  Homeoffice: ['Homeoffice', 'Arbeiten von zu Hause'],
  Feedback: ['Rückmeldung', 'Feedback'],
  'E-Mail': ['E-Mail', 'Nachricht'],
  Projekt: ['Projekt', 'Vorhaben'],
};

/** English not integrated into German exam copy (all levels). */
export const RAW_ENGLISH_PATTERNS = [
  { term: /\bgardening\b/i, suggestion: 'Gartenarbeit / Gärtnern' },
  { term: /\bjogging\b/i, suggestion: 'Joggen / Laufen' },
  { term: /\bhiking\b/i, suggestion: 'Wandern' },
  { term: /\bcycling\b/i, suggestion: 'Radfahren' },
  { term: /\bworkshop\b/i, suggestion: 'Kurs / Seminar / Werkstatt' },
  { term: /\bshopping\b/i, suggestion: 'Einkaufen' },
  { term: /\bthe\s+deadline\b/i, suggestion: 'die Frist / die Deadline (capitalized noun)' },
  { term: /\bthe\s+meeting\b/i, suggestion: 'das Meeting / die Besprechung' },
  { term: /\bteam\s+meeting\b/i, suggestion: 'Teambesprechung / Besprechung' },
  { term: /\bfeedback\s+session\b/i, suggestion: 'Rückmeldung / Gespräch' },
  { term: /\blatecoming\b/i, suggestion: 'Verspätung / zu spät kommen' },
  { term: /\blittering\b/i, suggestion: 'Müll hinterlassen / Abfall werfen' },
];

/**
 * Integrated loanwords / brands allowed in German exam copy (ASCII tokens).
 * Lowercase keys — checked before generic English-morphology heuristic fires.
 */
export const INTEGRATED_ASCII_LOANWORDS = new Set([
  'team', 'meeting', 'deadline', 'feedback', 'email', 'online', 'ticket', 'vip',
  'computer', 'internet', 'streaming', 'boxing', 'fitness', 'dance', 'yoga',
  'pilates', 'popcorn', 'snacks', 'cross', 'trainer', 'blog', 'app', 'cool',
  'style', 'trend', 'event', 'ticket', 'snack', 'café', 'cafe', 'kino',
  'sauna', 'whirlpool', 'massage', 'cardio', 'zumba', 'sport', 'park',
]);

/** English derivational suffixes on pure-ASCII tokens (not integrated loans). */
const ENGLISH_MORPHOLOGY_SUFFIXES =
  /(?:ing|ness|ment|tion|sion|able|ible|ous|less|ful|ward|ship|proof|down|off|out|back|side|coming|over)$/i;

/**
 * Heuristic: embedded English token in otherwise German copy (A2/B1 gate).
 * Skips URLs, emails, single-letter codes, ALL-CAPS acronyms.
 */
export function findEmbeddedEnglishTokenIssues(text) {
  const issues = [];
  const raw = String(text || '');
  if (!raw.trim()) return issues;

  const seen = new Set();
  for (const m of raw.matchAll(/\b([A-Za-z]{5,})\b/g)) {
    const token = m[1];
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (/^[A-Z]{2,}$/.test(token)) continue;
    if (/[äöüßÄÖÜ]/.test(token)) continue;
    if (INTEGRATED_ASCII_LOANWORDS.has(key)) continue;
    if (/^(?:www|http|mailto)/i.test(token)) continue;

    const looksEnglish =
      ENGLISH_MORPHOLOGY_SUFFIXES.test(token)
      || (key.endsWith('ing') && key.length >= 7);

    if (!looksEnglish) continue;

    issues.push(
      `inglés embebido «${token}» — usa equivalente alemán (p. ej. Verspätung statt Latecoming)`,
    );
  }
  return issues;
}

export const B2_ANGLICISM_PROMPT_HINT =
  'Préstamos Tier A (registro laboral B2): Deadline, Meeting, Team, Homeoffice, Feedback, E-Mail, Projekt — ' +
  'SOLO como sustantivo alemán capitalizado («die Frist» / «die Deadline», «das Meeting»). ' +
  'En textos nuevos alterna ~50% con alemán puro: Frist, Abgabetermin, Termin, Besprechung, Rückmeldung, Vorhaben. ' +
  'PROHIBIDO inglés crudo (the deadline, workshop, gardening…).';

export function isB2TierALoanwordToken(word) {
  const w = String(word || '').trim();
  return B2_TIER_A_LOANWORDS.some((t) => t.toLowerCase() === w.toLowerCase());
}

/** Tier A must appear capitalized (German noun) in B2 copy. */
export function findB2TierACapitalizationIssues(text) {
  const issues = [];
  const t = String(text || '');
  for (const loan of B2_TIER_A_LOANWORDS) {
    const lower = new RegExp(`(?<![A-ZÄÖÜa-zäöüß-])${loan.replace('-', '[-\\-]')}\\b`, 'i');
    if (lower.test(t) && !new RegExp(`\\b${loan.replace('-', '[-\\-]')}\\b`).test(t)) {
      issues.push(`«${loan}» debe ir capitalizado como sustantivo alemán`);
    }
  }
  return issues;
}

export function findRawEnglishIssues(text) {
  const issues = [];
  const t = String(text || '');
  for (const { term, suggestion } of RAW_ENGLISH_PATTERNS) {
    if (term.test(t)) {
      const m = t.match(term)?.[0] || '';
      issues.push(`inglés no integrado «${m}» → ${suggestion}`);
    }
  }
  return issues;
}

/**
 * @param {string} level
 * @param {string} text
 * @returns {string[]} Blocking anglicism issues for generation/audit gates.
 * Morphology heuristic (findEmbeddedEnglishTokenIssues) is scan-only — too many
 * German -tion/-sion false positives for a hard gate (see gate-logs anglicism scan 2026-08-01).
 */
export function anglicismIssuesForText(level, text) {
  const lv = String(level || 'B1').trim().toUpperCase();
  const issues = findRawEnglishIssues(text);
  if (lv === 'B2') {
    issues.push(...findB2TierACapitalizationIssues(text));
  }
  return [...new Set(issues)];
}

/** Optional retrieval normalization (does not rewrite exam text). */
export function vocabularyLemmaForAnglicism(word, level = 'B2') {
  const lv = String(level || 'B2').trim().toUpperCase();
  if (lv !== 'B2') return word;
  const w = String(word || '').trim();
  if (/^deadline$/i.test(w)) return 'Frist';
  if (/^meeting$/i.test(w)) return 'Termin';
  return w;
}
