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
const { partMinTargetFromBlueprint, ABS_MIN_ITEMS, computeMinItems } = require('./partQualityGate.js');

/**
 * Convert a staging candidate + optional blueprint into a reusable part
 * and persist it.
 *
 * @param {object} store       Netlify Blobs store
 * @param {object} candidate   Full staging candidate blob
 * @param {object} [opts]
 *   blueprint  {object|null}  Loaded blueprint JSON (for targetCount).
 *   verified   {boolean}      Override verified flag (default: true for human approval).
 * @returns {Promise<{partKey, idxKey, id}|null>}
 */
async function approvePartToReusable(store, candidate, { blueprint = null, verified = true } = {}) {
  if (!candidate || !candidate.lang || !candidate.level || !candidate.module) {
    console.warn('[autoApprove] invalid candidate — missing lang/level/module');
    return null;
  }

  const { lang, level, module, teil, passage, questions, contributor, provenance } = candidate;
  const itemCount  = Array.isArray(questions) ? questions.length : 0;
  const targetCount = blueprint
    ? partMinTargetFromBlueprint(blueprint, module, teil)
    : itemCount;
  const complete = itemCount >= targetCount;

  // Parse createdAt from ISO string or epoch
  let createdAt = Date.now();
  if (provenance?.createdAt) {
    createdAt = typeof provenance.createdAt === 'number'
      ? provenance.createdAt
      : (Date.parse(provenance.createdAt) || Date.now());
  }

  const part = {
    id:          candidate.id,        // keep staging ID for cross-reference
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
 * Criteria: basic structural validity + minimum item count.
 * AI answer-key verification is implied by `candidate.verified === true`
 * (set by the caller when EXAM_ANSWER_KEY_VERIFY=1 ran on the client).
 */
function isAutoApprovable(candidate) {
  if (!candidate?.validation?.valid) return false;
  const itemCount = Array.isArray(candidate.questions) ? candidate.questions.length : 0;
  return itemCount >= ABS_MIN_ITEMS;
}

module.exports = { approvePartToReusable, isAutoApprovable };
