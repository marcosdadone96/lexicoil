/**
 * Official exam content source toggle.
 *
 *   'published' — library/published-exams/{lang}/{level}/ (_catalog + snapshots)
 *   'legacy'    — data/exams/{lang}_{level}.json (static served file)
 *
 * Set before examLibrary loads, e.g. in index.html:
 *   window.LEXICOIL_EXAM_SOURCE = 'published';
 */
(function (global) {
  var VALID = { published: true, legacy: true };

  function getLexicoilExamSource() {
    var v = global.LEXICOIL_EXAM_SOURCE;
    if (typeof v === 'string' && VALID[v]) return v;
    return 'legacy';
  }

  global.getLexicoilExamSource = getLexicoilExamSource;
})(typeof window !== 'undefined' ? window : globalThis);
