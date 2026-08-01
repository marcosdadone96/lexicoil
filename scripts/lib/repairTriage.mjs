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
 *      CHK-15 (T5 solo, pasaje largo <15% exceso) → trim frases no referenciadas al final
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

import { applyGermanCapsNormalize } from './germanCapsNormalize.mjs';
import { balanceMcqGroup, antiRuns, derivePartShuffleSeed, shuffleKeyedQuestionOrder } from './balanceMcq.mjs';
import { normalizeT3 } from './normalizeT3.mjs';
import { signTextStance } from './lesenBatchQuality.mjs';
import { findKeyExplanationMismatches } from './keyExplanationGate.mjs';
import {
  hasExplanationMismatchSignal,
  parseExplanationFindingsFromIssues,
} from './explanationRepair.mjs';
import { isOnlyCefrLengthAboveMax, isLesenT2Batch as isLesenT2LengthBatch } from './passageLengthRepair.mjs';
import { hasMcqLengthBiasSignal } from './mcqLengthBiasRepair.mjs';
import { hasLexicoRepairSignal } from './lexicoRepair.mjs';
import { tokenize as passageContentTokens } from './semanticDedup.mjs';

// ─── Constants ──────────────────────────────────────────────────────────────

/** CHK codes that can be fixed purely in code (Cubo A). */
const CUBE_A_CODES = new Set(['CHK-14', 'CHK-13', 'CHK-19', 'CHK-17']);

/**
 * CHK codes that require targeted LLM repair (Cubo C) and are not fixable in code.
 * Anything NOT in A or C is treated as "unknown" — falls through to C by default.
 */
const CUBE_C_CODES = new Set(['CHK-18', 'CHK-7', 'CHK-16', 'CHK-10', 'CHK-15', 'CHK-20', 'CHK-28']);

/**
 * Maximum number of distinct-cube issues before we give up and discard rather
 * than attempting piecemeal repair (Cubo D threshold).
 */
const MAX_MIXED_ISSUES = 6;

/** CEFR/template target for Lesen T5 passage length (trim goal). */
export const T5_PASSAGE_TRIM_MAX = 230;
/** Max relative excess (wc - max) / max for deterministic trim. */
export const T5_PASSAGE_TRIM_MAX_EXCESS = 0.15;

const T5_LONG_PASSAGE_ISSUE_RE = /lesen-5 pasaje demasiado largo/i;

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

const WORD_MATCH_RE =
  /palabras idénticas|copia literal|copia ≥|comparten demasiadas palabras|pregunta copia|opción correcta copia|afirmación copia/i;

function hasWordMatchSignal(issues) {
  return (issues || []).some((i) => WORD_MATCH_RE.test(String(i)));
}

function parseWordMatchFromIssues(issues) {
  const out = [];
  for (const issue of issues || []) {
    const s = String(issue);
    if (!WORD_MATCH_RE.test(s)) continue;
    const m = s.match(/^(gen-q-[^\s:]+):/);
    if (m) out.push({ itemId: m[1], detail: s.replace(/^.*?\]\s*/, '') });
  }
  return out;
}

/** Extract itemIds from CHK-28 / calidad / SEM-MCQ-DISTINCT issue strings. */
function parseMcqDistinctFromIssues(issues) {
  const out = [];
  for (const issue of issues || []) {
    const s = String(issue);
    const m = s.match(/(gen-q-[^\s:\]]+)/);
    if (m) out.push({ itemId: m[1], detail: s.replace(/^.*?\]\s*/, '') });
  }
  return out;
}

function hasMcqDistinctSignal(issues) {
  return (issues || []).some((i) =>
    /SEM-MCQ-DISTINCT|CHK-28|opciones no excluyentes/i.test(String(i)),
  );
}

const T4_INVERTED_KEY_RE = /clave invertida|signText indica/i;

function hasT4InvertedKeySignal(issues) {
  return (issues || []).some((i) => T4_INVERTED_KEY_RE.test(String(i)));
}

/** Sync correct/correctAnswer with signText stance (T4 Ja/Nein). */
function fixT4InvertedKeys(batch) {
  const questions = (batch.questions || []).map((q) => {
    const stance = signTextStance(q.signText || '');
    if (!stance) return q;
    const declared = String(q.correct || q.correctAnswer || '').trim();
    if (stance && declared && stance !== declared) {
      return { ...q, correct: stance, correctAnswer: stance };
    }
    return q;
  });
  return { ...batch, questions };
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

function countPassageWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function stripMcqOptionLetter(opt) {
  return String(opt || '').replace(/^[a-d]\)\s*/i, '').trim();
}

function correctOptionBody(q) {
  const letter = String(q.correct || q.correctAnswer || '')
    .toLowerCase()
    .replace(/[^a-d]/g, '');
  if (!letter) return '';
  for (const opt of q.options || []) {
    const raw = typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? opt?.value ?? '');
    if (new RegExp(`^${letter}\\)`, 'i').test(raw.trim())) {
      return stripMcqOptionLetter(raw);
    }
  }
  return '';
}

/** Split passage into sentence-like units (bullets kept as one unit). */
export function splitPassageSentences(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (/^[-•*]\s/.test(trimmed)) return [trimmed];
      return trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    })
    .filter(Boolean);
}

function rejoinPassageSentences(sentences, originalText) {
  if (!sentences.length) return '';
  if (sentences.some((s) => /^[-•*]\s/.test(s))) return sentences.join('\n');
  if (/\n\n/.test(originalText)) return sentences.join('\n\n');
  if (/\n/.test(originalText)) return sentences.join('\n');
  return sentences.join(' ');
}

function collectT5ReferenceTokens(questions) {
  const tokens = new Set();
  for (const q of questions) {
    for (const field of [q.question, q.explanation, correctOptionBody(q)]) {
      for (const tok of passageContentTokens(field)) tokens.add(tok);
    }
  }
  return tokens;
}

export function isSentenceReferencedByBatch(sentence, refTokens) {
  const sentenceTokens = passageContentTokens(sentence);
  if (!sentenceTokens.length) return false;
  return sentenceTokens.some((tok) => refTokens.has(tok));
}

export function isOnlyT5PassageTooLongChk15(issues) {
  const list = issues || [];
  if (!list.length) return false;
  return list.every((issue) => T5_LONG_PASSAGE_ISSUE_RE.test(String(issue)));
}

function isLesenT5Batch(batch) {
  return (batch.questions || []).some(
    (q) => String(q.module || '').toLowerCase() === 'lesen' && Number(q.teil) === 5,
  );
}

/**
 * Trim unreferenced trailing sentences from a T5 passage until word count ≤ max.
 * Returns null if trim is not possible or not applicable.
 */
export function trimT5PassageExcess(batch, maxWords = T5_PASSAGE_TRIM_MAX) {
  const passage = (batch.passages || []).find((p) => p?.text);
  if (!passage) return null;

  const t5Questions = (batch.questions || []).filter(
    (q) =>
      String(q.module || '').toLowerCase() === 'lesen' &&
      Number(q.teil) === 5 &&
      q.passageId === passage.id,
  );
  if (!t5Questions.length) return null;

  const wc = countPassageWords(passage.text);
  if (wc <= maxWords) return null;

  const excessRatio = (wc - maxWords) / maxWords;
  if (excessRatio >= T5_PASSAGE_TRIM_MAX_EXCESS) return null;

  const refTokens = collectT5ReferenceTokens(t5Questions);
  const sentences = splitPassageSentences(passage.text);
  if (!sentences.length) return null;

  const kept = sentences.slice();
  const removed = [];

  while (countPassageWords(rejoinPassageSentences(kept, passage.text)) > maxWords) {
    const last = kept[kept.length - 1];
    if (!last || isSentenceReferencedByBatch(last, refTokens)) return null;
    removed.unshift(kept.pop());
  }

  if (countPassageWords(rejoinPassageSentences(kept, passage.text)) > maxWords) return null;

  const newText = rejoinPassageSentences(kept, passage.text);
  const passages = (batch.passages || []).map((p) =>
    p.id === passage.id ? { ...p, text: newText } : p,
  );

  return {
    batch: { ...batch, passages },
    removed,
    wordCountBefore: wc,
    wordCountAfter: countPassageWords(newText),
  };
}

function tryT5PassageTrimRepair(batch) {
  const trim = trimT5PassageExcess(batch);
  if (!trim) return null;
  return {
    repaired: true,
    batch: trim.batch,
    calledLlm: false,
    cube: 'A',
    fixed: ['T5-passage-trim'],
  };
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
  const { gate, issue = '', reason = '', issues = [] } = gates;
  const ingestErrors = Array.isArray(gates.ingest?.results)
    ? gates.ingest.results.flatMap((r) => r.errors || [])
    : [];
  const allIssues = [...(issues || []), ...ingestErrors].filter(Boolean);

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

  // Cubo C: Lesen T2 — solo CEFR length_above_max (suma 2 pasajes >400)
  if (
    isLesenT2LengthBatch(batch) &&
    (gate === 'cefr' || reason === 'pre-ingest' || issue === 'pre-ingest') &&
    isOnlyCefrLengthAboveMax(allIssues.length ? allIssues : [issue, reason].filter(Boolean))
  ) {
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'passage_length',
      reason: issue || reason || 'cefr_gate:length_above_max',
    };
  }

  // ── Cubo A: audit2 gate with only code-fixable CHK codes ─────────────────
  if (gate === 'audit2') {
    const codes = extractChkCodes(issues);
    const aCodes = [...codes].filter((c) => CUBE_A_CODES.has(c));
    const cCodes = [...codes].filter((c) => CUBE_C_CODES.has(c));
    const unknownCodes = [...codes].filter((c) => !CUBE_A_CODES.has(c) && !CUBE_C_CODES.has(c));

    if (codes.has('CHK-18b') || hasExplanationMismatchSignal(issues)) {
      const explanationFindings = findKeyExplanationMismatches(batch);
      return {
        repaired: 'targeted',
        cube: 'C',
        repairKind: 'explanation',
        reason: issue || 'CHK-18b',
        explanationFindings: explanationFindings.length
          ? explanationFindings
          : parseExplanationFindingsFromIssues(issues),
      };
    }

    // Cubo A: T5 pasaje largo — solo CHK-15, exceso <15%, recorte de relleno al final
    if (
      codes.size === 1 &&
      codes.has('CHK-15') &&
      isOnlyT5PassageTooLongChk15(issues) &&
      isLesenT5Batch(batch)
    ) {
      const trimResult = tryT5PassageTrimRepair(batch);
      if (trimResult) return trimResult;
    }

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
        fixed = applyGermanCapsNormalize(fixed).batch;
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

  // Calidad combinada / léxico: priorizar reparaciones pedagógicas antes que léxico B2+
  if (gate === 'lexico' || gate === 'calidad+lexico' || gate === 'calidad') {
    if (hasExplanationMismatchSignal(issues)) {
      const explanationFindings = findKeyExplanationMismatches(batch);
      return {
        repaired: 'targeted',
        cube: 'C',
        repairKind: 'explanation',
        reason: issue || 'CHK-18b',
        explanationFindings: explanationFindings.length
          ? explanationFindings
          : parseExplanationFindingsFromIssues(issues),
      };
    }
    if (hasWordMatchSignal(issues)) {
      return {
        repaired: 'targeted',
        cube: 'C',
        repairKind: 'word_match',
        reason: issue || 'word_match',
        wordMatchFindings: parseWordMatchFromIssues(issues),
      };
    }
    if (hasMcqLengthBiasSignal(issues) && !hasWordMatchSignal(issues)) {
      return {
        repaired: 'targeted',
        cube: 'C',
        repairKind: 'mcq_length_bias',
        reason: issue || 'mcq_length_bias',
      };
    }
  }

  // ── Cubo B: gate='lexico' (o Hören T4 calidad+lexico) con sustitución 1:1 ─
  if (gate === 'lexico' || gate === 'calidad+lexico') {
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

    // All suggestions ambiguous or unparseable → surgical LLM (≤4 hallazgos)
    if (hasLexicoRepairSignal(issues) && lexItems.length > 0 && lexItems.length <= 4) {
      return {
        repaired: 'targeted',
        cube: 'C',
        repairKind: 'lexico',
        reason: issue || 'lexico',
      };
    }

    return {
      repaired: 'targeted',
      cube: 'C',
      reason: `léxico con sugerencias ambiguas: ${lexItems.map(({ term }) => term).join(', ')}`,
    };
  }

  // ── Cubo A: T4 clave Ja/Nein invertida (determinista) ────────────────────
  if ((gate === 'calidad' || gate === 'calidad+lexico') && hasT4InvertedKeySignal(issues)) {
    return {
      repaired: true,
      batch: fixT4InvertedKeys(batch),
      calledLlm: false,
      cube: 'A',
      fixed: ['T4-inverted-key'],
    };
  }

  // ── Cubo C: word-matching / word-copy (calidad Lesen/Hören) ─────────────
  if (gate === 'calidad' && hasWordMatchSignal(issues)) {
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'word_match',
      reason: issue || 'word_match',
      wordMatchFindings: parseWordMatchFromIssues(issues),
    };
  }

  // ── Cubo C: sesgo longitud MCQ (sin word-copy simultáneo) ─────────────────
  if (gate === 'calidad' && hasMcqLengthBiasSignal(issues) && !hasWordMatchSignal(issues)) {
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'mcq_length_bias',
      reason: issue || 'mcq_length_bias',
    };
  }

  // ── Cubo C: CHK-18b explanation mismatch (T2/T5) ─────────────────────────
  if (hasExplanationMismatchSignal(issues)) {
    const explanationFindings = findKeyExplanationMismatches(batch);
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'explanation',
      reason: issue || 'CHK-18b',
      explanationFindings: explanationFindings.length
        ? explanationFindings
        : parseExplanationFindingsFromIssues(issues),
    };
  }

  // ── Cubo C: mcq_distinct determinista (calidad / CHK-28) ─────────────────
  if (hasMcqDistinctSignal(issues)) {
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'mcq_distinct',
      reason: issue || 'mcq_distinct',
      sem2Findings: gates.sem2Findings || parseMcqDistinctFromIssues(issues),
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

  // SEM-1 ambiguity por opciones duplicadas → misma reparación localizada
  if (
    gate === 'audit2' &&
    issues.some((i) =>
      /SEM-AMBIGUITY.*(parafrasean|idénticas|mismo contenido|prácticamente lo mismo)/i.test(String(i)),
    )
  ) {
    return {
      repaired: 'targeted',
      cube: 'C',
      repairKind: 'mcq_distinct',
      reason: issue || 'mcq_ambiguity_dup',
      sem2Findings: parseMcqDistinctFromIssues(issues),
    };
  }

  // ── Cubo C: everything else (calidad, formato, unknown) → targeted LLM ───
  return { repaired: 'targeted', cube: 'C', reason: gate || 'unknown' };
}
