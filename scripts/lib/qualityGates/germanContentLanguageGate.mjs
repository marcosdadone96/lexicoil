/**
 * germanContentLanguageGate.mjs — Q5: verificación determinista de idioma alemán.
 * No confía en lang:"de" — detecta español/otros idiomas en question/options/passage.
 */
import { buildVerdict, pushFinding } from './qualityGateCommon.mjs';

const SPANISH_EXCLUSIVE_CHARS = /[¿¡]/;

/** Palabras españolas que casi nunca aparecen en alemán B1 de examen. */
const SPANISH_EXCLUSIVE_RE =
  /\b(qué|cuál|cuáles|cómo|dónde|cuándo|porqué|porque|también|además|emplear|aconseja|sugerencia|traslada|celebra|parada|trayecto|beneficios|bicicleta|caminar|recomienda|consumir|diariamente|verduras|frutas|autobús|autobus)\b/i;

const SPANISH_PHRASE_PATTERNS = [
  /\b(la|el|los|las|un|una)\s+[a-záéíóúñ]{3,}/i,
  /\bse\s+(celebra|traslada|recomienda|aconseja)\b/i,
  /\bfin\s+de\s+semana\b/i,
  /\bpara\s+trayectos\b/i,
  /\btiene\s+usar\b/i,
  /\bel\s+pasaje\s+indica/i,
  /\bseg[úu]n\s+el\s+pasaje\b/i,
  /\bla\s+opci[óo]n\b/i,
  /\bha\s+sido\s+(acortada|modificada|significativamente)\b/i,
];

const GERMAN_MARKERS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen',
  'und', 'ist', 'sind', 'wird', 'werden', 'nicht', 'auch', 'mit', 'für', 'auf', 'aus',
  'bei', 'nach', 'oder', 'wenn', 'wie', 'was', 'wo', 'wann', 'warum', 'welche', 'welcher',
  'welches', 'welchen', 'können', 'muss', 'soll', 'haben', 'hat', 'kann', 'laut', 'gibt',
]);

const SPANISH_MARKERS = new Set([
  'el', 'la', 'los', 'las', 'unos', 'unas', 'del', 'para', 'por',
  'con', 'qué', 'cómo', 'dónde', 'cuándo', 'tiene', 'tienen', 'usar', 'emplear',
  'está', 'están', 'semana', 'evento', 'parada', 'coche',
  'bicicleta', 'caminar', 'beneficios', 'sugerencia', 'aconseja', 'traslada', 'celebra',
  'trayecto', 'corto', 'cortos', 'autobús', 'autobus', 'recomienda', 'consumir',
  // NOTE: omitimos «es», «se», «que», «un», «una», «al», «fin» — aparecen en alemán legítimo.
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[\p{L}]+/gu) || [];
}

function scoreLanguage(text) {
  const tokens = tokenize(text);
  let german = 0;
  let spanish = 0;
  for (const t of tokens) {
    if (GERMAN_MARKERS.has(t)) german++;
    if (SPANISH_MARKERS.has(t)) spanish++;
  }
  if (SPANISH_EXCLUSIVE_CHARS.test(text)) spanish += 5;
  if (SPANISH_EXCLUSIVE_RE.test(text)) spanish += 4;
  for (const pat of SPANISH_PHRASE_PATTERNS) {
    if (pat.test(text)) spanish += 3;
  }
  return { german, spanish, tokens: tokens.length };
}

function hasStrongSpanishSignal(text) {
  if (SPANISH_EXCLUSIVE_CHARS.test(text)) return true;
  if (SPANISH_EXCLUSIVE_RE.test(text)) return true;
  return SPANISH_PHRASE_PATTERNS.some((pat) => pat.test(text));
}

/**
 * @param {string} text
 * @param {{ minTokens?: number, mode?: 'question'|'passage' }} [opts]
 */
export function assessGermanExamText(text, { minTokens = 3, mode = 'question' } = {}) {
  const score = scoreLanguage(text);
  if (score.tokens < minTokens) return { ok: true, reason: 'too_short', score };

  if (hasStrongSpanishSignal(text)) {
    return { ok: false, reason: 'spanish_strong_signal', score };
  }

  if (mode === 'passage') {
    // Pasajes largos: solo señales fuertes (evita falsos positivos por «es», etc.).
    return { ok: true, score };
  }

  if (score.spanish >= 2 && score.spanish > score.german) {
    return { ok: false, reason: 'spanish_dominant', score };
  }
  if (score.spanish >= 3 && score.german === 0) {
    return { ok: false, reason: 'spanish_only', score };
  }
  return { ok: true, score };
}

function stripOptionPrefix(opt) {
  return String(opt || '').replace(/^[a-d]\)\s*/i, '');
}

/**
 * @param {object} batch
 * @param {{ file?: string, lang?: string }} [opts]
 */
export function runGermanContentLanguageGate(batch, opts = {}) {
  const file = opts.file || '';
  const findings = [];
  const lang = String(batch?.lang || batch?.questions?.[0]?.lang || opts.lang || 'de').toLowerCase();
  if (lang !== 'de') return buildVerdict('germanContentLanguage', file, findings);

  for (const q of batch.questions || []) {
    const qLang = String(q.lang || q.language || lang).toLowerCase();
    if (qLang !== 'de') continue;

    const fields = [
      ['question', q.question],
      ['explanation', q.explanation],
      ...(q.options || []).map((opt, i) => [`option[${i}]`, stripOptionPrefix(opt)]),
    ];

    for (const [field, text] of fields) {
      if (!String(text || '').trim()) continue;
      const check = assessGermanExamText(text, { mode: 'question' });
      if (!check.ok) {
        const preview = String(text).slice(0, 96);
        pushFinding(findings, {
          rule: 'non_german_exam_text',
          severity: 'block',
          detail: `${q.id || 'question'}: ${field} no está en alemán (${check.reason}): «${preview}${text.length > 96 ? '…' : ''}»`,
          span: q.id,
        });
      }
    }
  }

  for (const p of batch.passages || []) {
    const text = p.text || p.transcript || '';
    if (!String(text).trim()) continue;
    const check = assessGermanExamText(text, { minTokens: 8, mode: 'passage' });
    if (!check.ok) {
      pushFinding(findings, {
        rule: 'non_german_passage_text',
        severity: 'block',
        detail: `${p.id || 'passage'}: texto no está en alemán (${check.reason})`,
        span: p.id,
      });
    }
  }

  return buildVerdict('germanContentLanguage', file, findings);
}

/**
 * Hard block helper for surgical repairs — same criteria as Q5 gate.
 * @param {object} batch
 * @param {{ file?: string, lang?: string }} [opts]
 * @returns {{ ok: boolean, verdict: string, findings: object[] }}
 */
export function assertBatchGermanExamContent(batch, opts = {}) {
  const verdict = runGermanContentLanguageGate(batch, opts);
  return {
    ok: verdict.verdict !== 'block',
    verdict: verdict.verdict,
    findings: verdict.findings || [],
  };
}

export const GERMAN_CONTENT_LANGUAGE_GATE_VERSION = 'v1.2-explanation-field-repair-meta-2026-07-20';
