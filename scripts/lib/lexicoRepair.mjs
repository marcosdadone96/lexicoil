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
    const m = s.match(/^(gen-q-[^\s:]+|[\w.-]+ \S+):\s*(.+)$/);
    const itemId = m ? m[1].replace(/^(question|option|passage)\s+/, '') : null;
    const termM = s.match(/«(.+?)»\s*→\s*(?:usa\s+)?«(.+?)»/);
    if (!termM) continue;
    out.push({
      itemId: itemId || null,
      detail: s,
      term: termM[1].trim(),
      suggestion: termM[2].trim(),
      field: s.includes(' explanation') ? 'explanation' : s.includes(' option') ? 'options' : 'question',
    });
  }
  return out;
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
    if (Array.isArray(patch.options)) {
      q.options = patch.options;
      changed = true;
    }
    questions[qIdx] = q;
  }

  for (const patch of patches) {
    if (!patch?.passageId || typeof patch.text !== 'string') continue;
    const pIdx = passages.findIndex((p) => p.id === patch.passageId);
    if (pIdx < 0) continue;
    passages[pIdx] = { ...passages[pIdx], text: patch.text };
    changed = true;
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
  if (!patches?.length) return null;

  return mergeLexicoPatches(batch, patches);
}
