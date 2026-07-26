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

  /**
   * @param {object} q
   * @param {object|null} bank
   * @param {string} level
   * @param {string} lang
   * @param {{ forceRecompute?: boolean, passageText?: string }} [opts]
   *   forceRecompute — skip persisted-difficulty short-circuit (pool Lesen/Hören path).
   *   passageText — explicit passage/transcript when no library bank/PassageResolver.
   */
  function scoreQuestion(q, bank, level, lang, opts = {}) {
    if (!q) return LEVEL_MID[level] || 5;
    const forceRecompute = opts.forceRecompute === true;
    const stem = q.question || q.signText || q.statement || '';
    let text = stem;
    if (opts.passageText != null && String(opts.passageText).trim()) {
      text = `${String(opts.passageText).trim()} ${stem}`.trim();
    } else if (typeof PassageResolver !== 'undefined' && bank) {
      const p = PassageResolver.resolvePassageForQuestion(bank, q);
      if (p?.text) text = `${p.text} ${stem}`.trim();
    }
    if (q.inferenceLevel === 'inference' || q.inferenceLevel === 'global') {
      const base = scoreText(text, level, lang);
      return clamp(base + 1, 1, 10);
    }
    if (
      !forceRecompute &&
      q.difficulty != null &&
      q.difficulty >= 1 &&
      q.difficulty <= 10
    ) {
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

  function applyToQuestions(questions, bank, level, lang, opts = {}) {
    return (questions || []).map((q) => ({
      ...q,
      difficulty: scoreQuestion(q, bank, level, lang, opts),
      cefrMetrics: q.cefrMetrics || undefined,
    }));
  }

  function passageTextForPoolQuestion(part, q) {
    if (!part) return '';
    if (Array.isArray(part.segments) && part.segments.length) {
      const qid = q?.id != null ? String(q.id) : null;
      const pid = q?.passageId != null ? String(q.passageId) : null;
      const hit =
        part.segments.find(
          (s) =>
            (qid && (s.questions || []).some((sq) => String(sq?.id) === qid)) ||
            (pid && s.passageId != null && String(s.passageId) === pid),
        ) || null;
      if (hit?.transcript) return String(hit.transcript);
      return part.segments
        .map((s) => s.transcript || '')
        .filter(Boolean)
        .join('\n');
    }
    if (Array.isArray(part.passages) && part.passages.length && q?.passageId != null) {
      const p = part.passages.find(
        (x) => String(x.passageId || x.id) === String(q.passageId),
      );
      if (p?.text) return String(p.text);
    }
    if (part.text && String(part.text).trim()) return String(part.text);
    if (Array.isArray(part.ads) && part.ads.length) {
      return part.ads
        .map((a) => `${a.title || ''} ${a.text || ''}`.trim())
        .filter(Boolean)
        .join('\n');
    }
    return '';
  }

  /**
   * Pool Lesen/Hören only: recompute difficulty on assembled part questions/items
   * using passage/transcript + stem. Does not touch Schreiben/Sprechen converters.
   */
  function applyRuntimeDifficultyToPoolPart(part, opts = {}) {
    if (!part || typeof part !== 'object') return part;
    const lang = opts.lang || 'de';
    const level = opts.level || 'B1';

    const scoreOne = (q, passageText) => {
      if (!q || typeof q !== 'object') return;
      q.difficulty = scoreQuestion(q, null, level, lang, {
        forceRecompute: true,
        passageText: passageText || '',
      });
    };

    if (Array.isArray(part.segments)) {
      for (const seg of part.segments) {
        const pt = seg?.transcript || '';
        for (const q of seg.questions || []) scoreOne(q, pt);
      }
    }
    for (const q of part.questions || []) {
      scoreOne(q, passageTextForPoolQuestion(part, q));
    }
    for (const it of part.items || []) {
      scoreOne(it, passageTextForPoolQuestion(part, it));
    }
    return part;
  }

  return Object.freeze({
    scoreMetrics,
    scoreText,
    scoreQuestion,
    deriveExamDifficulty,
    applyToQuestions,
    applyRuntimeDifficultyToPoolPart,
    passageTextForPoolQuestion,
    LEVEL_MID,
  });
})();

if (typeof window !== 'undefined') window.DifficultyScorer = DifficultyScorer;
if (typeof module !== 'undefined') module.exports = DifficultyScorer;
