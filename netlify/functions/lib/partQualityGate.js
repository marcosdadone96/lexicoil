'use strict';

/**
 * partQualityGate — validate and AI-verify items in a reusable part before storing.
 *
 * Pipeline:
 *   1. Auto-assign passageId from part.passage if missing.
 *   2. Structural per-item validation (discard bad items, not the whole part).
 *   3. AI answer-key verification per-item (discard wrong-key items).
 *   4. Assess completeness against blueprint target.
 *   5. ONE optional repair attempt if validItems < minItems (no loops).
 *   6. If still < minItems after repair → discard (caller releases quota).
 *
 * Priority: never complete+incorrect > incomplete+reliable > complete+reliable.
 */

const ExamValidator = require('../../../js/engine/validation/ExamValidator.js');
const AnswerKeyVerifier = require('../../../js/engine/validation/AnswerKeyVerifier.js');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Absolute floor — never accept < 3 items regardless of blueprint. */
const ABS_MIN_ITEMS = 3;

/** MIN_ITEMS = max(ABS_MIN_ITEMS, ceil(target / MIN_DIVISOR)) */
const MIN_DIVISOR = 2;

const READING_LISTENING = new Set([
  'lesen', 'reading', 'horen', 'hoeren', 'listening',
]);

const RUBRIC_LIKE_TYPES = new Set([
  'rubric', 'task', 'writing_task', 'speaking_task', 'essay',
]);

const TF_LIKE_TYPES = new Set([
  'tf', 'true_false', 'rf', 'richtig_falsch', 'rfn', 'r_f_n',
  'yn', 'ja_nein',
]);

const TF_VALID_KEYS = new Set([
  'r', 'f', 't', 'w', 'n',
  'true', 'false', 'richtig', 'falsch',
  'y', 'j', 'yes', 'no', 'ja', 'nein',
]);

// ─── Blueprint helpers ────────────────────────────────────────────────────────

/**
 * Read target item count for (module, teil) from a loaded blueprint JSON.
 * Resolution order: questionsTotal.min → itemsTotal → 1.
 */
function partMinTargetFromBlueprint(blueprint, module, teil) {
  for (const mod of (blueprint?.modules || [])) {
    if (mod.id !== String(module).toLowerCase()) continue;
    for (const part of (mod.parts || [])) {
      if (part.teil === teil) {
        return part.questionsTotal?.min || part.itemsTotal || 1;
      }
    }
  }
  return 1;
}

function computeMinItems(target) {
  return Math.max(ABS_MIN_ITEMS, Math.ceil(target / MIN_DIVISOR));
}

// ─── Preprocessing ────────────────────────────────────────────────────────────

/**
 * If the part has a passage with an `id`, auto-assign `passageId` to any
 * question that is missing it. Mutates the array in place.
 */
function autoAssignPassageId(questions, passage) {
  const pid = passage?.id;
  if (!pid) return;
  for (const q of questions) {
    if (!q.passageId && !q.passage_id) {
      q.passageId = pid;
    }
  }
}

// ─── Per-item structural validation ──────────────────────────────────────────

/**
 * Validate one question. Returns { valid: boolean, errors: string[] }.
 * Discards the item on any hard error; never discards the whole part.
 */
function validateSingleItem(q, module, hasPassage) {
  const errors = [];
  const qText = String(q.question || q.text || q.stem || '').trim();
  if (!qText) errors.push('empty_question');

  const qType = String(q.type || q.questionType || 'multiple').toLowerCase();

  if (RUBRIC_LIKE_TYPES.has(qType)) {
    // Rubric/task items (Schreiben, Sprechen): only need non-empty question text.
    return { valid: errors.length === 0, errors };
  }

  if (TF_LIKE_TYPES.has(qType)) {
    const correct = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    if (!correct && correct !== 0) {
      errors.push('missing_correct');
    } else if (!TF_VALID_KEYS.has(String(correct).toLowerCase())) {
      errors.push(`invalid_tf_key:${correct}`);
    }
    return { valid: errors.length === 0, errors };
  }

  if (qType === 'gap' || qType === 'fill_blank') {
    const answer = q.answer ?? q.correct;
    if (answer == null || String(answer).trim() === '') errors.push('missing_answer');
    return { valid: errors.length === 0, errors };
  }

  // Default: MCQ / multiple-choice
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length < 3) errors.push(`insufficient_options:${opts.length}`);

  const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
  if (!correct[0] && correct[0] !== 0) {
    errors.push('missing_correct');
  } else if (correct.length !== 1) {
    errors.push(`mcq_multiple_correct:${correct.length}`);
  } else {
    const optKeys = opts.map((o) =>
      typeof o === 'object' ? String(o.key ?? o.id ?? '') : String(o ?? ''),
    );
    if (!optKeys.includes(String(correct[0]))) {
      errors.push(`correct_not_in_options:${correct[0]}`);
    }
  }

  // passageId for reading/listening
  if (READING_LISTENING.has(module) && hasPassage) {
    if (!q.passageId && !q.passage_id) errors.push('missing_passage_id');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Partition questions into valid and invalid using per-item structural checks.
 * Returns { valid: Question[], invalid: { question, errors }[] }.
 */
function validateItemsStructurally(questions, module, hasPassage) {
  const valid = [];
  const invalid = [];
  for (const q of (questions || [])) {
    const result = validateSingleItem(q, module, hasPassage);
    if (result.valid) valid.push(q);
    else invalid.push({ question: q, errors: result.errors });
  }
  return { valid, invalid };
}

// ─── Per-item AI answer-key verification ─────────────────────────────────────

/**
 * Verify MCQ answer keys with AI (Haiku).
 * Items whose marked key the AI disagrees with are discarded individually.
 * Returns { verified, failed, skipped, reason?, discrepancies? }.
 *
 * Skips silently if EXAM_ANSWER_KEY_VERIFY !== '1' — never blocks.
 */
async function verifyItemsWithAI(questions, apiKey) {
  if (process.env.EXAM_ANSWER_KEY_VERIFY !== '1') {
    return { verified: questions, failed: [], skipped: true, reason: 'disabled' };
  }
  if (!apiKey) {
    return { verified: questions, failed: [], skipped: true, reason: 'no_api_key' };
  }

  // Wrap questions in a minimal exam so AnswerKeyVerifier._walk can find them.
  const miniExam = { lesenParts: [{ questions }] };
  const verifier = new AnswerKeyVerifier();
  const items = verifier.collectMcqItems(miniExam);

  if (!items.length) {
    return { verified: questions, failed: [], skipped: true, reason: 'no_mcq_items' };
  }

  const model  = String(process.env.CLAUDE_VERIFY_MODEL || 'claude-haiku-4-5').trim();
  const prompt = verifier.buildSolverPrompt(items);

  let solved = [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[partQualityGate] AI verify HTTP error:', data?.error?.message || res.status);
      return { verified: questions, failed: [], skipped: true, reason: 'api_error' };
    }
    const text = (data.content || []).map((p) => p.text || '').join('');
    solved = verifier.parseSolverResponse(text);
  } catch (err) {
    console.warn('[partQualityGate] AI verify network error:', err.message);
    return { verified: questions, failed: [], skipped: true, reason: 'network_error' };
  }

  const discrepancies = verifier.compare(items, solved);
  const failedIds = new Set(discrepancies.map((d) => String(d.id)));

  const verified = questions.filter((q) => !failedIds.has(String(q.id ?? '')));
  const failed   = questions.filter((q) =>  failedIds.has(String(q.id ?? '')));

  return { verified, failed, skipped: false, discrepancies };
}

// ─── Repair helper (single AI call, no loop) ──────────────────────────────────

/**
 * Call Claude to generate `count` additional questions for the given part.
 * Returns an array of question objects (may be empty on failure — caller handles).
 *
 * @param {number}  count       Number of items to generate.
 * @param {object}  part        The original part (passage, module, teil, etc.).
 * @param {object}  ctx         { blueprint, validItems } — context for the prompt.
 * @param {string}  apiKey      Anthropic API key.
 */
async function repairItemsWithAI(count, part, { blueprint, validItems } = {}, apiKey) {
  if (!apiKey || count <= 0) return [];

  const module    = part.module || 'lesen';
  const teil      = part.teil ?? 1;
  const lang      = part.lang  || 'de';
  const level     = part.level || 'B1';
  const passage   = part.passage || {};

  // Find the blueprint spec for this slot (task type hint)
  let bpSpec = null;
  if (blueprint) {
    for (const mod of (blueprint.modules || [])) {
      if (mod.id !== module) continue;
      for (const p of (mod.parts || [])) {
        if (p.teil === teil) { bpSpec = p; break; }
      }
      if (bpSpec) break;
    }
  }

  const styleHint = validItems?.slice(0, 2)
    ? `\nEXISTING VALID QUESTIONS (style reference):\n${JSON.stringify(validItems.slice(0, 2))}`
    : '';

  const prompt = [
    `You generate ${lang.toUpperCase()} ${level} exam questions (${module} Teil ${teil}).`,
    bpSpec?.slotType ? `Task format: ${bpSpec.slotType}` : '',
    '',
    passage.title ? `PASSAGE TITLE: ${passage.title}` : '',
    passage.text  ? `PASSAGE:\n${passage.text}` : '',
    styleHint,
    '',
    `TASK: Generate exactly ${count} additional questions for this passage.`,
    'Each question must follow the exact same JSON structure as the style reference.',
    'Required fields: id (unique string), module, teil, type, question, options (array with key+text objects), correct (single option key).',
    'Return ONLY a valid JSON array of question objects. No markdown, no explanation.',
  ].filter(Boolean).join('\n');

  const model = String(process.env.CLAUDE_VERIFY_MODEL || 'claude-haiku-4-5').trim();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[partQualityGate] repair API error:', data?.error?.message || res.status);
      return [];
    }
    const text = String((data.content || []).map((p) => p.text || '').join('') || '');
    const raw  = text.replace(/```json|```/g, '').trim();
    let items;
    try {
      items = JSON.parse(raw);
    } catch (_) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) return [];
      items = JSON.parse(m[0]);
    }
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.warn('[partQualityGate] repair network error:', err.message);
    return [];
  }
}

// ─── Main gate ────────────────────────────────────────────────────────────────

/**
 * Run the full quality gate on a part payload.
 *
 * Options:
 *   blueprint  {object|null}  Loaded blueprint JSON (for target count).
 *   apiKey     {string}       Anthropic API key (for AI verification and repair).
 *   repair     {boolean}      Whether to attempt one repair pass (default true).
 *
 * Returns:
 *   {
 *     acceptable:  boolean,   // validItems >= minItems (use this part)
 *     complete:    boolean,   // validItems >= target
 *     verified:    true,
 *     itemCount:   number,
 *     targetCount: number,
 *     minItems:    number,
 *     validItems:  Question[],
 *     discarded:   boolean,   // true ⟹ discard, release quota
 *     reason?:     string,
 *     structInvalid: { question, errors }[],
 *     aiFailed:    Question[],
 *     aiSkipped:   boolean,
 *     repaired:    boolean,
 *   }
 */
async function runPartQualityGate(part, { blueprint = null, apiKey = null, repair = true } = {}) {
  const module     = String(part.module || 'lesen').toLowerCase();
  const teil       = part.teil ?? 1;
  const passage    = part.passage || null;
  const hasPassage = !!(passage?.text);

  // ── Blueprint target ──────────────────────────────────────────────────────
  const target   = blueprint
    ? partMinTargetFromBlueprint(blueprint, module, teil)
    : (part.targetCount || part.itemCount || ABS_MIN_ITEMS);
  const minItems = computeMinItems(target);

  // ── Preprocessing: auto-assign passageId ─────────────────────────────────
  const questions = JSON.parse(JSON.stringify(Array.isArray(part.questions) ? part.questions : []));
  if (READING_LISTENING.has(module) && hasPassage) {
    autoAssignPassageId(questions, passage);
  }

  // ── Step 1: structural filter ─────────────────────────────────────────────
  const { valid: struct, invalid: structInvalid } = validateItemsStructurally(questions, module, hasPassage);

  // ── Step 2: AI answer-key verification ───────────────────────────────────
  const { verified: aiVerified, failed: aiFailed, skipped: aiSkipped } =
    await verifyItemsWithAI(struct, apiKey);

  let validItems = aiVerified;

  // ── Step 3: assess, maybe repair (exactly once) ───────────────────────────
  if (validItems.length >= minItems) {
    return _buildResult(validItems, target, minItems, { structInvalid, aiFailed, aiSkipped, repaired: false });
  }

  if (!repair || !apiKey) {
    return _discardResult(validItems.length, target, minItems, { structInvalid, aiFailed, aiSkipped },
      'insufficient_items_no_repair');
  }

  // ── ONE repair attempt: generate only the missing items ───────────────────
  const needed = target - validItems.length;
  console.info(`[partQualityGate] repair: ${validItems.length}/${target} valid, generating ${needed} more`);

  let repairItems = [];
  try {
    repairItems = await repairItemsWithAI(needed, part, { blueprint, validItems }, apiKey);
  } catch (err) {
    console.warn('[partQualityGate] repair threw:', err.message);
  }

  if (repairItems.length) {
    // Auto-assign passageId on repaired items too
    if (READING_LISTENING.has(module) && hasPassage) {
      autoAssignPassageId(repairItems, passage);
    }
    const { valid: repairStruct }   = validateItemsStructurally(repairItems, module, hasPassage);
    const { verified: repairVerified } = await verifyItemsWithAI(repairStruct, apiKey);
    validItems = [...validItems, ...repairVerified];
    console.info(`[partQualityGate] after repair: ${validItems.length}/${target} valid items`);
  }

  // ── Final decision ────────────────────────────────────────────────────────
  if (validItems.length < minItems) {
    return _discardResult(validItems.length, target, minItems, { structInvalid, aiFailed, aiSkipped },
      'insufficient_items_after_repair');
  }

  return _buildResult(validItems, target, minItems, {
    structInvalid,
    aiFailed,
    aiSkipped,
    repaired: true,
  });
}

function _buildResult(validItems, target, minItems, meta) {
  const complete   = validItems.length >= target;
  const acceptable = validItems.length >= minItems;
  return {
    acceptable,
    complete,
    verified:    true,
    itemCount:   validItems.length,
    targetCount: target,
    minItems,
    validItems,
    discarded:   false,
    structInvalid: meta.structInvalid || [],
    aiFailed:      meta.aiFailed      || [],
    aiSkipped:     !!meta.aiSkipped,
    repaired:      !!meta.repaired,
  };
}

function _discardResult(count, target, minItems, meta, reason) {
  return {
    acceptable:  false,
    complete:    false,
    verified:    true,
    itemCount:   count,
    targetCount: target,
    minItems,
    validItems:  [],
    discarded:   true,
    reason,
    structInvalid: meta.structInvalid || [],
    aiFailed:      meta.aiFailed      || [],
    aiSkipped:     !!meta.aiSkipped,
    repaired:      false,
  };
}

module.exports = {
  ABS_MIN_ITEMS,
  MIN_DIVISOR,
  computeMinItems,
  partMinTargetFromBlueprint,
  autoAssignPassageId,
  validateSingleItem,
  validateItemsStructurally,
  verifyItemsWithAI,
  repairItemsWithAI,
  runPartQualityGate,
};
