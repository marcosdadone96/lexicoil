/**
 * CefrGate — deterministic CEFR level verification for passages/exams (Phase 3).
 * Metrics: wordCount, coverageVsLevel, avgSentenceLen, subordinatePct, inferencePct.
 * Lemmatization via Lemmatizer — exact lemma match only (no prefix matching).
 */
const CefrGate = (() => {
  const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const COVERAGE_THRESHOLD = 0.85;
  const MIN_VOCAB_FOR_HARD_COVERAGE = 800; // Sprint 0 — recalibrated for open-frequency de inventories

  const INFERENCE_BANDS = {
    A1: { maxInference: 0.1 },
    A2: { maxInference: 0.2 },
    B1: { maxInference: 0.35 },
    B2: { minInference: 0.25, maxInference: 0.55 },
    C1: { minInference: 0.4 },
    C2: { minInference: 0.55 },
  };

  const COMPLEXITY = {
    A1: { minAvg: 4, maxAvg: 10, minSub: 0, maxSub: 8 },
    A2: { minAvg: 6, maxAvg: 14, minSub: 0, maxSub: 12 },
    B1: { minAvg: 10, maxAvg: 22, minSub: 4, maxSub: 45 },
    B2: { minAvg: 14, maxAvg: 28, minSub: 8, maxSub: 45 },
    C1: { minAvg: 18, maxAvg: 35, minSub: 12, maxSub: 55 },
    C2: { minAvg: 20, maxAvg: 42, minSub: 15, maxSub: 65 },
  };

  const SUBORDINATE_MARKERS = {
    de: [
      'weil', 'dass', 'wenn', 'ob', 'obwohl', 'während', 'nachdem', 'bevor', 'damit', 'sodass', 'falls', 'sobald',
    ],
    en: [
      'because', 'that', 'which', 'who', 'whom', 'whose', 'when', 'if', 'although', 'though', 'while', 'since',
      'before', 'after', 'unless', 'until', 'whereas', 'whenever',
    ],
    es: [
      'porque', 'que', 'cuando', 'si', 'aunque', 'mientras', 'después', 'antes', 'para', 'donde', 'como',
      'hasta', 'desde', 'embargo',
    ],
  };

  let CefrVocabLoaderRef = null;
  let LemmatizerRef = null;

  function deps() {
    if (!CefrVocabLoaderRef) {
      try {
        CefrVocabLoaderRef = require('./CefrVocabLoader.js');
      } catch (_) {
        CefrVocabLoaderRef = typeof CefrVocabLoader !== 'undefined' ? CefrVocabLoader : null;
      }
    }
    if (!LemmatizerRef) {
      try {
        LemmatizerRef = require('./lemmatizer.js');
      } catch (_) {
        LemmatizerRef = typeof Lemmatizer !== 'undefined' ? Lemmatizer : null;
      }
    }
    return { CefrVocabLoaderRef, LemmatizerRef };
  }

  function normLang(lang) {
    const l = String(lang || 'en').toLowerCase();
    if (l === 'de' || l.startsWith('de')) return 'de';
    if (l === 'es' || l.startsWith('es')) return 'es';
    return 'en';
  }

  function normLevel(level) {
    const u = String(level || '').toUpperCase();
    return LEVEL_ORDER.includes(u) ? u : null;
  }

  function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function normalizeLemma(token, lang) {
    const { LemmatizerRef } = deps();
    if (LemmatizerRef?.normalizeLemma) return LemmatizerRef.normalizeLemma(token, lang);
    return String(token || '').toLowerCase();
  }

  function splitSentences(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .split(/(?<=[.!?…])\s+|\n+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function wordCount(text) {
    return tokenize(text).length;
  }

  function avgSentenceLength(text) {
    const sentences = splitSentences(text);
    if (!sentences.length) return 0;
    const total = sentences.reduce((n, s) => n + tokenize(s).length, 0);
    return Math.round((total / sentences.length) * 10) / 10;
  }

  function subordinatePct(text, lang) {
    const lg = normLang(lang);
    const markers = SUBORDINATE_MARKERS[lg] || SUBORDINATE_MARKERS.en;
    const sentences = splitSentences(text);
    if (!sentences.length) return 0;
    let sub = 0;
    sentences.forEach((s) => {
      const lower = ` ${s.toLowerCase()} `;
      if (markers.some((m) => lower.includes(` ${m} `))) sub++;
    });
    return Math.round((sub / sentences.length) * 1000) / 10;
  }

  function loadLengthBounds(level) {
    const lv = normLevel(level);
    if (!lv) return { min: 0, max: Infinity };
    try {
      const fs = require('fs');
      const path = require('path');
      const full = path.join(__dirname, '..', '..', '..', 'knowledge', 'cefr', `${lv}.json`);
      const cefr = JSON.parse(fs.readFileSync(full, 'utf8'));
      const rw = cefr.textLength?.readingWords || {};
      return { min: rw.min ?? 0, max: rw.max ?? Infinity };
    } catch (_) {
      const fallback = { A1: 30, A2: 60, B1: 150, B2: 250, C1: 350, C2: 450 };
      return { min: fallback[lv] || 0, max: Infinity };
    }
  }

  function listeningBoundsFromPart(bpPart) {
    const wpt = bpPart?.wordsPerTranscript;
    if (wpt && typeof wpt === 'object') {
      return {
        min: wpt.min != null ? Number(wpt.min) : 0,
        max: wpt.max != null ? Number(wpt.max) : Infinity,
        minExempt: wpt.min == null,
      };
    }
    return { min: 0, max: Infinity, minExempt: true };
  }

  function resolveLengthBounds(opts, level) {
    if (opts.lengthBounds && typeof opts.lengthBounds === 'object') {
      const minExempt = opts.lengthMinExempt === true;
      return {
        min: minExempt ? 0 : (opts.lengthBounds.min ?? 0),
        max: opts.lengthBounds.max ?? Infinity,
      };
    }
    return loadLengthBounds(level);
  }

  function loadCumulativeVocabSync(lang, level) {
    const { CefrVocabLoaderRef } = deps();
    if (!CefrVocabLoaderRef) return new Set();
    return CefrVocabLoaderRef.loadCumulativeVocabSync(lang, level);
  }

  function lemmaInVocab(forms, vocab) {
    return forms.some((f) => vocab.has(String(f).toLowerCase()));
  }

  function coverageMetrics(text, lang, level) {
    const vocab = loadCumulativeVocabSync(lang, level);
    const tokens = tokenize(text);
    if (!tokens.length) {
      return { coverageVsLevel: 100, outOfRangeRareWords: [], vocabSize: vocab.size, tokenCount: 0 };
    }
    const lg = normLang(lang);
    const { LemmatizerRef } = deps();
    const rare = [];
    let inRange = 0;
    tokens.forEach((t) => {
      const forms =
        LemmatizerRef?.lemmaForms ? LemmatizerRef.lemmaForms(t, lg) : [t, normalizeLemma(t, lg)];
      const hit = lemmaInVocab(forms, vocab);
      if (hit) inRange++;
      else {
        const lemma = normalizeLemma(t, lg);
        if (lemma.length > 2 && !rare.includes(lemma)) rare.push(lemma);
      }
    });
    const coverageVsLevel = Math.round((inRange / tokens.length) * 1000) / 10;
    return {
      coverageVsLevel,
      outOfRangeRareWords: rare.slice(0, 30),
      vocabSize: vocab.size,
      tokenCount: tokens.length,
    };
  }

  function loadBlueprintForExam(exam, opts = {}) {
    if (opts.blueprint && typeof opts.blueprint === 'object') return opts.blueprint;
    try {
      const resolver = require('./blueprintResolver.js');
      return resolver.loadBlueprintSync?.(exam) || null;
    } catch (_) {
      return null;
    }
  }

  function blueprintPart(blueprint, moduleId, teil) {
    const mod = blueprint?.modules?.find((m) => m.id === moduleId);
    if (!mod?.parts?.length) return null;
    const n = Number(teil);
    return mod.parts.find((p) => p.teil === n) || mod.parts[n - 1] || null;
  }

  function partReadingText(part) {
    if (!part || typeof part !== 'object') return '';
    const chunks = [];
    pushText(chunks, part.text);
    pushText(chunks, part.passage);
    (part.passages || []).forEach((p) => pushText(chunks, typeof p === 'string' ? p : p?.text));
    (part.ads || []).forEach((ad) => pushText(chunks, typeof ad === 'string' ? ad : ad?.text));
    (part.opinions || []).forEach((op) => pushText(chunks, typeof op === 'string' ? op : op?.text));
    (part.items || []).forEach((it) => {
      pushText(chunks, it.signText);
      pushText(chunks, it.text);
    });
    return chunks.join(' ').trim();
  }

  function extractReadingPassageChecks(exam, blueprint) {
    const checks = [];
    const pairs = [
      ['lesenParts', 'lesen'],
      ['readingParts', 'reading'],
    ];
    pairs.forEach(([examKey, moduleId]) => {
      (exam[examKey] || []).forEach((part) => {
        const text = partReadingText(part);
        if (!text) return;
        const bpPart = blueprint ? blueprintPart(blueprint, moduleId, part.teil) : null;
        // Ads-matching parts (Lesen Teil 3) are lists of classified ads, not prose
        // passages — short telegram-style sentences with many proper nouns. Prose
        // complexity/coverage thresholds don't apply; validate length only.
        const proseExempt =
          bpPart?.slotType === 'ads_matching' ||
          bpPart?.taskFormat === 'matching_ads' ||
          bpPart?.proseExempt === true;
        checks.push({
          text,
          passageLengthExempt: bpPart?.passageLengthExempt === true,
          lengthOnly: proseExempt,
          source: `${examKey}:teil=${part.teil ?? '?'}`,
        });
      });
    });
    return checks;
  }

  function extractListeningPassageChecks(exam, blueprint) {
    const checks = [];
    const pairs = [
      ['horenParts', 'horen'],
      ['listeningParts', 'listening'],
    ];
    pairs.forEach(([examKey, moduleId]) => {
      (exam[examKey] || []).forEach((part) => {
        const bpPart = blueprint ? blueprintPart(blueprint, moduleId, part.teil) : null;
        const bounds = listeningBoundsFromPart(bpPart);
        const lengthBounds = {
          min: bounds.minExempt ? 0 : bounds.min,
          max: bounds.max,
        };
        const pushCheck = (text, source) => {
          if (!text) return;
          checks.push({
            text,
            lengthBounds,
            lengthMinExempt: bounds.minExempt,
            source,
          });
        };
        if (part.segments?.length) {
          part.segments.forEach((seg, i) => {
            pushCheck(seg.transcript, `${examKey}:teil=${part.teil ?? '?'}:seg=${i}`);
          });
        } else {
          pushCheck(part.transcript, `${examKey}:teil=${part.teil ?? '?'}`);
        }
      });
    });
    return checks;
  }

  function extractNonReadingExamTexts(exam) {
    const chunks = [];
    const partKeys = ['schreibenParts', 'writingParts', 'sprechenParts', 'speakingParts'];
    partKeys.forEach((key) => {
      (exam[key] || []).forEach((part) => {
        pushText(chunks, part.text);
        pushText(chunks, part.passage);
        pushText(chunks, part.prompt);
      });
    });
    return [...new Set(chunks)];
  }

  /**
   * @param {string} text passage text
   * @param {{ level: string, lang?: string, passageLengthExempt?: boolean, lengthBounds?: {min?:number,max?:number}, lengthMinExempt?: boolean }} opts
   */
  function validatePassage(text, opts = {}) {
    const level = normLevel(opts.level);
    const lang = normLang(opts.lang || opts.language);
    const reasons = [];
    const wc = wordCount(text);
    const { min, max } = resolveLengthBounds(opts, level);
    const lengthExempt = opts.passageLengthExempt === true;
    const minApplies = !lengthExempt && !opts.lengthMinExempt && min > 0;

    const lengthOK = (!minApplies || wc >= min) && wc <= max;
    if (minApplies && wc < min) reasons.push(`length_below_min:wordCount=${wc},min=${min}`);
    if (wc > max) reasons.push(`length_above_max:wordCount=${wc},max=${max}`);

    if (opts.lengthOnly) {
      return {
        withinRange: lengthOK,
        metrics: { wordCount: wc, lengthBounds: { min, max } },
        reasons,
      };
    }

    const avgLen = avgSentenceLength(text);
    const subPct = subordinatePct(text, lang);
    const cov = coverageMetrics(text, lang, level);
    const cx = COMPLEXITY[level] || COMPLEXITY.B1;
    let coverageOK = true;
    if (cov.vocabSize >= MIN_VOCAB_FOR_HARD_COVERAGE) {
      coverageOK = cov.coverageVsLevel >= COVERAGE_THRESHOLD * 100;
      if (!coverageOK) {
        reasons.push(
          `coverage_below_threshold:coverage=${cov.coverageVsLevel}%,min=${COVERAGE_THRESHOLD * 100}%,rare=${cov.outOfRangeRareWords.slice(0, 5).join('|')}`,
        );
      }
    } else {
      reasons.push(`coverage_skipped:partial_vocab_list,size=${cov.vocabSize}`);
      coverageOK = true;
    }

    const complexityOK = avgLen >= cx.minAvg && avgLen <= cx.maxAvg && subPct >= cx.minSub && subPct <= cx.maxSub;
    if (avgLen < cx.minAvg) reasons.push(`complexity_too_simple:avgSentenceLen=${avgLen},min=${cx.minAvg}`);
    if (avgLen > cx.maxAvg) reasons.push(`complexity_too_complex:avgSentenceLen=${avgLen},max=${cx.maxAvg}`);
    if (subPct < cx.minSub) reasons.push(`subordinate_too_few:subordinatePct=${subPct},min=${cx.minSub}`);
    if (subPct > cx.maxSub) reasons.push(`subordinate_too_many:subordinatePct=${subPct},max=${cx.maxSub}`);

    const withinRange = lengthOK && coverageOK && complexityOK;

    return {
      withinRange,
      metrics: {
        wordCount: wc,
        avgSentenceLen: avgLen,
        subordinatePct: subPct,
        coverageVsLevel: cov.coverageVsLevel,
        outOfRangeRareWords: cov.outOfRangeRareWords,
        vocabListSize: cov.vocabSize,
        lengthBounds: { min, max },
      },
      reasons,
    };
  }

  function pushText(chunks, t) {
    if (t != null && typeof t === 'string' && t.trim()) chunks.push(t.trim());
  }

  function extractAllExamTexts(exam) {
    if (!exam || typeof exam !== 'object') return [];
    const chunks = [];
    const partKeys = [
      'lesenParts',
      'readingParts',
      'horenParts',
      'listeningParts',
      'schreibenParts',
      'writingParts',
      'sprechenParts',
      'speakingParts',
      'grammatikParts',
      'useOfEnglishParts',
    ];
    partKeys.forEach((key) => {
      (exam[key] || []).forEach((part) => {
        pushText(chunks, part.text);
        pushText(chunks, part.passage);
        pushText(chunks, part.prompt);
        pushText(chunks, part.transcript);
        (part.segments || []).forEach((seg) => {
          pushText(chunks, seg.transcript);
        });
      });
    });
    pushText(chunks, exam.lesen?.text);
    pushText(chunks, exam.reading?.text);
    return [...new Set(chunks)];
  }

  function extractLongestReadingText(exam) {
    const texts = extractAllExamTexts(exam);
    if (!texts.length) return '';
    return texts.reduce((a, b) => (wordCount(a) >= wordCount(b) ? a : b), '');
  }

  function collectExamQuestions(exam) {
    const out = [];
    const partKeys = [
      'lesenParts',
      'readingParts',
      'horenParts',
      'listeningParts',
      'schreibenParts',
      'writingParts',
      'sprechenParts',
      'speakingParts',
      'grammatikParts',
      'useOfEnglishParts',
    ];
    partKeys.forEach((key) => {
      (exam[key] || []).forEach((part) => {
        (part.questions || []).forEach((q) => out.push(q));
        (part.items || []).forEach((it) => {
          if (it.inferenceLevel || it.type) out.push(it);
        });
      });
    });
    return out;
  }

  function validateInference(exam, opts = {}) {
    const level = normLevel(opts.level || exam?.level);
    const band = INFERENCE_BANDS[level];
    const questions = collectExamQuestions(exam);
    const reasons = [];
    if (!band || !questions.length) {
      return { withinRange: true, inferencePct: 0, reasons, metrics: { inferencePct: 0, questionCount: questions.length } };
    }

    let inferenceCount = 0;
    questions.forEach((q) => {
      const il = q.inferenceLevel || q.inference;
      if (il === 'inference' || il === 'global') inferenceCount++;
    });
    const inferencePct = questions.length ? Math.round((inferenceCount / questions.length) * 1000) / 10 : 0;
    let withinRange = true;

    if (band.maxInference != null && inferencePct / 100 > band.maxInference) {
      withinRange = false;
      reasons.push(`inference_above_max:inferencePct=${inferencePct},max=${band.maxInference * 100}%`);
    }
    if (band.minInference != null && inferencePct / 100 < band.minInference) {
      withinRange = false;
      reasons.push(`inference_below_min:inferencePct=${inferencePct},min=${band.minInference * 100}%`);
    }

    return {
      withinRange,
      inferencePct,
      reasons,
      metrics: { inferencePct, questionCount: questions.length, inferenceCount },
    };
  }

  function pickWorstPassageResult(results) {
    if (!results.length) {
      return {
        withinRange: false,
        metrics: { wordCount: 0, coverageVsLevel: 0, avgSentenceLen: 0, subordinatePct: 0, outOfRangeRareWords: [] },
        reasons: ['passage_text_missing'],
      };
    }
    return results.reduce((worst, cur) => {
      if (!cur.withinRange && worst.withinRange) return cur;
      if (cur.withinRange && !worst.withinRange) return worst;
      if (cur.metrics.coverageVsLevel < worst.metrics.coverageVsLevel) return cur;
      if (cur.metrics.wordCount < worst.metrics.wordCount) return cur;
      return worst;
    });
  }

  function validateExam(exam, opts = {}) {
    const level = normLevel(opts.level || exam?.level);
    const lang = normLang(opts.lang || exam?.lang);
    const blueprint = loadBlueprintForExam(exam, opts);
    const readingChecks = extractReadingPassageChecks(exam, blueprint);
    const listeningChecks = extractListeningPassageChecks(exam, blueprint);
    const otherTexts = opts.text ? [opts.text] : extractNonReadingExamTexts(exam);
    const passageResults = [
      ...readingChecks.map((check) =>
        validatePassage(check.text, {
          level,
          lang,
          passageLengthExempt: check.passageLengthExempt,
          lengthOnly: check.lengthOnly,
        }),
      ),
      ...listeningChecks.map((check) =>
        validatePassage(check.text, {
          level,
          lang,
          lengthBounds: check.lengthBounds,
          lengthMinExempt: check.lengthMinExempt,
          lengthOnly: true,
        }),
      ),
      ...otherTexts.map((t) => validatePassage(t, { level, lang })),
    ];

    if (!passageResults.length) {
      return {
        withinRange: false,
        metrics: {
          wordCount: 0,
          coverageVsLevel: 0,
          avgSentenceLen: 0,
          subordinatePct: 0,
          outOfRangeRareWords: [],
          inferencePct: 0,
        },
        reasons: ['passage_text_missing'],
      };
    }

    const passage = pickWorstPassageResult(passageResults);
    const inference = validateInference(exam, { level, lang });
    const withinRange = passage.withinRange && inference.withinRange;
    const reasons = [...passage.reasons, ...inference.reasons];

    return {
      withinRange,
      metrics: {
        ...passage.metrics,
        inferencePct: inference.inferencePct,
        textsMeasured: passageResults.length,
        questionCount: inference.metrics.questionCount,
      },
      reasons,
      passageResults,
      inference,
    };
  }

  return Object.freeze({
    validatePassage,
    validateExam,
    validateInference,
    extractAllExamTexts,
    extractLongestReadingText,
    normalizeLemma,
    tokenize,
    wordCount,
    COVERAGE_THRESHOLD,
    MIN_VOCAB_FOR_HARD_COVERAGE,
    INFERENCE_BANDS,
    COMPLEXITY,
  });
})();

if (typeof window !== 'undefined') window.CefrGate = CefrGate;
if (typeof module !== 'undefined') module.exports = CefrGate;
