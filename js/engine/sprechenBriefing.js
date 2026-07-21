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

  /**
   * @param {string} text — full task / question
   * @param {number|string} [teil]
   * @returns {{ intro: string, bullets: string[] }}
   */
  function parseSprechenBriefing(text, teil) {
    const raw = String(text || '').trim();
    if (!raw) return { intro: '', bullets: [] };

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
    const full = String(part?.situation || part?.task || part?.instruction || '').trim();
    const parsed = parseSprechenBriefing(full, teil);
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
        explicit.some((line) => line.length > 80) &&
        explicit.join('\n').length >= full.length * 0.85;
      if (looksLikeLineSplit) {
        const reb = parseSprechenBriefing(full, teil);
        if (reb.bullets.length) {
          return { intro: reb.intro, bullets: reb.bullets, slides: [], full };
        }
      }
      return { intro: full, bullets: explicit, slides: [], full };
    }

    return { intro: full, bullets: [], slides: [], full };
  }

  const api = { parseSprechenBriefing, briefingForPart, cleanBulletLine };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.SprechenBriefing = api;
})(typeof window !== 'undefined' ? window : globalThis);
