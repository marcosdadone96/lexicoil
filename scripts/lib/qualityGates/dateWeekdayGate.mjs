/**
 * dateWeekdayGate.mjs — Detecta inconsistencias día-de-semana ↔ fecha (día. mes)
 * en alemán, ancladas a un año de referencia (por defecto: año calendario actual,
 * mismo criterio que LanguageTool DE_DATE_WEEKDAY_CURRENTYEAR).
 *
 * Solo detecta — no autocorrije.
 */
import { buildVerdict, pushFinding } from './qualityGateCommon.mjs';

export const GATE_NAME = 'Q3-dateWeekday';

const WEEKDAYS = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonnabend: 6,
};

const WEEKDAY_NAMES_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

const MONTHS = {
  januar: 0,
  februar: 1,
  märz: 2,
  maerz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
};

/**
 * Variantes reales vistas en pool/staging:
 *   am Montag, den 15. Mai
 *   am kommenden Dienstag, dem 15. Mai
 *   Donnerstag, dem 20. Juni
 *   Samstag, den 15. Juni
 *   Montag, dem 15. Mai  (explicaciones)
 */
const DATE_WEEKDAY_RE =
  /\b(?:am\s+(?:kommenden\s+)?)?(Sonntag|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend),?\s+de[mn]\s+(\d{1,2})\.\s+(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?:\s+(\d{4}))?/gi;

function collectTextFields(batch) {
  const items = [];
  for (const p of batch.passages || []) {
    if (p?.text) items.push({ field: `passages[${p.id || '?'}].text`, text: String(p.text) });
    if (p?.title) items.push({ field: `passages[${p.id || '?'}].title`, text: String(p.title) });
    if (p?.transcript) items.push({ field: `passages[${p.id || '?'}].transcript`, text: String(p.transcript) });
  }
  if (batch?.passage?.text) {
    items.push({ field: 'passage.text', text: String(batch.passage.text) });
  }
  for (let i = 0; i < (batch.questions || []).length; i++) {
    const q = batch.questions[i];
    const base = `questions[${i}]`;
    if (q?.question) items.push({ field: `${base}.question`, text: String(q.question) });
    if (q?.explanation) items.push({ field: `${base}.explanation`, text: String(q.explanation) });
    for (let j = 0; j < (q?.options || []).length; j++) {
      items.push({ field: `${base}.options[${j}]`, text: String(q.options[j]) });
    }
  }
  return items;
}

/**
 * @param {string} text
 * @param {{ year?: number }} [opts]
 * @returns {Array<object>}
 */
export function findDateWeekdayMismatches(text, opts = {}) {
  const defaultYear = Number.isInteger(opts.year) ? opts.year : new Date().getFullYear();
  const out = [];
  if (!text) return out;

  DATE_WEEKDAY_RE.lastIndex = 0;
  let m;
  while ((m = DATE_WEEKDAY_RE.exec(text)) !== null) {
    const weekdayRaw = m[1];
    const day = Number(m[2]);
    const monthRaw = m[3];
    const yearExplicit = m[4] ? Number(m[4]) : null;
    const year = yearExplicit || defaultYear;

    const weekdayKey = String(weekdayRaw).toLowerCase();
    const monthKey = String(monthRaw)
      .toLowerCase()
      .normalize('NFC')
      .replace(/ä/g, 'ae');
    const claimedDow = WEEKDAYS[weekdayKey];
    const monthIndex = MONTHS[monthKey] ?? MONTHS[String(monthRaw).toLowerCase()];
    if (claimedDow == null || monthIndex == null || !Number.isFinite(day)) continue;

    // Validar día de mes (evitar 31. Feb etc. — reportar aparte)
    const probe = new Date(Date.UTC(year, monthIndex, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== day) {
      out.push({
        match: m[0],
        offset: m.index,
        length: m[0].length,
        claimedWeekday: weekdayRaw,
        day,
        month: monthRaw,
        year,
        actualWeekday: null,
        reason: 'invalid_calendar_date',
      });
      continue;
    }

    const actualDow = probe.getUTCDay();
    if (actualDow !== claimedDow) {
      out.push({
        match: m[0],
        offset: m.index,
        length: m[0].length,
        claimedWeekday: weekdayRaw,
        day,
        month: monthRaw,
        year,
        actualWeekday: WEEKDAY_NAMES_DE[actualDow],
        reason: 'weekday_mismatch',
      });
    }
  }
  return out;
}

/**
 * @param {object} batch
 * @param {{ file?: string, year?: number, severity?: 'block'|'warn' }} [opts]
 */
export function runDateWeekdayGate(batch, opts = {}) {
  const file = opts.file || '';
  const year = Number.isInteger(opts.year) ? opts.year : new Date().getFullYear();
  const severity = opts.severity || 'block';
  const findings = [];
  const seen = new Set();

  for (const { field, text } of collectTextFields(batch)) {
    for (const hit of findDateWeekdayMismatches(text, { year })) {
      const key = `${field}|${hit.match}|${hit.year}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const detail =
        hit.reason === 'invalid_calendar_date'
          ? `${field}: fecha inválida «${hit.match}» (año ref. ${hit.year})`
          : `${field}: «${hit.match}» — ${hit.claimedWeekday} no coincide con ${hit.day}. ${hit.month} ${hit.year} (cae en ${hit.actualWeekday})`;

      pushFinding(findings, {
        rule: 'date_weekday_mismatch',
        severity,
        detail,
        span: hit.match,
      });
    }
  }

  return buildVerdict(GATE_NAME, file, findings);
}
