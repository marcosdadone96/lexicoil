'use strict';

/**
 * Official-mode pool quarantine — mirrors assemble-from-pool-verified.mjs.
 * Parts with any _lengthBiasQuarantine or _lexicalCueingQuarantine question
 * are excluded from official picks (atomic: whole part skipped).
 */

function questionsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const out = [];
  if (Array.isArray(payload.questions)) out.push(...payload.questions);
  for (const seg of payload.segments || []) {
    if (Array.isArray(seg?.questions)) out.push(...seg.questions);
  }
  for (const passage of payload.passages || []) {
    if (Array.isArray(passage?.questions)) out.push(...passage.questions);
  }
  return out;
}

function questionHasOfficialQuarantine(q) {
  return !!(
    q &&
    (q._lengthBiasQuarantine === true || q._lexicalCueingQuarantine === true)
  );
}

function batchHasOfficialQuarantine(batch) {
  return questionsFromPayload(batch).some(questionHasOfficialQuarantine);
}

function partHasOfficialQuarantine(part) {
  return batchHasOfficialQuarantine(part);
}

function normalizeAssembleMode(mode) {
  const m = String(mode || 'practice').toLowerCase();
  return m === 'official' ? 'official' : 'practice';
}

/** True if part may be served for the given assemble mode. */
function partPassesAssembleMode(part, assembleMode) {
  if (normalizeAssembleMode(assembleMode) !== 'official') return true;
  return !partHasOfficialQuarantine(part);
}

function quarantineQuestionIds(batch) {
  return questionsFromPayload(batch)
    .filter(questionHasOfficialQuarantine)
    .map((q) => q.id)
    .filter(Boolean);
}

module.exports = {
  questionsFromPayload,
  questionHasOfficialQuarantine,
  batchHasOfficialQuarantine,
  partHasOfficialQuarantine,
  normalizeAssembleMode,
  partPassesAssembleMode,
  quarantineQuestionIds,
};
