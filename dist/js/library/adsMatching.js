/**
 * Lesen Teil 3 (ads_matching) — parse bank options into ads + key-based questions.
 */
const AdsMatching = (() => {
  const AD_KEY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  function parseAdOptionLine(opt) {
    const s = String(opt || '').trim();
    const m = s.match(/^([a-jA-J0])\)\s*(.*)$/s);
    if (!m) return null;
    const key = m[1].toUpperCase();
    if (key === '0') return null;
    const body = m[2].trim();
    let title = '';
    let text = body;
    const emDash = body.indexOf(' — ');
    const enDash = body.indexOf(' - ');
    if (emDash > 0 && emDash < 80) {
      title = body.slice(0, emDash).trim();
      text = body.slice(emDash + 3).trim() || body;
    } else if (enDash > 0 && enDash < 80) {
      title = body.slice(0, enDash).trim();
      text = body.slice(enDash + 3).trim() || body;
    } else {
      const colon = body.indexOf(': ');
      if (colon > 0 && colon < 60) {
        title = body.slice(0, colon).trim();
        text = body.slice(colon + 2).trim() || body;
      }
    }
    return { key, title, text };
  }

  function buildAdsFromBankQuestions(questions) {
    let bestOpts = [];
    for (const q of questions || []) {
      const opts = q.options || [];
      if (!opts.length) continue;
      const avg = opts.reduce((s, o) => s + String(o).length, 0) / opts.length;
      const bestAvg = bestOpts.length
        ? bestOpts.reduce((s, o) => s + String(o).length, 0) / bestOpts.length
        : 0;
      if (opts.length > bestOpts.length || (opts.length === bestOpts.length && avg > bestAvg)) {
        bestOpts = opts;
      }
    }

    const byKey = new Map();
    for (const opt of bestOpts) {
      const parsed = parseAdOptionLine(opt);
      if (!parsed) continue;
      const prev = byKey.get(parsed.key);
      if (!prev || parsed.text.length > prev.text.length) byKey.set(parsed.key, parsed);
    }
    const ads = [...byKey.values()];
    ads.sort((a, b) => {
      const ia = AD_KEY_ORDER.indexOf(a.key);
      const ib = AD_KEY_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return ads;
  }

  function isAdsMatchingSpec(partSpec) {
    if (!partSpec) return false;
    if (partSpec.slotType === 'ads_matching' || partSpec.taskFormat === 'matching_ads') return true;
    if (partSpec.teil === 3 && (partSpec.questionTypes || []).includes('matching')) return true;
    return false;
  }

  function normalizeMatchingCorrect(raw) {
    const s = String(raw ?? '').trim().toUpperCase();
    if (!s || s === 'NICHTS' || s === 'NONE' || s === 'KEINE') return '0';
    if (s.length === 1 && /[A-J0]/.test(s)) return s;
    const m = s.match(/^([A-J0])/);
    return m ? m[1] : s;
  }

  /** Heuristic: options look like real classified ads (a) …), not abstract noun labels. */
  function isGenericNounLabel(opt) {
    const body = String(opt || '')
      .trim()
      .replace(/^[a-jA-J0]\)\s*/i, '');
    return /^(Ein|Eine|Der|Die|Das)\s+\w+/i.test(body);
  }

  function optionsLookLikeAds(options) {
    if (!Array.isArray(options) || !options.length) return false;
    let adLike = 0;
    for (const opt of options) {
      const s = String(opt).trim();
      if (isGenericNounLabel(opt)) return false;
      if (/^[a-jA-J0]\)\s+.{15,}/.test(s)) adLike++;
    }
    return adLike >= Math.min(3, options.length);
  }

  function isLesenT3MatchingQuestion(q) {
    const mod = String(q?.module || '').toLowerCase();
    const teil = typeof q?.teil === 'string' ? Number(q.teil) : q?.teil;
    const type = String(q?.type || q?.questionType || '').toLowerCase();
    return mod === 'lesen' && teil === 3 && (type === 'matching' || type === 'match');
  }

  function checkLesenT3AdsConformance(q) {
    const reasons = [];
    if (!isLesenT3MatchingQuestion(q)) return { ok: true, reasons };
    const opts = q.options || q.matchLabels || [];
    if (!opts.length) {
      reasons.push('matching_missing_options');
      return { ok: false, reasons };
    }
    if (!optionsLookLikeAds(opts)) {
      reasons.push('options_not_ads_format');
      if (opts.some((o) => isGenericNounLabel(o))) reasons.push('generic_noun_labels');
    }
    return { ok: reasons.length === 0, reasons };
  }

  function buildAdsMatchingLesenPart(partSpec, questions, toExamQuestion) {
    const ads = buildAdsFromBankQuestions(questions);
    const adKeys = ads.map((a) => a.key);
    const choiceKeys = [...adKeys];
    if (!choiceKeys.includes('0')) choiceKeys.push('0');

    return {
      teil: partSpec?.teil ?? 3,
      instruction: partSpec?.instruction || partSpec?.label || '',
      blueprintSlot: partSpec?.slotType || 'ads_matching',
      ads,
      questions: (questions || []).map((q, i) => {
        const eq = toExamQuestion(q, i);
        return {
          ...eq,
          type: 'matching',
          options: choiceKeys,
          correct: normalizeMatchingCorrect(eq.correct ?? eq.correctAnswer),
        };
      }),
    };
  }

  return {
    AD_KEY_ORDER,
    parseAdOptionLine,
    buildAdsFromBankQuestions,
    isAdsMatchingSpec,
    normalizeMatchingCorrect,
    optionsLookLikeAds,
    isLesenT3MatchingQuestion,
    checkLesenT3AdsConformance,
    buildAdsMatchingLesenPart,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.AdsMatching = AdsMatching;
if (typeof window !== 'undefined') window.AdsMatching = AdsMatching;
if (typeof module !== 'undefined') module.exports = AdsMatching;
