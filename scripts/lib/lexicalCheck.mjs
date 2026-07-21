/**
 * Lexical context check for generated German exam content.
 *
 * Detects words that are technically German but used in the wrong semantic context —
 * errors that spell-checkers miss because the word exists, but the meaning is wrong.
 *
 * Usage:
 *   const result = checkLexical(batch);
 *   if (!result.ok) console.log(result.issues);
 */

import { BLACKLIST, B2_QUESTION_BLACKLIST, questionBlacklistForLevel, questionBlacklistLabel, questionBlacklistTargetLevel } from '../blacklist.mjs';
import { isVocabBankLemma, loadVocabBankLemmaSet, foldLemma } from './vocabBank.mjs';

/**
 * Each rule:
 *   word       — the problematic word (case-insensitive, exact word boundary)
 *   context    — regex that indicates a wrong-context usage
 *   suggestion — what to use instead
 *   message    — human-readable error
 */

const LEXICAL_RULES = [
  // "ledig" means "unmarried/single", NOT "available/free"
  {
    word: /\bledig\b/i,
    context: /\b(platz|stelle|wohnung|zimmer|raum|fläche|kapazität|termin|slot)\b/i,
    suggestion: 'frei / verfügbar',
    message: '«ledig» bedeutet "unverheiratet", nicht "verfügbar". Verwende «frei» oder «verfügbar».',
  },
  // "empfand" (past of empfinden=to feel) used instead of "fand" (to find/think)
  {
    word: /\bempfand\b/i,
    context: /\b(er|sie|es|man|ich|wir|ihr|du)\s+(empfand|das|die|es)\b/i,
    suggestion: 'fand',
    message: '«empfand» (=fühlte) klingt zu literarisch. Für "fand/meinte" lieber «fand» oder «hielt für».',
  },
  // "unverheiratet" used where "verfügbar/frei" is intended
  {
    word: /\bunverheiratet\b/i,
    context: /\b(platz|wohnung|zimmer|stelle)\b/i,
    suggestion: 'frei / verfügbar',
    message: '«unverheiratet» (=not married) passt nicht als "verfügbar". Verwende «frei» oder «leer».',
  },
  // "akquirieren" — too formal/business for B1 texts
  {
    word: /\bakquirieren\b/i,
    context: null, // always flag
    suggestion: 'gewinnen / finden / bekommen',
    message: '«akquirieren» ist zu formal für B1. Verwende «gewinnen», «finden» oder «bekommen».',
  },
  // "Eigenregie" — corporate jargon, rarely B1
  {
    word: /\bEigenregie\b/i,
    context: null,
    suggestion: 'selbst / alleine',
    message: '«Eigenregie» ist Firmenjargon, zu komplex für B1. Verwende «selbst» oder «in eigener Hand».',
  },
  // "faszinierend" + educational tone — OK alone but flagged in passages
  {
    word: /\bfaszinierend\b/i,
    context: /\b(es ist|das ist|wirklich|sehr)\s+faszinierend\b/i,
    suggestion: 'interessant / toll / spannend',
    message: '«faszinierend» klingt zu literarisch für B1-Pressen. Verwende «interessant» oder «spannend».',
  },
  // "Sie + Verb in 3rd person singular" in conditional (common grammar mistake)
  // e.g. "Wenn Sie uns unterstützt" → should be "unterstützen"
  {
    word: /\bSie\s+\w+t\b/,
    context: /\bWenn Sie \w+t\b|\bfalls Sie \w+t\b|\bsobald Sie \w+t\b/i,
    suggestion: 'Verb im Infinitiv-Plural (unterstützen, helfen, kommen…)',
    message:
      'Grammatikfehler: «Wenn/Falls Sie [Verb+t]» — Sie (Höflichkeitsform) braucht Plural: «Wenn Sie unterstützen» (nicht «unterstützt»).',
  },
  // "authentisch" — too sophisticated for B1 passages
  {
    word: /\bauthentisch\b/i,
    context: /\b(sehr|wirklich|echt)\s+authentisch\b|\bauthentisches?\s+(erlebnis|erfahrung|gefühl)\b/i,
    suggestion: 'echt / wirklich / natürlich',
    message: '«authentisch» ist für B1 zu komplex. Verwende «echt» oder «wirklich».',
  },
];

function pushBlacklistIssues(issues, field, text, entries, label, targetLevel = 'B1') {
  for (const entry of entries) {
    if (!entry.term.test(text)) continue;
    const match = text.match(entry.term)?.[0] || '';
    const msg = entry.grammar
      ? `${field}: error gramatical «${match}» → ${entry.suggestion}`
      : `${field}: ${label} «${match}» → usa «${entry.suggestion}» (${targetLevel})`;
    issues.push(msg);
  }
}

/**
 * True if a lemma/inflected form matches the C1/C2 passage blacklist (BLACKLIST).
 * Used to pre-filter prompt target words before generation.
 */
export function isBlacklistedLemma(word) {
  const text = String(word || '').trim();
  if (!text) return false;
  return BLACKLIST.some((entry) => entry.term.test(text));
}

/**
 * Filter prompt target words.
 * Admission is POSITIVE (whitelist): lemma must exist in library/vocab/{lang}/{level}.json.
 * Blacklist C1/C2 is a second barrier.
 *
 * @param {string[]} words
 * @param {{ log?: boolean, lang?: string, level?: string, requireBank?: boolean }} [opts]
 * @returns {string[]}
 */
export function filterPromptTargetWords(
  words,
  { log = true, lang = 'de', level = 'B1', requireBank = true } = {},
) {
  const bank = requireBank ? loadVocabBankLemmaSet(lang, level) : null;
  const qBlacklist = questionBlacklistForLevel(level);
  const kept = [];
  for (const w of words || []) {
    const word = String(w).trim();
    if (!word) continue;
    const key = foldLemma(word);
    if (requireBank && bank && !bank.has(key)) {
      if (log) console.log(`Palabra excluida (fuera de banco ${level}): ${word}`);
      continue;
    }
    if (isBlacklistedLemma(word)) {
      if (log) console.log(`Palabra excluida (registro C1/C2): ${word}`);
      continue;
    }
    if (qBlacklist.some((entry) => entry.term.test(word))) {
      if (log) console.log(`Palabra excluida (registro ${level === 'A2' ? 'B1+' : 'B2+'}): ${word}`);
      continue;
    }
    kept.push(word);
  }
  return kept;
}

export { isVocabBankLemma, loadVocabBankLemmaSet };

/** Passage-side text fields (title, body, signText on passage). */
export function extractPassageLexicalTexts(batch) {
  const texts = [];
  for (const p of batch.passages || []) {
    if (p.title) texts.push({ field: `passage ${p.id} title`, text: p.title });
    if (p.text) texts.push({ field: `passage ${p.id} text`, text: p.text });
    if (p.signText) texts.push({ field: `passage ${p.id} signText`, text: p.signText });
  }
  return texts;
}

/** Question-side text fields — gate target for B2 vocabulary (P0). */
export function extractQuestionLexicalTexts(batch) {
  const texts = [];
  for (const q of batch.questions || []) {
    if (q.question) texts.push({ field: `question ${q.id}`, text: q.question });
    if (q.explanation) texts.push({ field: `question ${q.id} explanation`, text: q.explanation });
    if (q.signText) texts.push({ field: `question ${q.id} signText`, text: q.signText });
    for (const opt of q.options || []) {
      texts.push({ field: `question ${q.id} option`, text: String(opt) });
    }
  }
  return texts;
}

/** All free-text fields (passages + questions). */
function extractAllLexicalTexts(batch) {
  return [...extractPassageLexicalTexts(batch), ...extractQuestionLexicalTexts(batch)];
}

function runLexicalRules(texts, issues, warnings) {
  for (const { field, text } of texts) {
    for (const rule of LEXICAL_RULES) {
      if (!rule.word.test(text)) continue;
      if (rule.context && !rule.context.test(text)) continue;

      const isGrammar = rule.message.toLowerCase().includes('grammatik');
      const msg = `${field}: ${rule.message} → sugiere «${rule.suggestion}»`;
      if (isGrammar) issues.push(msg);
      else warnings.push(msg);
    }
  }
}

/**
 * @param {object} batch
 * @param {{ level?: string }} [opts]
 * @returns {{ ok: boolean, issues: string[], warnings: string[] }}
 */
export function checkLexical(batch, opts = {}) {
  const level = String(
    opts.level || batch?.level || batch?.questions?.[0]?.level || batch?.passages?.[0]?.level || 'B1',
  ).toUpperCase();
  const issues = [];
  const warnings = [];
  const passageTexts = extractPassageLexicalTexts(batch);
  const questionTexts = extractQuestionLexicalTexts(batch);
  const qBlacklist = questionBlacklistForLevel(level);
  const qLabel = questionBlacklistLabel(level);
  const qTarget = questionBlacklistTargetLevel(level);

  runLexicalRules([...passageTexts, ...questionTexts], issues, warnings);

  for (const { field, text } of extractAllLexicalTexts(batch)) {
    pushBlacklistIssues(issues, field, text, BLACKLIST, 'vocabulario C1/C2', 'B1');
  }

  for (const { field, text } of questionTexts) {
    pushBlacklistIssues(issues, field, text, qBlacklist, qLabel, qTarget);
  }

  return { ok: issues.length === 0, issues, warnings, level };
}

/** Format a lexical check result for CLI output. */
export function formatLexicalReport(result) {
  const lines = [];
  if (result.ok && !result.warnings?.length) {
    lines.push('Léxico OK ✅');
  } else if (!result.ok) {
    lines.push(`Léxico FAIL (${result.issues.length} errores)`);
    for (const i of result.issues) lines.push(`  ✗ ${i}`);
  }
  if (result.warnings?.length) {
    lines.push(`Avisos léxicos (${result.warnings.length}):`);
    for (const w of result.warnings) lines.push(`  · ${w}`);
  }
  return lines.join('\n');
}
