/**
 * Derives difficulty 1–10 from CefrGate metrics (Phase 3).
 */
const DifficultyScorer = (() => {
  let CefrGateRef = null;
  let LemmatizerRef = null;

  function deps() {
    if (!CefrGateRef) {
      try {
        CefrGateRef = require('./CefrGate.js');
      } catch (_) {
        CefrGateRef = typeof CefrGate !== 'undefined' ? CefrGate : null;
      }
    }
    if (!LemmatizerRef) {
      try {
        LemmatizerRef = require('./lemmatizer.js');
      } catch (_) {
        LemmatizerRef = typeof Lemmatizer !== 'undefined' ? Lemmatizer : null;
      }
    }
    return { CefrGateRef, LemmatizerRef };
  }

  const LEVEL_MID = { A1: 2, A2: 3, B1: 4, B2: 6, C1: 8, C2: 9 };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function scoreMetrics(metrics, level) {
    const mid = LEVEL_MID[String(level || 'B1').toUpperCase()] || 5;
    const avg = metrics.avgSentenceLen || 0;
    const cov = metrics.coverageVsLevel ?? 100;
    const sub = metrics.subordinatePct || 0;
    const wc = metrics.wordCount || 0;

    let score = mid;
    if (avg > 0) score += (avg - mid * 3) / 6;
    if (cov < 85) score += (85 - cov) / 20;
    if (sub > 20) score += (sub - 20) / 15;
    if (wc > 300) score += (wc - 300) / 200;

    return clamp(Math.round(score), 1, 10);
  }

  function scoreText(text, level, lang) {
    const { CefrGateRef } = deps();
    if (!CefrGateRef || !text?.trim()) return LEVEL_MID[level] || 5;
    const r = CefrGateRef.validatePassage(text, { level, lang });
    return scoreMetrics(r.metrics, level);
  }

  function scoreQuestion(q, bank, level, lang) {
    const { CefrGateRef } = deps();
    if (!q) return LEVEL_MID[level] || 5;
    let text = q.question || '';
    if (typeof PassageResolver !== 'undefined' && bank) {
      const p = PassageResolver.resolvePassageForQuestion(bank, q);
      if (p?.text) text = `${p.text} ${text}`;
    }
    if (q.inferenceLevel === 'inference' || q.inferenceLevel === 'global') {
      const base = scoreText(text, level, lang);
      return clamp(base + 1, 1, 10);
    }
    if (q.difficulty != null && q.difficulty >= 1 && q.difficulty <= 10) {
      return q.difficulty;
    }
    return scoreText(text, level, lang);
  }

  function deriveExamDifficulty(exam, lang, level) {
    const lv = level || exam?.level || 'B1';
    const lg = lang || exam?.lang || 'de';
    const { CefrGateRef } = deps();
    if (CefrGateRef?.validateExam) {
      const gate = CefrGateRef.validateExam(exam, { level: lv, lang: lg });
      if (gate.metrics) return scoreMetrics(gate.metrics, lv);
    }
    return LEVEL_MID[lv] || 5;
  }

  function applyToQuestions(questions, bank, level, lang) {
    return (questions || []).map((q) => ({
      ...q,
      difficulty: scoreQuestion(q, bank, level, lang),
      cefrMetrics: q.cefrMetrics || undefined,
    }));
  }

  return Object.freeze({
    scoreMetrics,
    scoreText,
    scoreQuestion,
    deriveExamDifficulty,
    applyToQuestions,
    LEVEL_MID,
  });
})();

if (typeof window !== 'undefined') window.DifficultyScorer = DifficultyScorer;
if (typeof module !== 'undefined') module.exports = DifficultyScorer;
