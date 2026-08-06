'use strict';

/**
 * Lightweight metadata sync after a content correction is applied.
 * Full NLP re-tagging is out of scope; we keep tags coherent with the new text
 * and ensure structural mirrors (correct ↔ correctAnswer).
 */

function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function tokensFrom(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-zäöüß0-9+-]+/i)
    .filter((t) => t.length >= 3);
}

/**
 * Drop vocabulary/grammar tags that only matched the old wording.
 * @param {object} targetObj — question or passage mutated in place
 * @param {object} correction
 */
function pruneStaleTags(targetObj, correction) {
  if (!targetObj || typeof targetObj !== 'object') return;
  const leaf = String(correction.fieldPath || '')
    .split('.')
    .pop();
  const contentFields = new Set(['text', 'question', 'transcript', 'explanation', 'statement', 'signText', 'title']);
  if (!contentFields.has(leaf)) return;

  const oldTok = new Set(tokensFrom(asText(correction.oldValue)));
  const newTok = new Set(tokensFrom(asText(correction.newValue)));
  const removed = [...oldTok].filter((t) => !newTok.has(t));
  if (!removed.length) return;

  const pruneList = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((tag) => {
      const t = String(tag || '').toLowerCase();
      return !removed.some((r) => t.includes(r) || r.includes(t));
    });
  };

  if (Array.isArray(targetObj.vocabularyTags)) {
    targetObj.vocabularyTags = pruneList(targetObj.vocabularyTags);
  }
  if (Array.isArray(targetObj.grammarTags)) {
    targetObj.grammarTags = pruneList(targetObj.grammarTags);
  }
  if (Array.isArray(targetObj.topicTags)) {
    targetObj.topicTags = pruneList(targetObj.topicTags);
  }
}

function syncCorrectMirror(targetObj) {
  if (!targetObj || typeof targetObj !== 'object') return;
  if (targetObj.correct != null) targetObj.correctAnswer = targetObj.correct;
  else if (targetObj.correctAnswer != null) targetObj.correct = targetObj.correctAnswer;
}

/**
 * @param {object} batch
 * @param {object} correction
 * @param {{ findTarget?: Function }} [helpers]
 */
function regenerateCorrectionMetadata(batch, correction, helpers = {}) {
  const findTarget = helpers.findTarget;
  let target = null;
  if (typeof findTarget === 'function') {
    target = findTarget(batch, correction.targetId, correction.targetType);
  }
  if (target && target.obj) {
    syncCorrectMirror(target.obj);
    pruneStaleTags(target.obj, correction);
    target.obj.metadataSyncedAt = new Date().toISOString();
  }

  // Batch-level mirrors for questions
  for (const q of batch.questions || []) {
    syncCorrectMirror(q);
  }

  return batch;
}

module.exports = {
  regenerateCorrectionMetadata,
  pruneStaleTags,
  syncCorrectMirror,
};
