/**
 * repairTriage.mjs — P2d
 *
 * Triaje determinista de fallos de calidad: repara en código lo que es reparable
 * antes de gastar un reintento LLM pagado.
 *
 * classifyAndRepair(batch, gates) devuelve uno de:
 *   { repaired: true,       batch, calledLlm: false, cube: 'A'|'B', fixed: [...] }
 *   { repaired: 'targeted', cube: 'C', reason, targetedCodes }
 *   { repaired: false, discard: true,  reason }
 *
 * ─── Cubos ───────────────────────────────────────────────────────────────────
 *
 *  A — "reparable en código" (gratis):
 *      CHK-14 (noun caps / over-caps)  → decapitalizeBatchMidSentence + capitalizeBatchNouns
 *      CHK-13 / CHK-19     → balanceMcqGroup + antiRuns
 *      CHK-17 (L3 format)  → normalizeT3
 *      CHK-8 dup IDs       → regenerate unique suffixes
 *
 *  B — "sustitución léxica determinista" (gratis):
 *      gate='lexico' con suggestion 1:1 sin ambigüedad (no "/" ni "→").
 *
 *  C — "reparación semántica dirigida" (LLM sí, acotado):
 *      CHK-18, CHK-7, CHK-16, CHK-10, gate='calidad'.
 *      → Esta versión marca para reintento; el caller gestiona el LLM.
 *
 *  D — "descartar":
 *      Batch vacío/irrecuperable, gate='dedup', o ≥ MAX_MIXED_ISSUES de
 *      cubos distintos sin que A/B lo pueda resolver solo.
 */

import { capitalizeBatchNouns, decapitalizeBatchMidSentence } from './capitalizeNouns.mjs';
import { balanceMcqGroup, antiRuns, derivePartShuffleSeed, shuffleKeyedQuestionOrder } from './balanceMcq.mjs';
import { normalizeT3 } from './normalizeT3.mjs';

// ─── Constants ──────────────────────────────────────────────────────────────

/** CHK codes that can be fixed purely in code (Cubo A). */
const CUBE_A_CODES = new Set(['CHK-14', 'CHK-13', 'CHK-19', 'CHK-17']);

/**
 * CHK codes that require targeted LLM repair (Cubo C) and are not fixable in code.
 * Anything NOT in A or C is treated as "unknown" — falls through to C by default.
 */
const CUBE_C_CODES = new Set(['CHK-18', 'CHK-7', 'CHK-16', 'CHK-10', 'CHK-15', 'CHK-20']);

/**
 * Maximum number of distinct-cube issues before we give up and discard rather
 * than attempting piecemeal repair (Cubo D threshold).
 */
const MAX_MIXED_ISSUES = 6;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract all CHK-NN codes from an array of issue strings.
 * Audit2 issues look like: "[IMPORTANT][CHK-14] Sustantivo …"
 */
function extractChkCodes(issues) {
  const codes = new Set();
  for (const issue of issues) {
    for (const m of String(issue).matchAll(/CHK-(\d+)/g)) {
      codes.add(`CHK-${m[1]}`);
    }
  }
  return codes;
}

/**
 * Parse lexical issues into { term, suggestion } pairs.
 * Format produced by checkLexical:
 *   "field: vocabulario C1/C2 «TERM» → usa «SUGGESTION» (B1)"
 *   "field: error gramatical «TERM» → SUGGESTION"
 */
function parseLexicalIssues(issues) {
  const results = [];
  for (const issue of issues) {
    // Match the matched term (between first «…») and suggestion (between «…» after →)
    const m = String(issue).match(/«(.+?)»\s*→\s*(?:usa\s+)?«(.+?)»/);
    if (m) {
      results.push({ term: m[1].trim(), suggestion: m[2].trim() });
    }
  }
  return results;
}

/**
 * A suggestion is "safe for deterministic substitution" when it is a single
 * unambiguous word/phrase — no "/" alternatives, no "→" internal markers.
 */
function isSingleSuggestion(suggestion) {
  return !suggestion.includes('/') && !suggestion.includes('→') && suggestion.trim().length > 0;
}

/**
 * Apply a literal text substitution across all string values in the batch.
 * Uses case-insensitive matching; preserves surrounding non-alpha characters.
 * Does NOT empty-mutate the original object.
 */
function applyLexSubstitution(obj, term, replacement) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  if (typeof obj === 'string') return obj.replace(re, replacement);
  if (Array.isArray(obj)) return obj.map((v) => applyLexSubstitution(v, term, replacement));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = applyLexSubstitution(v, term, replacement);
    return out;
  }
  return obj;
}

/**
 * Regenerate IDs for questions that have duplicate IDs within the batch.
 * Only changes the `id` field; does not touch passageId references.
 */
function fixDuplicateIds(batch) {
  const seen = new Set();
  const questions = (batch.questions || []).map((q) => {
    if (!q.id || seen.has(q.id)) {
      const suffix = Math.random().toString(36).slice(2, 7);
      return { ...q, id: `${q.id || 'gen'}-${suffix}` };
    }
    seen.add(q.id);
    return q;
  });
  return { ...batch, questions };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * classifyAndRepair(batch, gates)
 *
 * @param {object} batch   - the normalized batch that failed a gate
 * @param {object} gates   - the gates result: { gate, issue, issues, detail }
 * @returns {object}       - see module jsdoc for shape
 */
export function classifyAndRepair(batch, gates) {
  const { gate, issue = '', issues = [] } = gates;

  // ── Cubo D: batch irrecoverable ──────────────────────────────────────────
  if (!batch || !Array.isArray(batch.questions) || batch.questions.length === 0) {
    return { repaired: false, discard: true, reason: 'Batch vacío o irrecuperable' };
  }

  // Dedup failures cannot be repaired in code (content is too similar to existing pool)
  if (gate === 'dedup') {
    return {
      repaired: false,
      discard: true,
      reason: `Deduplicación: ${issue || 'contenido demasiado similar al pool existente'}`,
    };
  }

  // ── Cubo A: audit2 gate with only code-fixable CHK codes ─────────────────
  if (gate === 'audit2') {
    const codes = extractChkCodes(issues);
    const aCodes = [...codes].filter((c) => CUBE_A_CODES.has(c));
    const cCodes = [...codes].filter((c) => CUBE_C_CODES.has(c));
    const unknownCodes = [...codes].filter((c) => !CUBE_A_CODES.has(c) && !CUBE_C_CODES.has(c));

    // Discard if far too many issues from mixed categories simultaneously
    if (codes.size >= MAX_MIXED_ISSUES && aCodes.length > 0 && cCodes.length > 0) {
      return {
        repaired: false,
        discard: true,
        reason: `${codes.size} CHK issues mezclados (A+C) — demasiado complejo para reparación automática`,
      };
    }

    // If there are any A-fixable codes, apply them (even if C codes also present)
    if (aCodes.length > 0) {
      let fixed = batch;

      if (codes.has('CHK-14')) {
        // CHK-14b (over-capitalized non-nouns) fires under the id 'CHK-14'.
        // Run decapitalize FIRST so it clears "Viele"/"Lange"/etc. before
        // capitalizeBatchNouns re-capitalizes genuine nouns.
        const { batch: b1 } = decapitalizeBatchMidSentence(fixed);
        const { batch: b2 } = capitalizeBatchNouns(b1);
        fixed = b2;
      }
      if (codes.has('CHK-13') || codes.has('CHK-19')) {
        const seed = derivePartShuffleSeed(fixed.questions || []);
        const qs = shuffleKeyedQuestionOrder(
          antiRuns(balanceMcqGroup(fixed.questions || [], { seed })),
          { seed },
        );
        fixed = { ...fixed, questions: qs };
      }
      if (codes.has('CHK-17')) {
        fixed = normalizeT3(fixed);
      }
      if (unknownCodes.some((c) => c === 'CHK-8')) {
        fixed = fixDuplicateIds(fixed);
      }

      if (cCodes.length === 0 && unknownCodes.filter((c) => c !== 'CHK-8').length === 0) {
        // Only A issues (+ possibly CHK-8): fully repaired in code
        return { repaired: true, batch: fixed, calledLlm: false, cube: 'A', fixed: aCodes };
      }

      // Mixed A+C: partially repaired — tell caller to do targeted LLM on C issues
      return {
        repaired: true,
        batch: fixed,
        calledLlm: false,
        cube: 'A',
        fixed: aCodes,
        remainingCodes: cCodes,
        partialOnly: true,
      };
    }

    // Only C-type codes — targeted LLM
    if (cCodes.length > 0) {
      return { repaired: 'targeted', cube: 'C', targetedCodes: cCodes, reason: gate };
    }

    // Unknown codes only — fall through to targeted
    return { repaired: 'targeted', cube: 'C', targetedCodes: unknownCodes, reason: `unknown codes: ${unknownCodes.join(',')}` };
  }

  // ── Cubo B: gate='lexico' with unambiguous 1:1 substitution ──────────────
  if (gate === 'lexico') {
    const lexItems = parseLexicalIssues(issues);
    const safe = lexItems.filter(({ suggestion }) => isSingleSuggestion(suggestion));
    const unsafe = lexItems.filter(({ suggestion }) => !isSingleSuggestion(suggestion));

    if (safe.length > 0) {
      let fixed = batch;
      for (const { term, suggestion } of safe) {
        fixed = applyLexSubstitution(fixed, term, suggestion);
      }

      if (unsafe.length === 0) {
        // Fully fixed
        return {
          repaired: true,
          batch: fixed,
          calledLlm: false,
          cube: 'B',
          fixed: safe.map(({ term }) => term),
        };
      }

      // Partially fixed: safe terms substituted, unsafe remain for LLM
      return {
        repaired: true,
        batch: fixed,
        calledLlm: false,
        cube: 'B',
        fixed: safe.map(({ term }) => term),
        remaining: unsafe.map(({ term }) => term),
        partialOnly: true,
      };
    }

    // All suggestions are ambiguous → targeted LLM
    return {
      repaired: 'targeted',
      cube: 'C',
      reason: `léxico con sugerencias ambiguas: ${lexItems.map(({ term }) => term).join(', ')}`,
    };
  }

  // ── Cubo D: gate='calidad' with too many issues ───────────────────────────
  if (gate === 'calidad' && issues.length >= MAX_MIXED_ISSUES) {
    return {
      repaired: false,
      discard: true,
      reason: `${issues.length} issues de calidad simultáneos — descartar y regenerar`,
    };
  }

  // ── Cubo C: everything else (calidad, formato, unknown) → targeted LLM ───
  return { repaired: 'targeted', cube: 'C', reason: gate || 'unknown' };
}
