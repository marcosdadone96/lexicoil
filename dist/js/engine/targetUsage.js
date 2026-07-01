/**
 * Personal exam target-word usage — derive, verify, and highlight surfaces.
 */
const TargetUsage = (() => {
  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function pushText(parts, value) {
    if (value != null && typeof value === 'string' && value.trim()) parts.push(value);
  }

  function collectExamTexts(exam) {
    const parts = [];
    if (!exam || typeof exam !== 'object') return '';

    const walkQ = (q) => {
      if (!q || typeof q !== 'object') return;
      pushText(parts, q.question);
      pushText(parts, q.text);
      pushText(parts, q.signText);
      pushText(parts, q.transcript);
      (q.options || []).forEach((o) => pushText(parts, typeof o === 'string' ? o : o?.text));
    };

    (exam.lesenParts || exam.readingParts || []).forEach((part) => {
      pushText(parts, part.text);
      pushText(parts, part.textTitle);
      pushText(parts, part.instruction);
      (part.items || []).forEach((it) => {
        pushText(parts, it.signText);
        pushText(parts, it.text);
        walkQ(it);
      });
      (part.questions || []).forEach(walkQ);
      (part.ads || []).forEach((a) => pushText(parts, a.text));
      (part.persons || []).forEach((p) => pushText(parts, p.text));
      (part.opinions || []).forEach((o) => pushText(parts, o.text));
      (part.textWithGaps || []).forEach((p) => pushText(parts, p));
    });

    (exam.horenParts || exam.listeningParts || []).forEach((part) => {
      pushText(parts, part.transcript);
      pushText(parts, part.context);
      (part.segments || []).forEach((seg) => {
        pushText(parts, seg.transcript);
        (seg.questions || []).forEach(walkQ);
      });
      (part.questions || []).forEach(walkQ);
    });

    if (exam.lesen) {
      pushText(parts, exam.lesen.text);
      pushText(parts, exam.lesen.textTitle);
      (exam.lesen.questions || []).forEach(walkQ);
    }
    if (exam.horen) {
      pushText(parts, exam.horen.transcript);
      pushText(parts, exam.horen.context);
      (exam.horen.questions || []).forEach(walkQ);
    }
    if (exam.schreiben) pushText(parts, exam.schreiben.task);
    (exam.schreibenParts || exam.writingParts || []).forEach((p) => pushText(parts, p.task));

    return parts.join('\n');
  }

  function extractTokens(text) {
    const tokens = [];
    const re = /[A-Za-zÀ-öø-ÿÄÖÜäöüß]+(?:'[A-Za-zÀ-öø-ÿÄÖÜäöüß]+)?/g;
    let m;
    while ((m = re.exec(text)) !== null) tokens.push(m[0]);
    return tokens;
  }

  function tokenMatchesWord(token, word) {
    const t = String(token).toLowerCase();
    const w = String(word).toLowerCase();
    if (!t || !w) return false;
    if (t === w) return true;
    if (w.length <= 3) return false;
    if (t.startsWith(w) && t.length <= w.length + 8) return true;
    if (t.endsWith(w) && t.length <= w.length + 8) return true;
    return false;
  }

  function surfaceInText(text, surface) {
    const s = String(surface || '').trim();
    if (!s || !text) return false;
    try {
      const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(s)}(?![\\p{L}])`, 'iu');
      return re.test(text);
    } catch (_) {
      const re = new RegExp(`(?:^|[^A-Za-zÀ-öø-ÿÄÖÜäöüß])${escapeRegExp(s)}(?:$|[^A-Za-zÀ-öø-ÿÄÖÜäöüß])`, 'i');
      return re.test(text);
    }
  }

  function splitSentences(text) {
    return String(text || '')
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Template fillers that only exist to showcase a target word (Prompt 3). */
  function isForcedSurfaceContext(sentence, surface) {
    const s = String(sentence || '').trim();
    if (!s || !surfaceInText(s, surface)) return false;
    const w = escapeRegExp(String(surface).trim());
    const patterns = [
      new RegExp(`^Das ist (?:ein|eine|der|die) ${w}[.!?,…]?$`, 'iu'),
      new RegExp(`^Es ist (?:ein|eine) ${w}[.!?,…]?$`, 'iu'),
      new RegExp(`^Das ist (?:ein|eine) ${w},\\s*(?:der|die|das)[.!?…]?$`, 'iu'),
      new RegExp(`^Das ist (?:ein|eine) ${w},\\s*(?:der|die|das)\\s+${w}[.!?…]?$`, 'iu'),
      new RegExp(`^This is (?:a|an) ${w}[.!?,…]?$`, 'iu'),
      new RegExp(`^It is (?:a|an) ${w}[.!?,…]?$`, 'iu'),
      new RegExp(`^(?:Es (?:un|una)|El|La) ${w}[.!?,…]?$`, 'iu'),
    ];
    return patterns.some((re) => {
      try {
        return re.test(s);
      } catch (_) {
        return false;
      }
    });
  }

  function filterNaturalSurfaces(text, surfaces) {
    return (surfaces || []).filter((surface) => {
      const sentences = splitSentences(text).filter((sent) => surfaceInText(sent, surface));
      if (!sentences.length) return false;
      return sentences.some((sent) => !isForcedSurfaceContext(sent, surface));
    });
  }

  function deriveTargetUsage(exam, words) {
    if (!exam || !words?.length) return [];
    const text = collectExamTexts(exam);
    const tokens = extractTokens(text);
    const usage = [];

    words.forEach((word) => {
      const surfaces = new Set();
      tokens.forEach((token) => {
        if (tokenMatchesWord(token, word)) surfaces.add(token);
      });
      const natural = filterNaturalSurfaces(text, [...surfaces]);
      if (natural.length) usage.push({ word: String(word), surfaces: natural });
    });

    return usage;
  }

  function verifyTargetUsage(exam, targetUsage) {
    if (!exam || !Array.isArray(targetUsage)) return [];
    const text = collectExamTexts(exam);
    const verified = [];

    targetUsage.forEach((entry) => {
      const word = entry?.word;
      if (!word) return;
      const surfaces = (entry?.surfaces || [])
        .map((s) => String(s).trim())
        .filter((s) => s && surfaceInText(text, s));
      const unique = [...new Set(surfaces)];
      const natural = filterNaturalSurfaces(text, unique);
      if (natural.length) verified.push({ word: String(word), surfaces: natural });
    });

    return verified;
  }

  function applyVerified(exam, words) {
    if (!exam || !words?.length) return exam;
    const declared =
      Array.isArray(exam.targetUsage) && exam.targetUsage.length
        ? exam.targetUsage
        : deriveTargetUsage(exam, words);
    exam.targetUsageVerified = verifyTargetUsage(exam, declared);
    return exam;
  }

  function verifiedSurfaceSet(exam) {
    const set = new Set();
    (exam?.targetUsageVerified || []).forEach((entry) => {
      (entry.surfaces || []).forEach((s) => set.add(String(s).toLowerCase()));
    });
    return set;
  }

  function isVerifiedSurface(exam, token) {
    if (!exam?.vocabPersonal || !exam.targetUsageVerified?.length) return false;
    return verifiedSurfaceSet(exam).has(String(token).toLowerCase());
  }

  return {
    collectExamTexts,
    deriveTargetUsage,
    verifyTargetUsage,
    applyVerified,
    isVerifiedSurface,
    surfaceInText,
    tokenMatchesWord,
    isForcedSurfaceContext,
    filterNaturalSurfaces,
  };
})();

if (typeof window !== 'undefined') window.TargetUsage = TargetUsage;
if (typeof module !== 'undefined') module.exports = TargetUsage;
