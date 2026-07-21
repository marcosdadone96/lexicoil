/**
 * Personal exam vocabulary coverage — per-part and overall (informational only).
 */
const PersonalExamCoverage = (() => {
  function getTargetUsage() {
    if (typeof TargetUsage !== 'undefined') return TargetUsage;
    try {
      return require('./targetUsage.js');
    } catch {
      return null;
    }
  }

  function collectPartTexts(part, module) {
    const TU = getTargetUsage();
    if (!TU?.collectExamTexts) return '';
    const key = module === 'horen' ? 'horenParts' : 'lesenParts';
    return TU.collectExamTexts({ [key]: [part] });
  }

  function wordsUsedInText(text, words) {
    const TU = getTargetUsage();
    if (!TU || !words?.length) return [];
    const tokens = TU.extractTokens ? TU.extractTokens(text) : [];
    const used = [];
    for (const word of words) {
      const hit = tokens.some((t) => TU.tokenMatchesWord?.(t, word));
      if (hit) used.push(String(word));
    }
    return used;
  }

  function scanPartWords(part, module, words) {
    if (!part || part._fromPool) return [];
    const TU = getTargetUsage();
    if (TU?.deriveTargetUsage) {
      const key =
        module === 'horen' || module === 'listening'
          ? 'horenParts'
          : module === 'schreiben'
            ? 'schreibenParts'
            : module === 'sprechen'
              ? 'sprechenParts'
              : 'lesenParts';
      const shell = { [key]: [part] };
      if (module === 'schreiben' && part.task) shell.schreiben = { task: part.task };
      return TU.deriveTargetUsage(shell, words).map((u) => String(u.word));
    }
    const text = collectPartTexts(part, module);
    return wordsUsedInText(text, words);
  }

  function computePersonalExamCoverage(exam, words) {
    const list = (words || exam?.vocabWords || []).map(String);
    const byPart = [];
    const usedSet = new Set();

    for (const part of exam?.lesenParts || []) {
      const used = scanPartWords(part, 'lesen', list);
      used.forEach((w) => usedSet.add(w));
      byPart.push({
        teil: Number(part.teil),
        module: 'lesen',
        used,
        count: used.length,
        fromPool: !!part._fromPool,
      });
    }

    for (const part of exam?.horenParts || []) {
      const used = scanPartWords(part, 'horen', list);
      used.forEach((w) => usedSet.add(w));
      byPart.push({
        teil: Number(part.teil),
        module: 'horen',
        used,
        count: used.length,
        fromPool: !!part._fromPool,
      });
    }

    for (const mod of ['schreiben', 'sprechen']) {
      for (const part of exam?.[`${mod}Parts`] || []) {
        const used = scanPartWords(part, mod, list);
        used.forEach((w) => usedSet.add(w));
        if (part?.task && !part._fromPool) {
          const taskUsed = wordsUsedInText(String(part.task), list);
          taskUsed.forEach((w) => {
            if (!usedSet.has(w)) usedSet.add(w);
            if (!used.includes(w)) used.push(w);
          });
        }
        byPart.push({
          teil: Number(part.teil) || 1,
          module: mod,
          used,
          count: used.length,
          fromPool: !!part._fromPool,
        });
      }
    }

    const wordsUsed = list.filter((w) => usedSet.has(w));
    const missing = list.filter((w) => !usedSet.has(w));
    const overall = {
      found: wordsUsed.length,
      total: list.length,
      words: wordsUsed,
      missing,
      ratio: list.length ? wordsUsed.length / list.length : 0,
    };

    return { byPart, overall };
  }

  function attachPersonalExamCoverage(exam, words) {
    if (!exam) return exam;
    const cov = computePersonalExamCoverage(exam, words);
    exam._coverageByPart = cov.byPart;
    exam._coverageOverall = cov.overall;
    return exam;
  }

  function formatPersonalCoverageSummary(overall, lang) {
    const found = overall?.found ?? 0;
    const total = overall?.total ?? 0;
    const isDE = String(lang || '').toLowerCase() === 'de';
    if (!total) {
      return isDE ? 'Dein personalisiertes Examen' : 'Your personalized exam';
    }
    if (isDE) {
      return `Dein Examen nutzt ${found} deiner ${total} Wörter.`;
    }
    return `Your exam uses ${found} of your ${total} words.`;
  }

  function formatPersonalCoverageMessage(exam, cov, lang) {
    const overall = cov?.overall || exam?._coverageOverall || { found: 0, total: 0, words: [], missing: [] };
    const { found, total, missing = [] } = overall;
    const isDE = String(lang || exam?.lang || '').toLowerCase() === 'de';
    let msg = formatPersonalCoverageSummary(overall, isDE ? 'de' : 'en');
    if (total > 0 && missing.length && found < total) {
      msg += isDE
        ? ` Nicht eingebaut: ${missing.join(', ')}.`
        : ` Not included: ${missing.join(', ')}.`;
    }
    return msg;
  }

  function formatCoverageHeader(overall, lang) {
    const found = overall?.found ?? 0;
    const total = overall?.total ?? 0;
    const isDE = String(lang || '').toLowerCase() === 'de';
    if (isDE) {
      return `${found} von ${total} Wörtern im Examen`;
    }
    return `${found} of ${total} words in your exam`;
  }

  return Object.freeze({
    computePersonalExamCoverage,
    attachPersonalExamCoverage,
    formatPersonalCoverageMessage,
    formatPersonalCoverageSummary,
    formatCoverageHeader,
    scanPartWords,
  });
})();

if (typeof window !== 'undefined') window.PersonalExamCoverage = PersonalExamCoverage;
if (typeof module !== 'undefined') module.exports = PersonalExamCoverage;
