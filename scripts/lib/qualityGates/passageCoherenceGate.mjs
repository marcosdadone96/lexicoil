/**
 * passageCoherenceGate.mjs — Q3 Capa A (determinista / regex).
 * Solo lectura. Capa B (LLM) fuera de alcance en esta oleada.
 *
 * Relación con stripMarkdownLeak (germanCapsNormalize v3.2-stable, paso 0):
 * El normalizador elimina `**negrita**` en passages.text/title/transcript ANTES de que
 * el batch llegue a este gate. Por tanto, 0 findings `markdown_leak` en audit logs de
 * producción post-v3.2 es ESPERADO y bueno — no indica que el gate dejó de funcionar.
 * Para confirmar que stripMarkdownLeak sigue activo, revisar stats.markdownFixed en logs
 * de germanCapsNormalize o el paso 0 en applyGermanCapsNormalize.
 */
import { buildVerdict, pushFinding } from './qualityGateCommon.mjs';

const MARKDOWN_PATTERNS = [
  { rule: 'markdown_leak', re: /\*\*[^*\n]{1,120}\*\*/g, label: 'negrita **…**' },
  { rule: 'markdown_leak', re: /(?:^|\n)#{1,6}\s+\S/g, label: 'encabezado ##…' },
  { rule: 'markdown_leak', re: /`[^`\n]{1,80}`/g, label: 'código `…`' },
  { rule: 'markdown_leak', re: /\[[^\]\n]{1,80}\]\([^)\n]{1,200}\)/g, label: 'enlace [text](url)' },
  { rule: 'markdown_leak', re: /(?:^|\n)\s*[-*]\s+\S/g, label: 'lista markdown - / *' },
];

/** Tras header en negrita con dos puntos — primera palabra en minúscula (warn). */
const SENTENCE_CASE_AFTER_HEADER_RE =
  /(?:^|\n)\s*\d+\.\s+\*\*[^*]+:\*\*\s+([a-zäöüß]{3,})/g;

const HEADER_BOLD_COLON_RE = /\*\*[^*\n]{2,80}:\*\*\s+([a-zäöüß]{3,})/g;

const ARTICLE_LOWERCASE_OK = new Set(['der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines']);

function collectTextFields(batch) {
  const items = [];
  for (const p of batch.passages || []) {
    if (p.text) items.push({ field: `passages[${p.id || '?'}].text`, text: p.text });
    if (p.title) items.push({ field: `passages[${p.id || '?'}].title`, text: p.title });
  }
  for (let i = 0; i < (batch.questions || []).length; i++) {
    const q = batch.questions[i];
    const base = `questions[${i}]`;
    if (q.question) items.push({ field: `${base}.question`, text: q.question });
    if (q.explanation) items.push({ field: `${base}.explanation`, text: q.explanation });
    if (q.signText) items.push({ field: `${base}.signText`, text: q.signText });
    for (let j = 0; j < (q.options || []).length; j++) {
      items.push({ field: `${base}.options[${j}]`, text: String(q.options[j]) });
    }
  }
  return items;
}

function scanMarkdown(text, field, findings) {
  for (const { rule, re, label } of MARKDOWN_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      pushFinding(findings, {
        rule,
        detail: `${field}: markdown residual (${label})`,
        span: m[0].slice(0, 80),
      });
      if (findings.filter((f) => f.rule === 'markdown_leak').length >= 8) return;
    }
  }
}

function scanSentenceCaseAfterHeader(text, field, findings) {
  for (const re of [SENTENCE_CASE_AFTER_HEADER_RE, HEADER_BOLD_COLON_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const word = m[1];
      if (ARTICLE_LOWERCASE_OK.has(word)) continue;
      pushFinding(findings, {
        rule: 'possible_sentence_case_error',
        severity: 'warn',
        detail:
          `${field}: posible minúscula tras encabezado («${word}…») — regla frágil, solo warn`,
        span: m[0].slice(0, 100),
      });
    }
  }
}

/**
 * @param {object} batch
 * @param {object} [opts]
 * @param {string} [opts.file]
 */
export function runPassageCoherenceGate(batch, opts = {}) {
  const file = opts.file || '';
  const findings = [];

  for (const { field, text } of collectTextFields(batch)) {
    scanMarkdown(text, field, findings);
    scanSentenceCaseAfterHeader(text, field, findings);
  }

  return buildVerdict('Q3-passageCoherence', file, findings);
}

export const GATE_NAME = 'Q3-passageCoherence';
