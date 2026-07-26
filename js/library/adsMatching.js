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

  /**
   * Cambridge multiple-matching (B1 Reading Part 2): 5 people matched against 8 short
   * texts A–H. Structurally the same "one block of lettered texts + key answers" shape
   * as Goethe Lesen Teil 3, so it reuses this builder — but it is Part 2, not 3, and its
   * option keys run to H, not F.
   */
  function isCambridgeMatchingSpec(partSpec) {
    if (!partSpec) return false;
    return (
      partSpec.slotType === 'person_text_matching' || partSpec.taskFormat === 'multiple_matching'
    );
  }

  function isAdsMatchingSpec(partSpec) {
    if (!partSpec) return false;
    if (partSpec.slotType === 'ads_matching' || partSpec.taskFormat === 'matching_ads') return true;
    if (isCambridgeMatchingSpec(partSpec)) return true;
    if (partSpec.teil === 3 && (partSpec.questionTypes || []).includes('matching')) return true;
    return false;
  }

  function normalizeMatchingCorrect(raw) {
    const s = String(raw ?? '').trim().toUpperCase();
    if (!s || s === 'NICHTS' || s === 'NONE' || s === 'KEINE' || s === 'X') return '0';
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

  function optionsAreBareKeys(options) {
    return (
      Array.isArray(options) &&
      options.length >= 3 &&
      options.every((o) => /^[a-j0x]$/i.test(String(o).trim()))
    );
  }

  /**
   * Options that are labels carrying no text of their own — e.g. "a) A", "b) B".
   * They look like ads lines to parseAdOptionLine but parse to a one-letter body, so the
   * ads must be rebuilt from the passage bank instead (same as bare keys).
   */
  function optionsAreKeyOnly(options) {
    return (
      Array.isArray(options) &&
      options.length >= 3 &&
      options.every((o) => /^[a-j0x]\)\s*[a-j0x]?$/i.test(String(o).trim()))
    );
  }

  /**
   * Map a question id to the passage-id prefix holding its lettered texts, plus the key
   * range that prefix uses. Goethe Lesen T4 ids read "…-l-t4-<slug>-qN" (keys A–F);
   * Cambridge Reading P2 ids read "…-r-t2-<slug>-qN" and store texts under
   * "…-lesen-t2-<slug>-<KEY>" (keys A–H).
   */
  function passageSetForQuestionId(id) {
    const t4 = id.match(/-l-t4-(.+?)-q\d+$/i);
    if (t4) return { prefix: `lesen-t4-${t4[1]}`, keyRe: /-([a-f])$/i };
    const t2 = id.match(/-r-t2-(.+?)-q\d+$/i);
    if (t2) return { prefix: `lesen-t2-${t2[1]}`, keyRe: /-([a-h])$/i };
    return null;
  }

  /**
   * Some matching sets store every lettered text inside ONE passage, as lines shaped
   * "A) Title: text" (…-02-01 style), instead of one passage per key (…-04-A … -04-H).
   * Split that block so both storage shapes yield the same ads array.
   */
  function buildAdsFromBlockText(text) {
    const ads = [];
    let cur = null;
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = line.match(/^\s*([a-jA-J])\)\s+(.+)$/);
      if (m) {
        if (cur) ads.push(cur);
        cur = parseAdOptionLine(`${m[1]}) ${m[2]}`);
      } else if (cur && line.trim()) {
        // continuation of the previous entry
        cur.text += ` ${line.trim()}`;
      }
    }
    if (cur) ads.push(cur);
    return ads.sort((a, b) => AD_KEY_ORDER.indexOf(a.key) - AD_KEY_ORDER.indexOf(b.key));
  }

  function buildAdsFromPassages(bank, questions) {
    const id = String(questions?.[0]?.id || '');
    // gen-q-4-* items (generated by make-t4) carry inline signText — there are no matching
    // bank passages for them, so return early rather than silently returning [].
    if (/^gen-q-4-/i.test(id)) return [];
    const set = passageSetForQuestionId(id);
    if (!set) return [];
    const passages = (bank?.passages || []).filter((p) => String(p.id || '').includes(set.prefix));
    const keyed = passages
      .map((p) => {
        const keyMatch = String(p.id).match(set.keyRe);
        const key = keyMatch ? keyMatch[1].toUpperCase() : '';
        if (!key) return null;
        return { key, title: p.title || '', text: p.text || '' };
      })
      .filter(Boolean)
      .sort((a, b) => AD_KEY_ORDER.indexOf(a.key) - AD_KEY_ORDER.indexOf(b.key));
    if (keyed.length) return keyed;
    // No per-key passages: the set may keep all texts in a single block passage.
    for (const p of passages) {
      const block = buildAdsFromBlockText(p.text);
      if (block.length >= 3) return block;
    }
    return [];
  }

  function buildAdsMatchingLesenPart(partSpec, questions, toExamQuestion, bank) {
    const cambridge = isCambridgeMatchingSpec(partSpec);
    const opts = questions?.[0]?.options;
    // Options that carry no text of their own ("a", or "a) A") mean the lettered texts
    // live in the passage bank and must be pulled from there.
    const textlessOptions = optionsAreBareKeys(opts) || optionsAreKeyOnly(opts);
    let ads =
      textlessOptions && bank
        ? buildAdsFromPassages(bank, questions)
        : buildAdsFromBankQuestions(questions);
    // Cambridge only: if the bank lookup found nothing, fall back to whatever the options
    // carry rather than rendering an empty A–H block. The Goethe path keeps its original
    // strict behaviour (empty ads → coverage fails loudly upstream).
    if (!ads.length && cambridge) ads = buildAdsFromBankQuestions(questions);
    const adKeys = ads.map((a) => a.key);
    const choiceKeys = [...adKeys];
    // Goethe T3 offers a "nichts/0" escape option; Cambridge P2 is strictly A–H.
    if (!cambridge && !choiceKeys.includes('0')) choiceKeys.push('0');

    return {
      teil: partSpec?.teil ?? 3,
      instruction: partSpec?.instruction || partSpec?.label || '',
      blueprintSlot: partSpec?.slotType || 'ads_matching',
      example: (() => {
        if (cambridge) return undefined;
        if (typeof require !== 'undefined') {
          try {
            const { GOETHE_B1_LESEN_T3_EXAMPLE } = require('./goetheB1Constants.js');
            return { ...GOETHE_B1_LESEN_T3_EXAMPLE };
          } catch (_) {
            /* optional */
          }
        }
        return undefined;
      })(),
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
    isCambridgeMatchingSpec,
    normalizeMatchingCorrect,
    optionsLookLikeAds,
    optionsAreBareKeys,
    optionsAreKeyOnly,
    passageSetForQuestionId,
    buildAdsFromPassages,
    buildAdsFromBlockText,
    isLesenT3MatchingQuestion,
    checkLesenT3AdsConformance,
    buildAdsMatchingLesenPart,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.AdsMatching = AdsMatching;
if (typeof window !== 'undefined') window.AdsMatching = AdsMatching;
if (typeof module !== 'undefined') module.exports = AdsMatching;
