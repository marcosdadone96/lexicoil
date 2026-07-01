'use strict';

/**
 * autoApprovePartToReusable — shared helper used by both auto-approval
 * (content-staging.js) and manual approval (admin-api.js approve_candidate).
 *
 * Maps a staging candidate to a reusable part and writes it to the
 * reusable-parts store.  Does NOT touch staging status or maybePromote —
 * that remains the caller's responsibility (via A track).
 */

const { addReusablePart } = require('./reusablePartsStore.js');
const {
  partExactTargetFromBlueprint,
  ABS_MIN_ITEMS,
  buildPartRenderContext,
  collectNonRenderableKeyErrors,
} = require('./partQualityGate.js');

/**
 * Convert a staging candidate + blueprint into a reusable part and persist it.
 *
 * @param {object} store       Netlify Blobs store
 * @param {object} candidate   Full staging candidate blob
 * @param {object} [opts]
 *   blueprint  {object|null}  Loaded blueprint JSON (required for complete flag).
 *   verified   {boolean}      Override verified flag (default: true for human approval).
 * @returns {Promise<{partKey, idxKey, id}|null>}
 */
async function approvePartToReusable(store, candidate, { blueprint = null, verified = true } = {}) {
  if (!candidate || !candidate.lang || !candidate.level || !candidate.module) {
    console.warn('[autoApprove] invalid candidate — missing lang/level/module');
    return null;
  }

  const { lang, level, module, teil, passage, questions, contributor, provenance } = candidate;
  const itemCount = Array.isArray(questions) ? questions.length : 0;
  const targetCount = blueprint
    ? partExactTargetFromBlueprint(blueprint, module, teil)
    : itemCount;
  const complete = blueprint ? itemCount === targetCount : itemCount > 0;

  const partContext = buildPartRenderContext(candidate);
  const renderErrors = collectNonRenderableKeyErrors(questions, partContext);
  if (renderErrors.length) {
    console.warn('[autoApprove] rejected — non-renderable keys:', renderErrors.slice(0, 3));
    return null;
  }

  // Parse createdAt from ISO string or epoch
  let createdAt = Date.now();
  if (provenance?.createdAt) {
    createdAt = typeof provenance.createdAt === 'number'
      ? provenance.createdAt
      : (Date.parse(provenance.createdAt) || Date.now());
  }

  const part = {
    id:          candidate.id,
    lang,
    level,
    module,
    teil,
    passage:     passage      || null,
    questions:   questions    || [],
    complete,
    verified:    !!verified,
    itemCount,
    targetCount,
    contributor: contributor  || null,
    createdAt,
  };

  try {
    const result = await addReusablePart(store, part);
    console.info(`[autoApprove] stored ${lang}/${level}/${module} t${teil} id=${result.id} complete=${complete}`);
    return result;
  } catch (err) {
    console.error('[autoApprove] addReusablePart failed:', err.message);
    return null;
  }
}

/**
 * Quick check: is a staging candidate eligible for auto-approval to the
 * reusable-parts store without human review?
 *
 * Requires: structural validity, exact blueprint item count, renderable keys.
 * AI answer-key verification is implied by callerVerified when EXAM_ANSWER_KEY_VERIFY=1.
 */
function isAutoApprovable(candidate, { callerVerified = false, blueprint = null } = {}) {
  if (!candidate?.validation?.valid) return false;
  if (candidate.complete === false) return false;

  const itemCount = Array.isArray(candidate.questions) ? candidate.questions.length : 0;
  if (itemCount < ABS_MIN_ITEMS) return false;

  if (blueprint) {
    const target = partExactTargetFromBlueprint(blueprint, candidate.module, candidate.teil);
    if (itemCount !== target) return false;
  }

  const renderErrors = collectNonRenderableKeyErrors(
    candidate.questions,
    buildPartRenderContext(candidate),
  );
  if (renderErrors.length) return false;

  if (process.env.EXAM_ANSWER_KEY_VERIFY === '1' && !callerVerified) return false;
  return true;
}

module.exports = { approvePartToReusable, isAutoApprovable };
