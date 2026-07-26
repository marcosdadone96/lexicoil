/**
 * Parse Goethe Sprechen task text → intro paragraph + real discussion bullets.
 * Used for display (no duplicate full prompt) and for part.points normalization.
 */
(function (global) {
  const BULLET_LINE = /^\s*(?:[•*\-–]\s*|\d+[.)]\s*)/;

  const SPLIT_MARKERS = [
    /Hier\s+sind\s+(?:fünf\s+)?Punkte[^:\n]*:\s*\n/i,
    /Diskutieren\s+Sie\s+folgende\s+Punkte[^:\n]*:\s*\n/i,
    /(?:Besprechen|Sprechen)\s+Sie\s+(?:über\s+)?(?:die\s+)?folgenden\s+Punkte\s*:?\s*\n/i,
    /Ihre\s+Präsentation\s+sollte\s+folgende\s+Punkte\s+enthalten\s*:\s*\n/i,
    /Folgende\s+Struktur\s+wird\s+erwartet\s*:\s*\n/i,
    /Sprechen\s+Sie\s+über\s+folgende\s+Punkte\s*:\s*\n/i,
    /\n\s*Beispielfragen\s*:\s*\n/i,
    /Beispielfragen\s*:\s*\n/i,
  ];

  function cleanBulletLine(line) {
    return String(line || '')
      .replace(/^\s*[•*\-–]\s*/, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .trim();
  }

  function linesToBullets(block) {
    return String(block || '')
      .split('\n')
      .map(cleanBulletLine)
      .filter((line) => line.length > 2 && !/^beispielfragen\s*:?$/i.test(line));
  }

  function sprechenQuestionType(part, record) {
    const q0 = (record?.questions || part?.questions || [])[0];
    return String(q0?.type || part?.type || '').toLowerCase();
  }

  /** Goethe A2 Sprechen — full consigna is one block (Karten / Karte / agendas), not B1 bullet lists. */
  function isA2GoetheSprechen(text, teil, opts = {}) {
    const level = String(opts?.level || '').toUpperCase();
    const type = String(opts?.type || '').toLowerCase();
    if (level === 'A2') return true;
    if (['personal_questions', 'about_self', 'plan_together'].includes(type)) return true;
    const t = String(text || '');
    if (/\bIhre Karten:\b/i.test(t) && /geburtstag/i.test(t) && /(wohnort|beruf|hobby)/i.test(t)) return true;
    if (/\bIhre Karte:\b/i.test(t) && /\berzählen\b/i.test(t)) return true;
    if (/\bIhre Woche:\b/i.test(t) && /Woche Ihres Partners/i.test(t)) return true;
    return false;
  }

  function parseOpts(teil, maybeOpts) {
    if (maybeOpts && typeof maybeOpts === 'object') {
      return {
        teil: Number(teil),
        level: String(maybeOpts.level || '').toUpperCase(),
        type: String(maybeOpts.type || '').toLowerCase(),
      };
    }
    return { teil: Number(teil), level: '', type: '' };
  }

  /**
   * @param {string} text — full task / question
   * @param {number|string} [teil]
   * @param {{ level?: string, type?: string }} [opts]
   * @returns {{ intro: string, bullets: string[] }}
   */
  function parseSprechenBriefing(text, teil, opts) {
    const raw = String(text || '').trim();
    if (!raw) return { intro: '', bullets: [] };

    const ctx = parseOpts(teil, opts);
    if (isA2GoetheSprechen(raw, ctx.teil, ctx)) {
      return { intro: raw, bullets: [] };
    }

    for (const re of SPLIT_MARKERS) {
      const m = raw.match(re);
      if (m && m.index != null) {
        const intro = raw.slice(0, m.index).trim();
        const rest = raw.slice(m.index + m[0].length).trim();
        const bullets = linesToBullets(rest);
        if (bullets.length) return { intro, bullets };
      }
    }

    const teilN = Number(teil);
    if (teilN === 2) {
      const m = raw.match(/\n\s*1\.\s+/);
      if (m && m.index != null) {
        const intro = raw.slice(0, m.index).trim();
        const rest = raw.slice(m.index).trim();
        const bullets = rest
          .split(/\n(?=\s*\d+[.)]\s+)/)
          .map(cleanBulletLine)
          .filter(Boolean);
        if (bullets.length) return { intro, bullets };
      }
    }

    if (teilN === 3) {
      const m = raw.match(/\n\s*Beispielfragen\s*:\s*\n/i);
      if (m && m.index != null) {
        const intro = raw.slice(0, m.index).trim();
        const bullets = linesToBullets(raw.slice(m.index + m[0].length));
        if (bullets.length) return { intro, bullets };
      }
    }

    const lines = raw.split('\n');
    const firstBulletIdx = lines.findIndex((line) => BULLET_LINE.test(line));
    if (firstBulletIdx > 0) {
      const intro = lines.slice(0, firstBulletIdx).join('\n').trim();
      const bullets = linesToBullets(lines.slice(firstBulletIdx).join('\n'));
      if (bullets.length) return { intro, bullets };
    }

    return { intro: raw, bullets: [] };
  }

  /**
   * Resolve what to show in the exam UI from a sprechen part object.
   * Keeps full situation on the part for AI / eval — display only.
   */
  function briefingForPart(part) {
    const teil = Number(part?.teil) || 1;
    const level = String(part?.level || part?.questions?.[0]?.level || '').toUpperCase();
    const qType = sprechenQuestionType(part);
    const full = String(part?.situation || part?.task || part?.instruction || '').trim();
    const ctx = { level, type: qType };

    if (isA2GoetheSprechen(full, teil, ctx)) {
      return {
        intro: full,
        bullets: [],
        slides: Array.isArray(part?.slides) ? part.slides : [],
        full,
      };
    }

    const parsed = parseSprechenBriefing(full, teil, ctx);
    const slides = Array.isArray(part?.slides) ? part.slides : [];
    const explicit = (part?.points || part?.prompts || [])
      .map((p) => String(p || '').trim())
      .filter(Boolean);

    if (slides.length) {
      return {
        intro: parsed.bullets.length ? parsed.intro : full,
        bullets: [],
        slides,
        full,
      };
    }

    if (parsed.bullets.length) {
      return { intro: parsed.intro, bullets: parsed.bullets, slides: [], full };
    }

    if (explicit.length) {
      const looksLikeLineSplit =
        explicit.length >= 2 &&
        explicit.join('\n').length >= full.length * 0.85;
      if (looksLikeLineSplit) {
        return { intro: full, bullets: [], slides: [], full };
      }
      return { intro: full, bullets: explicit, slides: [], full };
    }

    return { intro: full, bullets: [], slides: [], full };
  }

  /**
   * Normalize sprechen part for exam render + publish (single consigna source, no line-split points).
   */
  function enrichSprechenExamPart(part, record) {
    const teil = Number(record?.teil ?? part?.teil);
    const qs = record?.questions || part?.questions || [];
    const q0 = qs[0];
    const level = String(record?.level || part?.level || q0?.level || '').toUpperCase();
    const canonical = String(
      record?.instruction || q0?.question || record?.task || part?.instruction || part?.task || '',
    ).trim();

    part.teil = teil;
    part.level = level;
    part.instruction = canonical;
    part.task = canonical;
    part.situation = canonical;
    part.fieldId = record?.fieldId || part?.fieldId || `speak_bp_${teil}`;
    part.title = record?.title || record?.taskFormat || part?.title || `Teil ${teil}`;
    part.dauer = record?.dauer || record?.time || record?.arbeitszeit || part?.dauer || '';
    part.cardText = record?.cardText || part?.cardText || '';
    part.photoDescriptions = record?.photoDescriptions || part?.photoDescriptions || [];
    part.minExchanges =
      record?.minExchanges != null
        ? record.minExchanges
        : part?.minExchanges != null
          ? part.minExchanges
          : teil === 3
            ? 3
            : 4;
    part.points = [];
    part.prompts = [];
    if (Number(teil) === 2 && Array.isArray(record?.slides) && record.slides.length) {
      part.slides = record.slides;
    }
    return part;
  }

  const api = {
    parseSprechenBriefing,
    briefingForPart,
    enrichSprechenExamPart,
    isA2GoetheSprechen,
    cleanBulletLine,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.SprechenBriefing = api;
})(typeof window !== 'undefined' ? window : globalThis);
