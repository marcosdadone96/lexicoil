'use strict';

const ExamValidator = require('../../../js/engine/validation/ExamValidator.js');
const AnswerKeyVerifier = require('../../../js/engine/validation/AnswerKeyVerifier.js');
const { validateExamAgainstBlueprint, inferPartialExamDelivery } = require('../../../js/engine/validation/blueprintFidelity.js');
const { resolveBlueprint } = require('../../../js/engine/validation/blueprintResolver.js');
const {
  validateLesenT2PassageIntegrity,
  normalizeLesenT2FromPassages,
} = require('../../../js/engine/validation/lesenPassageIntegrity.js');
const { cefrGateEnabled } = require('../../../js/engine/validation/cefrGateFlags.js');
const CefrGate = require('../../../js/engine/validation/CefrGate.js');

const PLACEHOLDER_THRESHOLD = 5;
const PLACEHOLDER_RE = /\.\.\.|Option [A-D]"|"Text here"|"Question here"|Ein Text ueber|Ein Text über|An article about/gi;

function countPlaceholders(exam) {
  const text = JSON.stringify(exam || {});
  return (text.match(PLACEHOLDER_RE) || []).length;
}

/**
 * Structural + placeholder quality gate for generated exams.
 * Uses ExamValidator (answer-key structure) — does not change exam format.
 */
function validateGeneratedExam(exam, opts = {}) {
  const strict = opts.strict ?? process.env.VALIDATOR_STRICT === '1';
  const blueprint = opts.blueprint === false ? null : resolveBlueprint(exam, opts.blueprint);
  const partialExam =
    opts.partialExam === false
      ? false
      : opts.partialExam === true ||
        exam?._sectionPart === true ||
        exam?._partialGen === true ||
        exam?.vocabPersonal === true ||
        (blueprint && inferPartialExamDelivery(exam, blueprint));
  const validator = new ExamValidator();
  const structural = validator.validate(exam, {
    strict,
    blueprint: partialExam ? false : blueprint,
    cefrGate: cefrGateEnabled(opts),
    curation: opts.curation === true,
  });
  const errors = [...(structural.errors || [])];
  const warnings = [...(structural.warnings || [])];

  if (blueprint) {
    const fidelity = validateExamAgainstBlueprint(exam, blueprint, {
      examLabel: opts.examLabel,
      partialExam,
    });
    if (!fidelity.ok) {
      for (const e of fidelity.errors) {
        if (!errors.includes(e)) errors.push(e);
      }
    }
    if (fidelity.warnings?.length) {
      for (const w of fidelity.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
  }

  const placeholders = countPlaceholders(exam);

  if (placeholders > PLACEHOLDER_THRESHOLD) {
    const code = `exam_placeholder_content:count=${placeholders}`;
    if (!errors.includes(code) && !errors.some((e) => e.startsWith('exam_placeholder_content'))) {
      errors.push(code);
    }
  }

  let cefrMetrics;
  if (cefrGateEnabled(opts)) {
    const cefr = CefrGate.validateExam(exam);
    cefrMetrics = cefr.metrics;
    if (!cefr.withinRange) {
      cefr.reasons.forEach((r) => {
        const code = `cefr_gate:${r}`;
        if (!errors.includes(code)) errors.push(code);
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders,
    cefrMetrics,
    blueprintFidelity: blueprint ? true : undefined,
  };
}

const PART_SKIP_VERIFY_TYPES = new Set([
  'rubric', 'task', 'writing_task', 'speaking_task', 'essay', 'short_answer',
]);

function verifyModelForParts() {
  return String(process.env.CLAUDE_VERIFY_MODEL || 'claude-sonnet-4-6').trim();
}

function formatVerifyOption(o) {
  if (typeof o === 'string') return o.trim();
  if (o && typeof o === 'object') {
    const key = o.key != null ? String(o.key).trim() : '';
    const text = String(o.text ?? o.label ?? o.option ?? o.signText ?? '').trim();
    if (key && text) return `${key}) ${text}`;
    return text || key;
  }
  return '';
}

/**
 * Build per-item payloads for passage-grounded semantic verification (parts gate).
 */
function collectPartVerifyItems(questions, passage) {
  const sharedPassage = String(
    passage?.text ?? passage?.transcript ?? passage?.body ?? '',
  ).trim();
  const items = [];

  for (const q of (questions || [])) {
    const id = String(q.id ?? `q${items.length + 1}`);
    const type = String(q.type || q.questionType || 'multiple').toLowerCase();
    if (PART_SKIP_VERIFY_TYPES.has(type)) continue;

    const signText = String(q.signText || q.body || q.content || '').trim();
    const stem = String(q.question || q.statement || q.stem || '').trim();
    const bodyText = String(q.text || '').trim();
    const question = (stem || signText || bodyText).slice(0, 900);
    if (!question && type !== 'gap' && type !== 'fill_blank') continue;

    const marked = Array.isArray(q.correct) ? q.correct[0] : (q.correct ?? q.answer);
    const opts = (q.options || []).map(formatVerifyOption).filter(Boolean);
    const itemContext = signText && stem && signText !== stem ? signText : signText || '';
    const contextText =
      sharedPassage || itemContext || (opts.length >= 2 ? opts.join('\n') : stem || question);

    if (!contextText && !question) continue;

    const grammarText = [sharedPassage, itemContext, stem, bodyText, ...opts]
      .filter(Boolean)
      .join('\n---\n')
      .slice(0, 2400);

    items.push({
      id,
      type,
      question,
      marked: marked != null ? String(marked) : '',
      options: opts.slice(0, 12),
      contextLabel: sharedPassage ? 'passage' : itemContext ? 'item_text' : 'options_list',
      passageText: sharedPassage || itemContext || null,
      grammarText,
    });
  }
  return items;
}

function buildPartSemanticVerifyPrompt(items) {
  const payload = items.map((it) => ({
    id: it.id,
    type: it.type,
    question: it.question,
    marked: it.marked,
    options: it.options.length ? it.options : undefined,
    grammarText: it.grammarText || it.question,
    context: it.contextLabel,
  }));
  return [
    'You verify exam questions for ONE section of a language exam.',
    'For EACH item, decide whether:',
    '(a) the marked answer key is correct given the passage/transcript (or ad/option list for matching), AND',
    '(b) a candidate can answer using ONLY that passage/transcript and the item options — no outside knowledge, AND',
    '(c) for German content: check grammar in grammarText (shared passage, item signText, question stem, AND every MCQ option). ' +
      'Flag wrong verb forms like "gesteigen" (should be "gestiegen"), "Meine Namen ist" (should be "Mein Name ist"), ' +
      'wrong adjective endings ("vielfältig Ansätze"), subject–verb errors in options ("Er laufen" → "Er fährt"), ' +
      'or broken participles in question stems — not only in the main reading passage.',
    '',
    'Reply with ONLY valid JSON, no markdown:',
    '{"results":[{"id":"<id>","ok":true},{"id":"<id>","ok":false,"reason":"wrong_key|not_answerable_from_text|needs_external_knowledge|bad_grammar"}]}',
    '',
    'Set ok=true only when (a), (b), AND (c) hold. If the marked key is wrong, use reason "wrong_key".',
    'If the question requires facts not in the text, use "needs_external_knowledge".',
    'If the text supports a different answer or the question is ambiguous, use "not_answerable_from_text".',
    'If German grammar in the passage, question/statement, grammarText, or ANY option text is clearly wrong, use "bad_grammar".',
    '',
    'PASSAGE / TRANSCRIPT / CONTEXT:',
    items[0]?.passageText || '(see per-item options as the only context for matching items)',
    '',
    'ITEMS:',
    JSON.stringify(payload),
  ].join('\n');
}

function parsePartVerifyResponse(text) {
  const raw = String(text || '').replace(/```json|```/g, '').trim();
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data.results) ? data.results : [];
  } catch (_) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      const data = JSON.parse(m[0]);
      return Array.isArray(data.results) ? data.results : [];
    } catch (_2) {
      return [];
    }
  }
}

/**
 * Per-item semantic verification for reusable parts (Sonnet by default).
 * Discards individual items that fail — never rejects the whole part here.
 * Enabled only when EXAM_ANSWER_KEY_VERIFY=1.
 */
async function verifyPartQuestionsWithAI(questions, { passage = null, module = 'lesen', apiKey = null } = {}) {
  if (process.env.EXAM_ANSWER_KEY_VERIFY !== '1') {
    return { verified: questions, failed: [], skipped: true, reason: 'disabled', failures: [] };
  }
  if (!apiKey) {
    return { verified: questions, failed: [], skipped: true, reason: 'no_api_key', failures: [] };
  }

  const items = collectPartVerifyItems(questions, passage);
  if (!items.length) {
    return { verified: questions, failed: [], skipped: true, reason: 'no_verifiable_items', failures: [] };
  }

  const model = verifyModelForParts();
  const prompt = buildPartSemanticVerifyPrompt(items);

  let results = [];
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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[examQualityGate] part semantic verify API error:', data?.error?.message || res.status);
      const verifyIds = new Set(items.map((it) => it.id));
      const failed = (questions || []).filter((q) => verifyIds.has(String(q.id ?? '')));
      const failedIdSet = new Set(failed.map((q) => String(q.id ?? '')));
      return {
        verified: (questions || []).filter((q) => !failedIdSet.has(String(q.id ?? ''))),
        failed,
        skipped: false,
        reason: 'api_error',
        failures: failed.map((q) => ({ id: q.id, reason: 'verify_api_error' })),
      };
    }
    const text = (data.content || []).map((p) => p.text || '').join('');
    results = parsePartVerifyResponse(text);
  } catch (err) {
    console.warn('[examQualityGate] part semantic verify network error:', err.message);
    const verifyIds = new Set(items.map((it) => it.id));
    const failed = (questions || []).filter((q) => verifyIds.has(String(q.id ?? '')));
    const failedIdSet = new Set(failed.map((q) => String(q.id ?? '')));
    return {
      verified: (questions || []).filter((q) => !failedIdSet.has(String(q.id ?? ''))),
      failed,
      skipped: false,
      reason: 'network_error',
      failures: failed.map((q) => ({ id: q.id, reason: 'verify_network_error' })),
    };
  }

  const byId = new Map(results.map((r) => [String(r.id), r]));
  const failedIds = new Set();
  const failures = [];

  for (const item of items) {
    const r = byId.get(item.id);
    if (!r || r.ok !== true) {
      failedIds.add(item.id);
      failures.push({
        id: item.id,
        reason: r?.reason || 'verify_failed',
        marked: item.marked,
      });
    }
  }

  const verified = (questions || []).filter((q) => !failedIds.has(String(q.id ?? '')));
  const failed = (questions || []).filter((q) => failedIds.has(String(q.id ?? '')));

  if (failures.length) {
    console.info('[examQualityGate] part semantic verify discarded', failures.length, 'item(s)', {
      module,
      model,
    });
  }

  return { verified, failed, skipped: false, failures };
}

/**
 * Optional second pass: Haiku "solves" MCQs and compares with marked key.
 * Enabled only when EXAM_ANSWER_KEY_VERIFY=1.
 */
async function verifyAnswerKeysWithAI(exam, apiKey, opts = {}) {
  if (process.env.EXAM_ANSWER_KEY_VERIFY !== '1') {
    return { ok: true, skipped: true, reason: 'disabled', discrepancies: [] };
  }
  if (!apiKey) {
    return { ok: true, skipped: true, reason: 'no_api_key', discrepancies: [] };
  }

  const verifier = new AnswerKeyVerifier();
  const items = verifier.collectMcqItems(exam);
  if (!items.length) {
    return { ok: true, skipped: true, reason: 'no_mcq_items', discrepancies: [] };
  }

  const model = String(process.env.CLAUDE_VERIFY_MODEL || 'claude-haiku-4-5').trim();
  const prompt = verifier.buildSolverPrompt(items);

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
    console.warn('[examQualityGate] answer-key verify API error:', data?.error?.message || res.status);
    return { ok: true, skipped: true, reason: 'api_error', discrepancies: [] };
  }

  const text = (data.content || []).map((p) => p.text || '').join('');
  const solved = verifier.parseSolverResponse(text);
  const discrepancies = verifier.compare(items, solved);
  const mismatchRatio = items.length ? discrepancies.length / items.length : 0;
  const threshold = Number(process.env.EXAM_ANSWER_KEY_MISMATCH_THRESHOLD || 0.35);

  if (opts.collectOnly) {
    return { ok: true, skipped: false, discrepancies, mismatchRatio };
  }

  if (mismatchRatio >= threshold) {
    return {
      ok: false,
      skipped: false,
      discrepancies,
      mismatchRatio,
      message: 'answer_key_verify_mismatch',
    };
  }

  return { ok: true, skipped: false, discrepancies, mismatchRatio };
}

function partHasScorableContent(part, mod) {
  if (!part || typeof part !== 'object') return false;
  if (mod === 'lesen') {
    return !!(
      part.items?.length ||
      part.text ||
      part.ads?.length ||
      part.questions?.length ||
      part.opinions?.length
    );
  }
  if (mod === 'horen') {
    return !!(part.segments?.length || part.questions?.length || part.transcript);
  }
  if (mod === 'schreiben') return !!(part.task || part.instruction || part.prompt);
  if (mod === 'sprechen') {
    return !!(
      part.situation ||
      part.points?.length ||
      part.prompts?.length ||
      part.task
    );
  }
  return false;
}

function examHasRenderableContent(exam) {
  if (!exam || typeof exam !== 'object') return false;
  const lp = (exam.lesenParts || exam.readingParts || []).some((p) =>
    partHasScorableContent(p, 'lesen'),
  );
  const hp = (exam.horenParts || exam.listeningParts || []).some((p) =>
    partHasScorableContent(p, 'horen'),
  );
  const wp = (exam.schreibenParts || exam.writingParts || []).some((p) =>
    partHasScorableContent(p, 'schreiben'),
  );
  const sp = (exam.sprechenParts || exam.speakingParts || []).some((p) =>
    partHasScorableContent(p, 'sprechen'),
  );
  if (exam.vocabPersonal || exam.personalizedExam) return lp || hp || wp || sp;
  return lp && hp;
}

function stripVerifyFailedItems(exam, ids) {
  if (!exam || !ids?.length) return exam;
  const drop = new Set(ids.map(String));
  const keep = (q) => q && !drop.has(String(q.id ?? ''));

  for (const key of ['lesenParts', 'horenParts', 'readingParts', 'listeningParts']) {
    for (const part of exam[key] || []) {
      if (Array.isArray(part.questions)) part.questions = part.questions.filter(keep);
      if (Array.isArray(part.items)) part.items = part.items.filter(keep);
      for (const seg of part.segments || []) {
        if (Array.isArray(seg.questions)) seg.questions = seg.questions.filter(keep);
      }
    }
  }
  return exam;
}

function pruneEmptyExamParts(exam) {
  if (!exam) return exam;
  for (const [key, mod] of [
    ['lesenParts', 'lesen'],
    ['horenParts', 'horen'],
    ['schreibenParts', 'schreiben'],
    ['sprechenParts', 'sprechen'],
  ]) {
    if (!Array.isArray(exam[key])) continue;
    exam[key] = exam[key].filter((p) => partHasScorableContent(p, mod));
    if (!exam[key].length) delete exam[key];
  }
  return exam;
}

function pruneInvalidPersonalLesenParts(exam) {
  if (!exam?.lesenParts?.length) return exam;
  exam.lesenParts = exam.lesenParts.filter((part) => {
    if (Number(part.teil) !== 2) return true;
    normalizeLesenT2FromPassages(part);
    return validateLesenT2PassageIntegrity(part).length === 0;
  });
  if (!exam.lesenParts.length) delete exam.lesenParts;
  return exam;
}

/**
 * Personal exam delivery (Prompt 5): verify per item, discard failures, keep partial exam.
 */
async function verifyAndSanitizePersonalExam(exam, apiKey, opts = {}) {
  const blueprint = opts.blueprint === false ? null : resolveBlueprint(exam, opts.blueprint);
  const partialExam =
    opts.partialExam === false
      ? false
      : opts.partialExam === true ||
        exam?._sectionPart === true ||
        exam?._partialGen === true ||
        exam?.vocabPersonal === true ||
        (blueprint && inferPartialExamDelivery(exam, blueprint));
  let working = JSON.parse(JSON.stringify(exam || {}));
  if (partialExam || exam?.vocabPersonal) {
    working = pruneInvalidPersonalLesenParts(working);
  }
  let discarded = 0;

  for (const [key, mod] of [
    ['lesenParts', 'lesen'],
    ['horenParts', 'horen'],
  ]) {
    for (const part of working[key] || []) {
      const passage =
        mod === 'lesen'
          ? { text: part.text || part.textTitle, textTitle: part.textTitle }
          : { transcript: part.transcript || part.segments?.[0]?.transcript };

      for (const field of ['questions', 'items']) {
        const arr = part[field];
        if (!Array.isArray(arr) || !arr.length) continue;
        const r = await verifyPartQuestionsWithAI(arr, { passage, module: mod, apiKey });
        part[field] = r.verified;
        discarded += (r.failed || []).length;
      }
      for (const seg of part.segments || []) {
        if (!Array.isArray(seg.questions) || !seg.questions.length) continue;
        const r = await verifyPartQuestionsWithAI(seg.questions, {
          passage: { transcript: seg.transcript },
          module: mod,
          apiKey,
        });
        seg.questions = r.verified;
        discarded += (r.failed || []).length;
      }
    }
  }

  const keyVerify = await verifyAnswerKeysWithAI(working, apiKey, { collectOnly: true });
  if (keyVerify.discrepancies?.length) {
    stripVerifyFailedItems(
      working,
      keyVerify.discrepancies.map((d) => d.id).filter(Boolean),
    );
    discarded += keyVerify.discrepancies.length;
  }

  pruneEmptyExamParts(working);
  try {
    const ExamRenumber = require('../../../js/engine/examRenumber.js');
    if (ExamRenumber?.renumberExam) working = ExamRenumber.renumberExam(working);
  } catch (_) {
    /* renumber optional if bundle path differs */
  }
  const gate = validateGeneratedExam(working, { strict: false, blueprint, partialExam });
  const renderable = examHasRenderableContent(working);
  const emptyAfterVerify =
    !renderable ||
    (gate.errors || []).some((e) =>
      e.startsWith('items_total_mismatch:') ||
      (!partialExam && e.startsWith('part_missing:')),
    );
  return {
    exam: working,
    valid: gate.valid && renderable,
    renderable,
    emptyAfterVerify,
    discarded,
    errors: gate.errors,
    blueprint,
  };
}

module.exports = {
  validateGeneratedExam,
  verifyAnswerKeysWithAI,
  verifyPartQuestionsWithAI,
  verifyAndSanitizePersonalExam,
  collectPartVerifyItems,
  verifyModelForParts,
  examHasRenderableContent,
  stripVerifyFailedItems,
  pruneEmptyExamParts,
  PLACEHOLDER_THRESHOLD,
};
