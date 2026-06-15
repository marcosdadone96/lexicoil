/**
 * Shared exam candidate validation (replaces duplicated blocks in cascade sources).
 */
(function (global) {
  function validateExamCandidate(raw, opts) {
    opts = opts || {};
    var normalized =
      opts.normalized != null
        ? opts.normalized
        : typeof normalizeExam === 'function'
          ? normalizeExam(raw)
          : raw;
    if (!normalized) return { ok: false, normalized: null };
    if (typeof isExamRenderable === 'function' && !isExamRenderable(normalized)) {
      return { ok: false, normalized: normalized };
    }
    if (typeof isExamBlueprintComplete === 'function' && !isExamBlueprintComplete(normalized)) {
      return { ok: false, normalized: normalized };
    }
    if (typeof lcExamPassesValidator === 'function' && !lcExamPassesValidator(normalized)) {
      return { ok: false, normalized: normalized };
    }
    return { ok: true, normalized: normalized };
  }

  global.validateExamCandidate = validateExamCandidate;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateExamCandidate: validateExamCandidate };
  }
})(typeof window !== 'undefined' ? window : globalThis);
