/* Static exam library  curated JSON exams per subject/level */
const ExamLibrary = (() => {
  const CACHE = {};
  const AVAIL = {};
  const CANDIDATE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  const LEVELS = {
    de: [...CANDIDATE_LEVELS],
    en: [],
    es: [],
  };

  function filePath(subject, level) {
    return `data/exams/${subject}_${level}.json`;
  }

  function cacheKey(subject, level) {
    return `${subject}_${level}`;
  }

  function hasLibrary(subject, level) {
    const key = cacheKey(subject, level);
    if (AVAIL[key] === true) return true;
    if ((subject === 'de' || subject === 'es') && CANDIDATE_LEVELS.includes(level)) {
      return AVAIL[key] !== false;
    }
    return AVAIL[key] === true;
  }

  async function probeLevel(subject, level) {
    const key = cacheKey(subject, level);
    if (AVAIL[key] !== undefined) return AVAIL[key];
    try {
      const res = await fetch(filePath(subject, level), { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) {
        AVAIL[key] = false;
        return false;
      }
      AVAIL[key] = true;
      if (!LEVELS[subject]?.includes(level)) {
        LEVELS[subject] = [...(LEVELS[subject] || []), level].sort(
          (a, b) => CANDIDATE_LEVELS.indexOf(a) - CANDIDATE_LEVELS.indexOf(b),
        );
      }
      return true;
    } catch (_) {
      AVAIL[key] = false;
      return false;
    }
  }

  async function discoverLevels(subject) {
    const found = [];
    await Promise.all(
      CANDIDATE_LEVELS.map(async (level) => {
        if (await probeLevel(subject, level)) found.push(level);
      }),
    );
    LEVELS[subject] = found;
    return found;
  }

  async function loadExams(subject, level) {
    const key = cacheKey(subject, level);
    if (CACHE[key]) return CACHE[key];
    const res = await fetch(filePath(subject, level));
    if (!res.ok) throw new Error(`Exam library not found for ${subject} ${level}`);
    const exams = await res.json();
    if (!Array.isArray(exams) || !exams.length) throw new Error('Exam library is empty');
    CACHE[key] = exams;
    AVAIL[key] = true;
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
    return LEVELS[subject] ? [...LEVELS[subject]] : [];
  }

  return { hasLibrary, pickExam, pickExamExcluding, loadExams, availableLevels, discoverLevels, probeLevel };
})();
