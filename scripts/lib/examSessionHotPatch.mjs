/**
 * examSessionHotPatch.mjs — pure helpers to patch live S.examData prose fields.
 * Used by AdminContentReview (browser mirrors this logic) and unit tests.
 *
 * Locate by targetId + fieldPath only — never by array index.
 */
import {
  HOT_PATCH_SAFE_FIELD_PATHS,
  isHotPatchSafeFieldPath,
} from './contentCorrectionSchema.mjs';

export { HOT_PATCH_SAFE_FIELD_PATHS, isHotPatchSafeFieldPath };

export const MSG_HOT_PATCHED =
  'Corregido — ya se actualizó en pantalla.';
export const MSG_NEXT_PART =
  'Corregido — se aplicará a partir de la próxima parte/examen (no afecta esta pregunta ya mostrada).';

const MODULE_PART_KEYS = [
  'lesenParts',
  'horenParts',
  'schreibenParts',
  'sprechenParts',
  'readingParts',
  'listeningParts',
  'writingParts',
  'speakingParts',
];

function idOf(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.id != null && obj.id !== '') return String(obj.id);
  if (obj.passageId != null && obj.passageId !== '') return String(obj.passageId);
  if (obj.questionId != null && obj.questionId !== '') return String(obj.questionId);
  return null;
}

/** All locator strings on an object (id and passageId may differ on segments). */
function idsOf(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const out = [];
  for (const k of ['id', 'passageId', 'questionId']) {
    if (obj[k] != null && String(obj[k]).trim() !== '') out.push(String(obj[k]));
  }
  return out;
}

/**
 * Collect candidate objects that may hold a content field for targetId.
 * @returns {object[]}
 */
export function findTargetsById(examData, targetId) {
  const want = String(targetId || '').trim();
  if (!want || !examData || typeof examData !== 'object') return [];
  const hits = [];

  function consider(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (idsOf(obj).includes(want)) hits.push(obj);
  }

  function walkPart(part) {
    if (!part || typeof part !== 'object') return;
    consider(part);
    if (Array.isArray(part.passages)) part.passages.forEach(consider);
    if (Array.isArray(part.questions)) part.questions.forEach(consider);
    if (Array.isArray(part.items)) part.items.forEach(consider);
    if (Array.isArray(part.ads)) part.ads.forEach(consider);
    if (Array.isArray(part.opinions)) part.opinions.forEach(consider);
    if (Array.isArray(part.persons)) part.persons.forEach(consider);
    if (Array.isArray(part.segments)) {
      for (const seg of part.segments) {
        consider(seg);
        if (Array.isArray(seg.questions)) seg.questions.forEach(consider);
      }
    }
  }

  for (const key of MODULE_PART_KEYS) {
    const arr = examData[key];
    if (Array.isArray(arr)) arr.forEach(walkPart);
  }

  // Flat legacy shapes
  if (examData.horen && typeof examData.horen === 'object') consider(examData.horen);
  if (Array.isArray(examData.questions)) examData.questions.forEach(consider);
  if (Array.isArray(examData.passages)) examData.passages.forEach(consider);

  return hits;
}

function leafField(fieldPath) {
  return String(fieldPath || '')
    .trim()
    .split('.')
    .pop();
}

/**
 * Write prose field onto a located object (mutates).
 * @returns {boolean} whether a write happened
 */
export function writeProseField(obj, fieldPath, newValue) {
  if (!obj || typeof obj !== 'object') return false;
  const leaf = leafField(fieldPath);
  if (!isHotPatchSafeFieldPath(leaf)) return false;

  if (leaf === 'question') {
    if (Object.prototype.hasOwnProperty.call(obj, 'question') || obj.question != null) {
      obj.question = newValue;
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'signText') || obj.signText != null) {
      obj.signText = newValue;
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'statement') || obj.statement != null) {
      obj.statement = newValue;
      return true;
    }
    obj.question = newValue;
    return true;
  }

  if (leaf === 'title') {
    if (Object.prototype.hasOwnProperty.call(obj, 'title') || obj.title != null) {
      obj.title = newValue;
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'textTitle') || obj.textTitle != null) {
      obj.textTitle = newValue;
      return true;
    }
    obj.title = newValue;
    return true;
  }

  if (leaf === 'text') {
    if (Object.prototype.hasOwnProperty.call(obj, 'text') || obj.text != null) {
      obj.text = newValue;
      return true;
    }
    // Hören segments store the audible text as transcript, not text
    if (Object.prototype.hasOwnProperty.call(obj, 'transcript') || obj.transcript != null) {
      obj.transcript = newValue;
      return true;
    }
    return false;
  }

  if (leaf === 'explanation') {
    obj.explanation = newValue;
    return true;
  }

  if (leaf === 'transcript') {
    if (Object.prototype.hasOwnProperty.call(obj, 'transcript') || obj.transcript != null) {
      obj.transcript = newValue;
      return true;
    }
    // Some segments store transcript as text
    if (Object.prototype.hasOwnProperty.call(obj, 'text')) {
      obj.transcript = newValue;
      return true;
    }
    obj.transcript = newValue;
    return true;
  }

  return false;
}

/**
 * Hot-patch exam session data in place.
 * @returns {{ ok: boolean, patched: boolean, reason?: string, message: string }}
 */
export function applyHotPatchToExamData(examData, { targetId, fieldPath, newValue } = {}) {
  const leaf = leafField(fieldPath);
  if (!isHotPatchSafeFieldPath(leaf)) {
    return { ok: true, patched: false, reason: 'not_hot_patch_safe', message: MSG_NEXT_PART };
  }
  if (!examData || typeof examData !== 'object') {
    return { ok: false, patched: false, reason: 'no_exam_data', message: MSG_NEXT_PART };
  }
  const hits = findTargetsById(examData, targetId);
  if (!hits.length) {
    return { ok: false, patched: false, reason: 'target_not_found', message: MSG_NEXT_PART };
  }
  let wrote = false;
  for (const obj of hits) {
    if (writeProseField(obj, leaf, newValue)) wrote = true;
  }
  if (!wrote) {
    return { ok: false, patched: false, reason: 'field_not_writable', message: MSG_NEXT_PART };
  }
  return { ok: true, patched: true, message: MSG_HOT_PATCHED };
}
