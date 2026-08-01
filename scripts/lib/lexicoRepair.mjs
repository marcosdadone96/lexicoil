/**
 * lexicoRepair.mjs — Localized léxico repair (1 LLM call, fix flagged fields only).
 */
import { buildLexicoBatchRepairPrompt } from './lesenTemplatePrompt.mjs';

const LEXICO_RE = /vocabulario B2\+|vocabulario B1\+|error gramatical|vocabulario C1/i;

export function hasLexicoRepairSignal(issues) {
  return (issues || []).some((i) => LEXICO_RE.test(String(i)));
}

/**
 * Parse lexical issues into structured findings.
 * Format: `question gen-q-…: vocabulario B2+ … «TERM» → usa «SUGGESTION» (B1)`
 */
export function parseLexicoFindings(issues) {
  const out = [];
  for (const issue of issues || []) {
    const s = String(issue);
    if (!LEXICO_RE.test(s)) continue;
    const idM = s.match(/^(?:question|option|passage)\s+(gen-[a-z0-9]+-[^\s:]+)/i);
    const legacyM = s.match(/^(gen-[a-z0-9]+-[^\s:]+|[\w.-]+ \S+):\s*(.+)$/i);
    const itemId = idM
      ? idM[1]
      : legacyM
        ? legacyM[1].replace(/^(question|option|passage)\s+/, '')
        : null;
    const termM = s.match(/«(.+?)»\s*→\s*(?:usa\s+)?«(.+?)»/);
    if (!termM) continue;
    const field = /\bexplanation\b/i.test(s)
      ? 'explanation'
      : /\bsignText\b/i.test(s)
        ? 'signText'
      : /\boption\b/i.test(s)
        ? 'options'
        : /\bpassage\b/i.test(s) && /\btitle\b/i.test(s)
          ? 'passageTitle'
        : /\bpassage\b/i.test(s) && /\btext\b/i.test(s)
          ? 'passageText'
          : 'question';
    out.push({
      itemId: itemId || null,
      detail: s,
      term: termM[1].trim(),
      suggestion: termM[2].trim(),
      field,
    });
  }
  return out;
}

function firstSuggestion(suggestion, matchedTerm = '') {
  let raw = String(suggestion || '').trim();
  const arrowM = raw.match(/^(.+?)\s*→\s*(.+)$/);
  if (arrowM) raw = arrowM[2].trim();
  const alts = raw
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
  const term = String(matchedTerm || '');
  if (/herausforderungen/i.test(term)) {
    return alts.find((a) => /^probleme\b/i.test(a)) || 'Probleme';
  }
  if (/herausforderung/i.test(term)) {
    return alts.find((a) => /^problem\b/i.test(a)) || alts[0] || 'Problem';
  }
  if (/aspekte/i.test(term)) {
    return alts.find((a) => /^punkte\b/i.test(a)) || alts.find((a) => /^teile\b/i.test(a)) || alts[0];
  }
  if (/aspekt/i.test(term)) {
    return alts.find((a) => /^punkt\b/i.test(a)) || alts.find((a) => /^teil\b/i.test(a)) || alts[0];
  }
  return alts[0] || String(suggestion || '').trim();
}

function replaceTermCaseAware(text, term, replacement) {
  if (!text || !term || !replacement) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(escaped, 'gi'), (m) => {
    if (m === m.toUpperCase()) return replacement.toUpperCase();
    if (m[0] === m[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
  });
}

/** Deterministic B2→B1 substitutions from gate messages (no LLM). */
export function applyDeterministicLexicoSubstitutions(batch, findings) {
  if (!findings?.length) return null;
  let questions = [...(batch.questions || [])];
  let passages = [...(batch.passages || [])];
  let changed = false;

  for (const f of findings) {
    if (!f.itemId || !f.term) continue;
    const repl = firstSuggestion(f.suggestion, f.term);
    if (!repl) continue;

    if (f.field === 'passageText' || f.field === 'passageTitle') {
      const pIdx = passages.findIndex((p) => p.id === f.itemId);
      if (pIdx < 0) continue;
      const key = f.field === 'passageTitle' ? 'title' : 'text';
      const prev = passages[pIdx][key];
      if (typeof prev !== 'string' || !prev) continue;
      const next = replaceTermCaseAware(prev, f.term, repl);
      if (next !== prev) {
        passages[pIdx] = { ...passages[pIdx], [key]: next };
        changed = true;
      }
      continue;
    }

    const qIdx = questions.findIndex((q) => q.id === f.itemId);
    if (qIdx < 0) continue;
    const q = { ...questions[qIdx] };
    let qChanged = false;
    if (f.field === 'explanation' && q.explanation) {
      const next = replaceTermCaseAware(q.explanation, f.term, repl);
      if (next !== q.explanation) {
        q.explanation = next;
        qChanged = true;
      }
    } else if (f.field === 'question' && q.question) {
      const next = replaceTermCaseAware(q.question, f.term, repl);
      if (next !== q.question) {
        q.question = next;
        qChanged = true;
      }
    } else if (f.field === 'signText' && q.signText) {
      const next = replaceTermCaseAware(q.signText, f.term, repl);
      if (next !== q.signText) {
        q.signText = next;
        qChanged = true;
      }
    } else if (f.field === 'options' && Array.isArray(q.options)) {
      const opts = q.options.map((o) => replaceTermCaseAware(String(o), f.term, repl));
      if (JSON.stringify(opts) !== JSON.stringify(q.options)) {
        q.options = opts;
        qChanged = true;
      }
    }
    if (qChanged) {
      questions[qIdx] = q;
      changed = true;
    }
  }

  return changed ? { ...batch, questions, passages } : null;
}

function mergeLexicoPatches(batch, patches) {
  let questions = [...(batch.questions || [])];
  let passages = [...(batch.passages || [])];
  let changed = false;

  for (const patch of patches) {
    if (!patch?.id) continue;
    const qIdx = questions.findIndex((q) => q.id === patch.id);
    if (qIdx < 0) continue;
    const q = { ...questions[qIdx] };
    if (typeof patch.question === 'string') {
      q.question = patch.question;
      changed = true;
    }
    if (typeof patch.explanation === 'string') {
      q.explanation = patch.explanation;
      changed = true;
    }
    if (typeof patch.signText === 'string') {
      q.signText = patch.signText;
      changed = true;
    }
    if (Array.isArray(patch.options)) {
      q.options = patch.options;
      changed = true;
    }
    questions[qIdx] = q;
  }

  for (const patch of patches) {
    if (!patch?.passageId) continue;
    const pIdx = passages.findIndex((p) => p.id === patch.passageId);
    if (pIdx < 0) continue;
    const next = { ...passages[pIdx] };
    let pChanged = false;
    if (typeof patch.text === 'string') {
      next.text = patch.text;
      pChanged = true;
    }
    if (typeof patch.title === 'string') {
      next.title = patch.title;
      pChanged = true;
    }
    if (pChanged) {
      passages[pIdx] = next;
      changed = true;
    }
  }

  return changed ? { ...batch, questions, passages } : null;
}

/**
 * @param {object} batch
 * @param {string[]} issues
 * @param {Function} callLlm
 */
export async function repairLexicoBatch(batch, issues, callLlm, opts = {}) {
  const findings = parseLexicoFindings(issues);
  if (!findings.length || findings.length > 4) return null;

  const deterministic = applyDeterministicLexicoSubstitutions(batch, findings);
  if (deterministic) {
    console.log(`${opts.module || batch.questions?.[0]?.module || 'lesen'}: léxico determinista (${findings.length} término(s))…`);
    return deterministic;
  }

  const module = opts.module || batch.questions?.[0]?.module || 'lesen';
  const prompt = buildLexicoBatchRepairPrompt({ batch, findings, module, level: opts.level });

  console.log(
    `${module}: reparando ${findings.length} hallazgo(s) léxicos (1 llamada LLM, solo campos marcados)…`,
  );

  let raw;
  try {
    raw = await callLlm({ prompt, maxTokens: Math.min(opts.maxTokens ?? 4096, 4096) });
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = extractJson(raw.text ?? raw);
  } catch {
    return null;
  }

  const patches = Array.isArray(parsed?.questions)
    ? parsed.questions
    : parsed?.id
      ? [parsed]
      : null;
  const passagePatches = Array.isArray(parsed?.passages) ? parsed.passages : null;
  if (!patches?.length && !passagePatches?.length) return null;

  let merged = patches?.length ? mergeLexicoPatches(batch, patches) : { ...batch };
  if (!merged) merged = { ...batch };

  if (passagePatches?.length) {
    merged = mergeLexicoPatches(merged, passagePatches) ?? merged;
  }

  return merged.questions !== batch.questions || merged.passages !== batch.passages ? merged : null;
}
