/**
 * Schema validator — soft, additive metadata checks only.
 * Does NOT replace ExamValidator. Never requires tags. Never blocks legacy exams.
 */
const SchemaValidator = (() => {
  const T = typeof LexiCoilMetadataTypes !== 'undefined' ? LexiCoilMetadataTypes : null;
  const DIFF_MIN = T?.DIFFICULTY_MIN ?? 1;
  const DIFF_MAX = T?.DIFFICULTY_MAX ?? 10;

  const METADATA_KEYS = ['grammarTags', 'topicTags', 'vocabularyTags', 'difficulty'];

  function isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  function validateStringArrayField(obj, key, path, warnings) {
    if (!(key in obj)) return;
    const val = obj[key];
    if (val == null) return;
    if (!Array.isArray(val)) {
      warnings.push(`${path}: ${key} should be string[] when present`);
      return;
    }
    val.forEach((item, i) => {
      if (typeof item !== 'string' || !item.trim()) {
        warnings.push(`${path}: ${key}[${i}] should be a non-empty string`);
      }
    });
  }

  function validateDifficultyField(obj, path, warnings) {
    if (!('difficulty' in obj) || obj.difficulty == null || obj.difficulty === '') return;
    const n = Number(obj.difficulty);
    if (!Number.isFinite(n)) {
      warnings.push(`${path}: difficulty should be a number 1–10 when present`);
      return;
    }
    if (n < DIFF_MIN || n > DIFF_MAX) {
      warnings.push(`${path}: difficulty ${n} outside allowed range ${DIFF_MIN}–${DIFF_MAX}`);
    }
  }

  /**
   * Validate optional metadata on any partial object (question, part, or exam root).
   * Always returns valid: true — warnings only, never errors that block rendering.
   */
  function validateMetadataFields(obj, path = 'object') {
    const warnings = [];
    if (!isPlainObject(obj)) {
      return { valid: true, warnings: [], partial: true };
    }
    validateStringArrayField(obj, 'grammarTags', path, warnings);
    validateStringArrayField(obj, 'topicTags', path, warnings);
    validateStringArrayField(obj, 'vocabularyTags', path, warnings);
    validateDifficultyField(obj, path, warnings);
    return { valid: true, warnings, partial: true };
  }

  function hasMetadataFields(obj) {
    if (!isPlainObject(obj)) return false;
    return METADATA_KEYS.some((k) => k in obj && obj[k] != null && obj[k] !== '');
  }

  const PART_KEYS = [
    'lesenParts',
    'horenParts',
    'schreibenParts',
    'sprechenParts',
    'readingParts',
    'listeningParts',
    'writingParts',
    'speakingParts',
  ];

  const CHILD_KEYS = ['questions', 'items', 'segments', 'noteFields'];

  /**
   * Soft audit of metadata across an exam document.
   * Legacy exams with zero metadata fields produce zero warnings.
   */
  function validateExamMetadata(exam) {
    const warnings = [];
    if (!isPlainObject(exam)) {
      return { valid: true, warnings: [], metadataPresent: false };
    }

    let metadataPresent = false;

    const audit = (obj, path) => {
      if (!hasMetadataFields(obj)) return;
      metadataPresent = true;
      const r = validateMetadataFields(obj, path);
      warnings.push(...r.warnings);
    };

    audit(exam, 'exam');

    for (const partKey of PART_KEYS) {
      (exam[partKey] || []).forEach((part, pi) => {
        audit(part, `${partKey}[${pi}]`);
        for (const childKey of CHILD_KEYS) {
          (part?.[childKey] || []).forEach((child, ci) => {
            audit(child, `${partKey}[${pi}].${childKey}[${ci}]`);
          });
        }
      });
    }

    for (const skill of ['reading', 'listening', 'writing', 'speaking']) {
      if (isPlainObject(exam[skill])) audit(exam[skill], skill);
    }

    for (const modKey of ['lesen', 'horen', 'reading', 'listening', 'gapfill']) {
      const mod = exam[modKey];
      if (!isPlainObject(mod)) continue;
      audit(mod, modKey);
      for (const childKey of ['questions', 'sentences']) {
        (mod[childKey] || []).forEach((child, ci) => {
          audit(child, `${modKey}.${childKey}[${ci}]`);
        });
      }
    }

    return { valid: true, warnings, metadataPresent };
  }

  /**
   * Extend an existing ExamValidator result with optional metadata warnings.
   * Does not change validity of the underlying exam structure.
   */
  function extendExamValidation(exam, baseResult) {
    const meta = validateExamMetadata(exam);
    return {
      valid: baseResult?.valid !== false,
      errors: baseResult?.errors || [],
      metadata: meta,
    };
  }

  return Object.freeze({
    METADATA_KEYS,
    validateMetadataFields,
    validateExamMetadata,
    extendExamValidation,
    hasMetadataFields,
  });
})();

if (typeof window !== 'undefined') window.SchemaValidator = SchemaValidator;
if (typeof module !== 'undefined') module.exports = SchemaValidator;
