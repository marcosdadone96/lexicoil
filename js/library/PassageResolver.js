/**
 * Passage resolution for question banks — single source for ExamBuilder + ExamBlueprint.
 * Resolves passageId from question fields, context, or sibling inference; never invents text.
 */
const PassageResolver = (() => {
  function passageIdFromQuestion(q) {
    if (!q || typeof q !== 'object') return null;
    return q.passageId || q.context?.passageId || null;
  }

  function getPassageFromBank(bank, passageId) {
    if (!passageId || !bank) return null;
    return (bank.passages || []).find((p) => p.id === passageId) || null;
  }

  function inlinePassageFromQuestion(q) {
    const ctx = q?.context;
    if (!ctx?.passageText) return null;
    return {
      id: ctx.passageId || `_inline_${q.id}`,
      module: ctx.passageModule || q.module,
      title: ctx.passageTitle || '',
      text: ctx.passageText,
      translations: ctx.passageTranslations || undefined,
    };
  }

  function resolvePassageForQuestion(bank, q) {
    const pid = passageIdFromQuestion(q);
    if (pid) {
      const fromBank = getPassageFromBank(bank, pid);
      if (fromBank) return fromBank;
    }
    return inlinePassageFromQuestion(q);
  }

  function resolvePassageForQuestions(bank, questions) {
    if (!questions?.length) return null;
    for (const q of questions) {
      const p = resolvePassageForQuestion(bank, q);
      if (p?.text?.trim()) return p;
    }
    return null;
  }

  function groupKey(q) {
    return `${String(q.module || '').toLowerCase()}:${q.teil ?? q.part ?? ''}`;
  }

  /** Fill missing passageId from siblings in the same module+teil (no text invention). */
  function enrichQuestionPassageIds(questions) {
    if (!questions?.length) return questions;
    const pidByGroup = new Map();
    questions.forEach((q) => {
      const pid = passageIdFromQuestion(q);
      if (pid) pidByGroup.set(groupKey(q), pid);
    });
    return questions.map((q) => {
      if (passageIdFromQuestion(q)) return q;
      const inferred = pidByGroup.get(groupKey(q));
      if (!inferred) return q;
      return { ...q, passageId: inferred };
    });
  }

  function wordCount(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function longestReadingWords(exam) {
    let max = 0;
    const bump = (t) => {
      max = Math.max(max, wordCount(t));
    };
    (exam.lesenParts || exam.readingParts || []).forEach((part) => {
      bump(part.text);
      bump(part.passage);
      (part.passages || []).forEach((p) => bump(typeof p === 'string' ? p : p?.text));
      (part.items || []).forEach((it) => {
        bump(it.signText);
        bump(it.text);
      });
    });
    if (exam.lesen?.text) bump(exam.lesen.text);
    if (exam.reading?.text) bump(exam.reading.text);
    return max;
  }

  function partHasReadingText(part) {
    if (!part) return false;
    if (part.text?.trim() || part.passage?.trim()) return true;
    if ((part.items || []).some((it) => (it.signText || it.text || '').trim())) return true;
    return false;
  }

  function partHasListeningTranscript(part) {
    if (!part) return false;
    if (part.transcript?.trim() || part.audioScript?.trim()) return true;
    return (part.segments || []).some((s) => (s.transcript || '').trim());
  }

  return Object.freeze({
    passageIdFromQuestion,
    getPassageFromBank,
    resolvePassageForQuestion,
    resolvePassageForQuestions,
    enrichQuestionPassageIds,
    wordCount,
    longestReadingWords,
    partHasReadingText,
    partHasListeningTranscript,
  });
})();

if (typeof window !== 'undefined') window.PassageResolver = PassageResolver;
if (typeof module !== 'undefined') module.exports = PassageResolver;
