/**
 * Lesen A2 T4 — passage shape (Anzeigen). CHK-29 mold dedup requires 6 titles.
 */

const MIN_TITLE_LEN = 3;
const MAX_TITLE_LEN = 72;

/** Derive a short Anzeige headline from body text when Gemini omits title. */
export function deriveAnzeigeTitleFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const firstLine = raw.split(/\n+/).map((l) => l.trim()).find(Boolean) || raw;

  const colon = firstLine.match(/^([^:]{8,70}):/);
  if (colon) {
    const head = colon[1].trim();
    if (head.length >= MIN_TITLE_LEN) return head.slice(0, MAX_TITLE_LEN);
  }

  const sent = firstLine.match(/^(.{8,120}?[.!?])(?:\s|$)/);
  if (sent) {
    return sent[1].replace(/[.!?]+$/, '').trim().slice(0, MAX_TITLE_LEN);
  }

  if (firstLine.length <= MAX_TITLE_LEN) return firstLine;

  const cut = firstLine.slice(0, MAX_TITLE_LEN);
  const sp = cut.lastIndexOf(' ');
  return (sp > MIN_TITLE_LEN ? cut.slice(0, sp) : cut).trim();
}

/** Backfill missing passage.title for Lesen A2 T4 (mutates copies). */
export function backfillLesenA2T4PassageTitles(passages) {
  if (!Array.isArray(passages)) return passages;
  return passages.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const existing = String(p.title || '').trim();
    if (existing.length >= MIN_TITLE_LEN) return p;
    const derived = deriveAnzeigeTitleFromText(p.text);
    if (!derived) return p;
    return { ...p, title: derived };
  });
}

export function isLesenA2T4PassageContext(ctx = {}) {
  const mod = String(ctx.module || '').toLowerCase();
  const level = String(ctx.level || 'B1').trim().toUpperCase();
  const teil = Number(ctx.teil ?? ctx.teilNum);
  return mod === 'lesen' && level === 'A2' && teil === 4;
}
