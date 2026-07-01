'use strict';

/**
 * partQualityGate — validate and AI-verify items in a reusable part before storing.
 *
 * Threshold modes (callers):
 *   EXACT (pool / servible): runPartQualityGate (exam-part.js POST), approvePartToReusable,
 *     autoApprovePartToReusable.isAutoApprovable — itemCount must equal blueprint itemsTotal.
 *   PARTIAL (MIN_ITEMS): validateStagingRecord.valid for content-staging.js ingest — allows
 *     incomplete parts into staging with complete:false; claude-chat personal flows use
 *     validateGeneratedExam / verifyAndSanitizePersonalExam (exam-level, not this module).
 *
 * Pipeline:
 *   1. Auto-assign passageId from part.passage if missing.
 *   2. Structural per-item validation (discard bad items, not the whole part).
 *   3. PassageId guard — discard items whose passageId ≠ part passage (deterministic).
 *   4. Semantic AI verification per-item (correct key + answerable from passage only).
 *   5. Assess completeness against blueprint target.
 *   6. ONE optional repair attempt if validItems < minItems (no loops).
 *   7. If still < minItems after repair → discard (caller releases quota).
 *   8. Postprocess (balance MCQ positions, ads uniqueness for Teil 3).
 *   9. Topic coherence gate (TOPIC_COHERENCE_GATE=1) — discard off-topic parts.
 *
 * Priority: never complete+incorrect > incomplete+reliable > complete+reliable.
 */

const { verifyPartQuestionsWithAI } = require('./examQualityGate.js');
const topicCoherenceGate = require('./topicCoherenceGate.js');
const { balanceAnswerPositions, validateAdsUnique } = require('../../../js/engine/prompts/partPostprocess.js');
const { isAnswerKeyRenderable } = require('../../../js/engine/validation/isAnswerKeyRenderable.js');

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

const SPEAKER_MATCH_KEYS = new Set(['M', 'A', 'B']);
const AD_MATCH_KEYS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '0']);

function optionKeyFromEntry(o) {
  if (o && typeof o === 'object') {
    const k = String(o.key ?? o.id ?? '').trim();
    if (k) return k.toUpperCase();
  }
  const s = String(o ?? '').trim();
  const m = s.match(/^([a-z0-9])\)\s*/i);
  return m ? m[1].toUpperCase() : s.toUpperCase();
}

function isSpeakerMatchingQuestion(q) {
  const t = String(q.type || q.questionType || '').toLowerCase();
  if (t === 'matching_speaker' || t === 'speaker_matching') return true;
  const correct = optionKeyFromEntry(Array.isArray(q.correct) ? q.correct[0] : q.correct);
  if (!SPEAKER_MATCH_KEYS.has(correct)) return false;
  const keys = (Array.isArray(q.options) ? q.options : []).map(optionKeyFromEntry);
  return keys.includes('M') && keys.includes('A') && keys.includes('B');
}

function isAdsMatchingQuestion(q) {
  const t = String(q.type || q.questionType || '').toLowerCase();
  if (t !== 'matching' && t !== 'match') return false;
  const correct = optionKeyFromEntry(Array.isArray(q.correct) ? q.correct[0] : q.correct);
  if (!AD_MATCH_KEYS.has(correct)) return false;
  return (Array.isArray(q.options) ? q.options : []).length >= 8;
}

// ─── Blueprint helpers ────────────────────────────────────────────────────────

/**
 * Exact item count for (module, teil) from blueprint — matches validateExamAgainstBlueprint.
 */
function partExactTargetFromBlueprint(blueprint, module, teil) {
  for (const mod of (blueprint?.modules || [])) {
    if (mod.id !== String(module).toLowerCase()) continue;
    for (const part of (mod.parts || [])) {
      if (part.teil === teil) {
        return part.itemsTotal ?? part.questionsTotal?.min ?? part.questionsTotal?.max ?? 1;
      }
    }
  }
  return 1;
}

/** @deprecated alias — prefer partExactTargetFromBlueprint */
function partMinTargetFromBlueprint(blueprint, module, teil) {
  return partExactTargetFromBlueprint(blueprint, module, teil);
}

function computeMinItems(target) {
  return Math.max(ABS_MIN_ITEMS, Math.ceil(target / MIN_DIVISOR));
}

/** When blueprint exists, require exact Teil count; otherwise use fractional floor. */
function requiredItemCount(blueprint, target) {
  if (blueprint) return target;
  return computeMinItems(target);
}

function countMeetsBlueprintTarget(blueprint, count, target) {
  if (blueprint) return count === target;
  return count >= requiredItemCount(blueprint, target);
}

/** Fractional floor for partial / personal staging ingest (not pool-complete). */
function partialAcceptanceMinItems(blueprint, target) {
  return blueprint ? computeMinItems(target) : ABS_MIN_ITEMS;
}

function buildPartRenderContext(record) {
  const passage = record?.passage || null;
  return {
    ...(passage && typeof passage === 'object' ? passage : {}),
    ads: record?.ads || passage?.ads,
  };
}

function collectNonRenderableKeyErrors(questions, partContext) {
  const errors = [];
  for (const q of questions || []) {
    const qType = String(q.type || q.questionType || 'multiple').toLowerCase();
    if (RUBRIC_LIKE_TYPES.has(qType)) continue;
    if (!isAnswerKeyRenderable(q, partContext)) {
      errors.push(`non_renderable_key:${q.id || 'unknown'}`);
    }
  }
  return errors;
}

// ─── Postprocess (partPostprocess.js) ───────────────────────────────────────

/** Teil 3 Lesen/Hören matching de anuncios (ads_matching). */
function isAdsMatchingTeil3(module, teil, blueprint, questions) {
  if (Number(teil) !== 3) return false;
  const mod = String(module || '').toLowerCase();
  if (!READING_LISTENING.has(mod)) return false;

  if (blueprint) {
    for (const m of (blueprint.modules || [])) {
      if (m.id !== mod) continue;
      for (const p of (m.parts || [])) {
        if (Number(p.teil) !== Number(teil)) continue;
        const slot = String(p.slotType || p.taskFormat || '').toLowerCase();
        if (slot.includes('ads')) return true;
        if (slot.includes('matching') && !slot.includes('speaker') && !slot.includes('discussion')) {
          return true;
        }
        return false;
      }
    }
  }

  const qs = Array.isArray(questions) ? questions : [];
  const matchingLike = qs.filter((q) => {
    const t = String(q.type || '').toLowerCase();
    if (t === 'matching' || t === 'match') return true;
    const c = String(Array.isArray(q.correct) ? q.correct[0] : q.correct);
    return /^[A-J0]$/i.test(c);
  });
  return matchingLike.length >= 3 && matchingLike.length >= qs.length * 0.5;
}

/** Keep first use per ad key; later duplicates go to replacement (pre-repair, not final discard). */
function splitAdsConflictItems(items) {
  const { ok, conflicts } = validateAdsUnique(items);
  if (ok) return { kept: items, toReplace: [], conflicts: [] };

  const dupKeys = new Set(conflicts.map((c) => String(c.key).toUpperCase()));
  const seen = new Map();
  const kept = [];
  const toReplace = [];

  for (const it of (items || [])) {
    const k = String(Array.isArray(it.correct) ? it.correct[0] : it.correct).toUpperCase();
    if (k === '0' || k === '' || !dupKeys.has(k)) {
      kept.push(it);
      if (k !== '0' && k !== '') seen.set(k, true);
      continue;
    }
    if (seen.has(k)) toReplace.push(it);
    else {
      seen.set(k, true);
      kept.push(it);
    }
  }
  return { kept, toReplace, conflicts };
}

/** Final fallback: drop duplicate ad assignments (keep first occurrence; "0" may repeat). */
function discardDuplicateAdItems(items) {
  const seen = new Set();
  const kept = [];
  const removed = [];
  for (const it of (items || [])) {
    const k = String(Array.isArray(it.correct) ? it.correct[0] : it.correct).toUpperCase();
    if (k === '0' || k === '') {
      kept.push(it);
      continue;
    }
    if (seen.has(k)) removed.push(it);
    else {
      seen.add(k);
      kept.push(it);
    }
  }
  return { kept, removed };
}

/** Deterministic MCQ position balance before persist / serve. */
function applyPartPostprocess(questions) {
  if (!Array.isArray(questions)) return { balanced: 0 };
  const { changed } = balanceAnswerPositions(questions);
  return { balanced: changed };
}

function resolveAdsDuplicates(items, { afterRepair = false } = {}) {
  const check = validateAdsUnique(items);
  if (check.ok) return { items, stripped: 0, conflicts: [] };

  if (!afterRepair) {
    return { items, stripped: 0, conflicts: check.conflicts, conflict: true };
  }

  const { kept, removed } = discardDuplicateAdItems(items);
  return {
    items: kept,
    stripped: removed.length,
    conflicts: check.conflicts,
    conflict: removed.length > 0,
  };
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

/**
 * Deterministic guard: drop questions bound to a different passage than this part.
 * Only applies when the part has a passage with id + text (Lesen/Hören).
 */
function filterPassageIdMismatches(questions, passage, module) {
  const mod = String(module || '').toLowerCase();
  if (!READING_LISTENING.has(mod)) {
    return { kept: questions || [], removed: [] };
  }
  const pid = passage?.id;
  const hasText = !!(passage?.text || passage?.transcript);
  if (!pid || !hasText) {
    return { kept: questions || [], removed: [] };
  }

  const kept = [];
  const removed = [];
  for (const q of (questions || [])) {
    const qPid = q.passageId || q.passage_id;
    if (qPid && String(qPid) !== String(pid)) {
      removed.push({ question: q, errors: ['passage_id_mismatch'] });
    } else {
      kept.push(q);
    }
  }
  return { kept, removed };
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

  if (isSpeakerMatchingQuestion(q)) {
    const correct = optionKeyFromEntry(Array.isArray(q.correct) ? q.correct[0] : q.correct);
    if (!correct) errors.push('missing_correct');
    else if (!SPEAKER_MATCH_KEYS.has(correct)) errors.push(`invalid_speaker_key:${correct}`);
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 3) errors.push(`insufficient_options:${opts.length}`);
    return { valid: errors.length === 0, errors };
  }

  if (isAdsMatchingQuestion(q)) {
    const correct = optionKeyFromEntry(Array.isArray(q.correct) ? q.correct[0] : q.correct);
    if (!correct && correct !== '0') errors.push('missing_correct');
    else if (!AD_MATCH_KEYS.has(correct)) errors.push(`invalid_ad_key:${correct}`);
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 8) errors.push(`insufficient_options:${opts.length}`);
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

/**
 * Structural filter → passageId guard → semantic AI verify (per-item discard).
 */
async function validateAndVerifyQuestions(questions, { module, hasPassage, passage, apiKey }) {
  const { valid: struct, invalid: structInvalid } = validateItemsStructurally(
    questions,
    module,
    hasPassage,
  );
  const { kept, removed: passageRemoved } = filterPassageIdMismatches(
    struct,
    passage,
    module,
  );
  const {
    verified,
    failed: aiFailed,
    skipped: aiSkipped,
    reason: aiSkipReason,
    failures: aiFailures,
  } = await verifyPartQuestionsWithAI(kept, { passage, module, apiKey });

  return {
    validItems: verified,
    structInvalid: [...structInvalid, ...passageRemoved],
    aiFailed,
    aiSkipped,
    aiSkipReason,
    aiFailures: aiFailures || [],
  };
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
async function repairItemsWithAI(count, part, { blueprint, validItems, isAdsMatch = false } = {}, apiKey) {
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

  const adsHint = isAdsMatch
    ? '\nMATCHING ADS RULE: each question correct must be a UNIQUE ad key (A–J). Only "0" (no matching ad) may repeat across questions.'
    : '';

  const prompt = [
    `You generate ${lang.toUpperCase()} ${level} exam questions (${module} Teil ${teil}).`,
    bpSpec?.slotType ? `Task format: ${bpSpec.slotType}` : '',
    adsHint,
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

  const model = String(process.env.CLAUDE_VERIFY_MODEL || 'claude-sonnet-4-6').trim();

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
async function maybeDiscardTopicCoherence(
  validItems,
  part,
  { topic, lang, level, apiKey, module, teil },
  target,
  minItems,
  blueprint,
  meta,
) {
  const gatePart = {
    module,
    teil,
    passage: part.passage,
    questions: validItems,
    text: part.passage?.text || part.text,
    transcript: part.passage?.transcript || part.transcript,
    segments: part.segments,
    ads: part.ads,
    task: part.task,
    instruction: part.instruction,
    prompt: part.prompt,
    situation: part.situation,
    points: part.points,
    prompts: part.prompts,
  };
  const coherence = await topicCoherenceGate.verifyTopicCoherence(gatePart, {
    topic: topic || part.topic,
    lang: lang || part.lang,
    level: level || part.level,
    apiKey,
    module,
    teil,
  });
  if (!coherence.skipped && (!coherence.onTopic || !coherence.cefrOk)) {
    console.info('[partQualityGate] topic coherence rejected part', {
      module,
      teil,
      issues: coherence.issues,
    });
    return _discardResult(
      validItems.length,
      target,
      minItems,
      blueprint,
      meta,
      'topic_coherence_failed',
    );
  }
  return null;
}

async function runPartQualityGate(
  part,
  {
    blueprint = null,
    apiKey = null,
    repair = true,
    topic = null,
    lang = null,
    level = null,
    skipTopicCoherence = false,
  } = {},
) {
  const module     = String(part.module || 'lesen').toLowerCase();
  const teil       = part.teil ?? 1;
  const passage    = part.passage || null;
  const hasPassage = !!(passage?.text);
  const coherenceCtx = { topic, lang, level, apiKey, module, teil };

  // ── Blueprint target ──────────────────────────────────────────────────────
  const target   = blueprint
    ? partExactTargetFromBlueprint(blueprint, module, teil)
    : (part.targetCount || part.itemCount || ABS_MIN_ITEMS);
  const minItems = requiredItemCount(blueprint, target);

  // ── Preprocessing: auto-assign passageId ─────────────────────────────────
  const questions = JSON.parse(JSON.stringify(Array.isArray(part.questions) ? part.questions : []));
  if (READING_LISTENING.has(module) && hasPassage) {
    autoAssignPassageId(questions, passage);
  }

  // ── Step 1–2: structural + passage guard + semantic verify ───────────────
  let gatePass = await validateAndVerifyQuestions(questions, {
    module,
    hasPassage,
    passage,
    apiKey,
  });
  let validItems = gatePass.validItems;
  let structInvalid = gatePass.structInvalid;
  let aiFailed = gatePass.aiFailed;
  let aiSkipped = gatePass.aiSkipped;

  if (gatePass.aiFailures?.length) {
    console.info(
      `[partQualityGate] semantic verify removed ${gatePass.aiFailures.length} item(s)`,
      gatePass.aiSkipReason || '',
    );
  }
  if (structInvalid.length) {
    const passageMismatch = structInvalid.filter((e) =>
      (e.errors || []).includes('passage_id_mismatch'),
    ).length;
    if (passageMismatch) {
      console.info(`[partQualityGate] passageId guard removed ${passageMismatch} item(s)`);
    }
  }

  const isAdsMatch = isAdsMatchingTeil3(module, teil, blueprint, questions);
  let adsMeta = isAdsMatch
    ? resolveAdsDuplicates(validItems, { afterRepair: false })
    : { items: validItems, conflict: false, conflicts: [], stripped: 0 };
  let adsConflict = !!adsMeta.conflict;

  // ── Step 3: assess, maybe repair (exactly once) ───────────────────────────
  const countOk = countMeetsBlueprintTarget(blueprint, validItems.length, target);
  const needsRepair = !countOk || adsConflict;

  if (!needsRepair) {
    if (isAdsMatch) {
      const finalCheck = validateAdsUnique(validItems);
      if (!finalCheck.ok) {
        return _discardResult(validItems.length, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped },
          'duplicate_ads_after_postprocess');
      }
    }
    applyPartPostprocess(validItems);
    if (!skipTopicCoherence) {
      const topicDiscard = await maybeDiscardTopicCoherence(
        validItems,
        part,
        coherenceCtx,
        target,
        minItems,
        blueprint,
        { structInvalid, aiFailed, aiSkipped },
      );
      if (topicDiscard) return topicDiscard;
    }
    return _buildResult(validItems, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped, repaired: false });
  }

  if (!repair || !apiKey) {
    if (adsConflict) {
      const stripped = discardDuplicateAdItems(validItems);
      validItems = stripped.kept;
      adsMeta = { stripped: stripped.removed.length, conflicts: adsMeta.conflicts };
    }
    if (countMeetsBlueprintTarget(blueprint, validItems.length, target)) {
      if (isAdsMatch) {
        const finalCheck = validateAdsUnique(validItems);
        if (!finalCheck.ok) {
          return _discardResult(validItems.length, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped },
            'duplicate_ads_after_postprocess');
        }
      }
      applyPartPostprocess(validItems);
      if (!skipTopicCoherence) {
        const topicDiscard = await maybeDiscardTopicCoherence(
          validItems,
          part,
          coherenceCtx,
          target,
          minItems,
          blueprint,
          { structInvalid, aiFailed, aiSkipped },
        );
        if (topicDiscard) return topicDiscard;
      }
      return _buildResult(validItems, target, minItems, blueprint, {
        structInvalid,
        aiFailed,
        aiSkipped,
        repaired: false,
        adsStripped: adsMeta.stripped || 0,
      });
    }
    return _discardResult(validItems.length, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped },
      adsConflict ? 'duplicate_ads_no_repair' : 'insufficient_items_no_repair');
  }

  // ── ONE repair attempt: generate missing / conflicting items ─────────────
  let repairCount = Math.max(0, target - validItems.length);
  if (adsConflict) {
    const split = splitAdsConflictItems(validItems);
    validItems = split.kept;
    repairCount = Math.max(repairCount, split.toReplace.length, 1);
    console.warn(
      `[partQualityGate] ads duplicate keys (${split.conflicts.length} conflicts), ` +
      `replacing ${split.toReplace.length} item(s) via repair`,
    );
  }

  console.info(`[partQualityGate] repair: ${validItems.length}/${target} valid, generating ${repairCount} more`);

  let repairItems = [];
  try {
    repairItems = await repairItemsWithAI(repairCount, part, { blueprint, validItems, isAdsMatch }, apiKey);
  } catch (err) {
    console.warn('[partQualityGate] repair threw:', err.message);
  }

  if (repairItems.length) {
    if (READING_LISTENING.has(module) && hasPassage) {
      autoAssignPassageId(repairItems, passage);
    }
    const repairPass = await validateAndVerifyQuestions(repairItems, {
      module,
      hasPassage,
      passage,
      apiKey,
    });
    structInvalid = [...structInvalid, ...repairPass.structInvalid];
    aiFailed = [...aiFailed, ...repairPass.aiFailed];
    aiSkipped = aiSkipped && repairPass.aiSkipped;
    validItems = [...validItems, ...repairPass.validItems];
    console.info(`[partQualityGate] after repair: ${validItems.length}/${target} valid items`);
  }

  if (isAdsMatch) {
    const postRepair = resolveAdsDuplicates(validItems, { afterRepair: true });
    validItems = postRepair.items;
    if (postRepair.stripped) {
      console.info(`[partQualityGate] stripped ${postRepair.stripped} duplicate-ad item(s) after repair`);
    }
    adsMeta = { ...adsMeta, stripped: (adsMeta.stripped || 0) + postRepair.stripped };
  }

  // ── Final decision ────────────────────────────────────────────────────────
  if (!countMeetsBlueprintTarget(blueprint, validItems.length, target)) {
    return _discardResult(validItems.length, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped },
      'insufficient_items_after_repair');
  }

  if (isAdsMatch) {
    const finalCheck = validateAdsUnique(validItems);
    if (!finalCheck.ok) {
      return _discardResult(validItems.length, target, minItems, blueprint, { structInvalid, aiFailed, aiSkipped },
        'duplicate_ads_after_postprocess');
    }
  }

  applyPartPostprocess(validItems);
  if (!skipTopicCoherence) {
    const topicDiscard = await maybeDiscardTopicCoherence(
      validItems,
      part,
      coherenceCtx,
      target,
      minItems,
      blueprint,
      { structInvalid, aiFailed, aiSkipped },
    );
    if (topicDiscard) return topicDiscard;
  }
  return _buildResult(validItems, target, minItems, blueprint, {
    structInvalid,
    aiFailed,
    aiSkipped,
    repaired: true,
    adsStripped: adsMeta.stripped || 0,
  });
}

function _buildResult(validItems, target, minItems, blueprint, meta) {
  const complete   = countMeetsBlueprintTarget(blueprint, validItems.length, target);
  const acceptable = complete;
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

function _discardResult(count, target, minItems, blueprint, meta, reason) {
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

/**
 * Light gate for content-staging ingest (structural + optional semantic, no repair).
 */
async function validateStagingRecord(record, { blueprint = null, apiKey = null } = {}) {
  const module = String(record.module || 'lesen').toLowerCase();
  const teil = record.teil ?? 1;
  const passage = record.passage || null;
  const hasPassage = !!(passage?.text || passage?.transcript);

  autoAssignPassageId(record.questions, passage);

  const {
    validItems,
    structInvalid,
    aiFailed,
    aiSkipped,
    aiSkipReason,
    aiFailures,
  } = await validateAndVerifyQuestions(record.questions, {
    module,
    hasPassage,
    passage,
    apiKey,
  });

  applyPartPostprocess(validItems);

  const target = blueprint
    ? partExactTargetFromBlueprint(blueprint, module, teil)
    : Math.max(validItems.length, ABS_MIN_ITEMS);
  const isRubricModule = ['schreiben', 'sprechen', 'writing', 'speaking'].includes(module);
  const minItems = isRubricModule ? 1 : partialAcceptanceMinItems(blueprint, target);
  const complete = countMeetsBlueprintTarget(blueprint, validItems.length, target);
  const partContext = buildPartRenderContext(record);

  const errors = [];
  for (const inv of structInvalid || []) {
    for (const e of inv.errors || []) errors.push(`struct:${e}`);
  }
  for (const f of aiFailures || []) {
    errors.push(`semantic:${f.reason || f.id || 'failed'}`);
  }
  for (const e of collectNonRenderableKeyErrors(validItems, partContext)) {
    errors.push(e);
  }
  if (validItems.length < minItems) {
    errors.push(`insufficient_items:received=${validItems.length},min=${minItems}`);
  }

  return {
    valid: errors.length === 0,
    complete,
    questions: validItems,
    itemCount: validItems.length,
    minItems,
    targetCount: target,
    errors,
    structInvalid,
    aiFailed,
    aiSkipped,
    aiSkipReason,
  };
}

module.exports = {
  ABS_MIN_ITEMS,
  MIN_DIVISOR,
  computeMinItems,
  partExactTargetFromBlueprint,
  partMinTargetFromBlueprint,
  requiredItemCount,
  partialAcceptanceMinItems,
  countMeetsBlueprintTarget,
  buildPartRenderContext,
  collectNonRenderableKeyErrors,
  autoAssignPassageId,
  filterPassageIdMismatches,
  validateSingleItem,
  validateItemsStructurally,
  validateAndVerifyQuestions,
  validateStagingRecord,
  repairItemsWithAI,
  runPartQualityGate,
  isAdsMatchingTeil3,
  applyPartPostprocess,
  balanceAnswerPositions,
  validateAdsUnique,
};
