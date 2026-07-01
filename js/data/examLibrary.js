/* Static exam library � curated JSON exams per subject/level */
const ExamLibrary = (() => {
  const CACHE = {};
  const AVAIL_PATH = 'data/exams/availability.json';
  const CANDIDATE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const LANGS = ['de', 'en', 'es'];

  let MANIFEST = null;
  let manifestPromise = null;
  /** Secondary HEAD probe cache (runtime file check). */
  const PROBE = {};

  function showBetaLevels() {
    if (typeof window !== 'undefined' && window.LEXICOIL_SHOW_BETA_LEVELS === true) return true;
    if (typeof process !== 'undefined' && process.env && process.env.LEXICOIL_SHOW_BETA_LEVELS === '1') {
      return true;
    }
    return false;
  }

  function filePath(subject, level) {
    return `data/exams/${subject}_${level}.json`;
  }

  function cacheKey(subject, level) {
    return `${subject}_${level}`;
  }

  function buildEmptyManifest() {
    const m = {};
    for (const lang of LANGS) {
      m[lang] = {};
      for (const level of CANDIDATE_LEVELS) {
        m[lang][level] = { status: 'hidden', exams: 0 };
      }
    }
    return m;
  }

  function getManifestSync() {
    if (MANIFEST) return MANIFEST;
    if (typeof require !== 'undefined') {
      try {
        const fs = require('fs');
        const pathMod = require('path');
        const p = pathMod.join(process.cwd(), AVAIL_PATH);
        if (fs.existsSync(p)) {
          MANIFEST = JSON.parse(fs.readFileSync(p, 'utf8'));
          return MANIFEST;
        }
      } catch (_) {}
    }
    return null;
  }

  async function ensureManifest() {
    if (MANIFEST) return MANIFEST;
    if (manifestPromise) return manifestPromise;
    manifestPromise = (async () => {
      const sync = getManifestSync();
      if (sync) {
        MANIFEST = sync;
        return MANIFEST;
      }
      try {
        const res = await fetch(AVAIL_PATH, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        MANIFEST = await res.json();
        return MANIFEST;
      } catch (e) {
        if (typeof lcDebug !== 'undefined') lcDebug.warn('[ExamLibrary] availability manifest load failed:', e);
        MANIFEST = buildEmptyManifest();
        return MANIFEST;
      } finally {
        manifestPromise = null;
      }
    })();
    return manifestPromise;
  }

  function getStatus(subject, level) {
    const m = MANIFEST || getManifestSync();
    if (!m) return 'hidden';
    return m[subject]?.[level]?.status || 'hidden';
  }

  function getExamCount(subject, level) {
    const m = MANIFEST || getManifestSync();
    return m?.[subject]?.[level]?.exams ?? 0;
  }

  function isSelectable(subject, level) {
    const st = getStatus(subject, level);
    if (st === 'live') return true;
    if (st === 'beta' && showBetaLevels()) return true;
    return false;
  }

  function hasLibrary(subject, level) {
    return isSelectable(subject, level);
  }

  async function probeLevel(subject, level) {
    const key = cacheKey(subject, level);
    if (PROBE[key] !== undefined) return PROBE[key];
    try {
      const res = await fetch(filePath(subject, level), { method: 'HEAD', cache: 'no-store' });
      PROBE[key] = res.ok;
      return PROBE[key];
    } catch (_) {
      PROBE[key] = false;
      return false;
    }
  }

  async function discoverLevels(subject) {
    await ensureManifest();
    const levels = CANDIDATE_LEVELS.filter((level) => isSelectable(subject, level));
    await Promise.all(
      levels.map(async (level) => {
        const ok = await probeLevel(subject, level);
        if (!ok && typeof lcDebug !== 'undefined') {
          lcDebug.warn(`[ExamLibrary] manifest selectable but HEAD failed: ${subject}_${level}`);
        }
      }),
    );
    return levels;
  }

  function unavailableError(subject, level) {
    const st = getStatus(subject, level);
    const err = new Error(
      st === 'beta'
        ? `Exams for ${subject.toUpperCase()} ${level} are in review and not available yet.`
        : `No curated exams for ${subject.toUpperCase()} ${level} yet.`,
    );
    err.code = 'exam_library_unavailable';
    err.status = st;
    return err;
  }

  async function loadExams(subject, level) {
    await ensureManifest();
    if (!isSelectable(subject, level)) {
      throw unavailableError(subject, level);
    }
    const key = cacheKey(subject, level);
    if (CACHE[key]) return CACHE[key];
    const res = await fetch(filePath(subject, level));
    if (!res.ok) throw unavailableError(subject, level);
    const exams = await res.json();
    if (!Array.isArray(exams) || !exams.length) {
      const err = new Error(`Exam library is empty for ${subject} ${level}`);
      err.code = 'exam_library_unavailable';
      throw err;
    }
    CACHE[key] = exams;
    return exams;
  }

  async function pickExam(subject, level) {
    const exams = await loadExams(subject, level);
    const idx = Math.floor(Math.random() * exams.length);
    return JSON.parse(JSON.stringify(exams[idx]));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Pick a static exam not on cooldown; null if all are on cooldown. */
  async function pickExamExcluding(subject, level, isBurnedFn) {
    const exams = await loadExams(subject, level);
    for (const exam of shuffle(exams)) {
      if (typeof isBurnedFn === 'function' && isBurnedFn(exam)) continue;
      return JSON.parse(JSON.stringify(exam));
    }
    return null;
  }

  function availableLevels(subject) {
    if (!MANIFEST && !getManifestSync()) return [];
    return CANDIDATE_LEVELS.filter((level) => isSelectable(subject, level));
  }

  function advertisedLevels(subject) {
    return [...CANDIDATE_LEVELS];
  }

  function getLevelUiStatus(subject, level) {
    const st = getStatus(subject, level);
    if (st === 'live') return 'ready';
    if (st === 'beta' && showBetaLevels()) return 'ready';
    return 'soon';
  }

  return {
    AVAIL_PATH,
    CANDIDATE_LEVELS,
    ensureManifest,
    getManifestSync,
    getStatus,
    getExamCount,
    showBetaLevels,
    isSelectable,
    hasLibrary,
    pickExam,
    pickExamExcluding,
    loadExams,
    availableLevels,
    advertisedLevels,
    discoverLevels,
    probeLevel,
    getLevelUiStatus,
  };
})();

if (typeof window !== 'undefined') window.ExamLibrary = ExamLibrary;
if (typeof module !== 'undefined') module.exports = ExamLibrary;
