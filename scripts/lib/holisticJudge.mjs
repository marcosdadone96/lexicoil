/**
 * holisticJudge.mjs — SEM-2: juez L2 mcq_distinct (+ ejes advise-only en log).
 *
 * Producción:
 *   - Solo Lesen T2, tras SEM-1 y deterministas.
 *   - Todos los ejes advise-only → sem2-advise-log.jsonl (mcq_distinct lo bloquea CHK-28/calidad).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractPartContext,
  contentHash,
  isSelfContradictorySemIssue,
} from './semanticValidator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADVISE_LOG = path.join(ROOT, 'batches', 'generated', 'sem2-advise-log.jsonl');

export const HOLISTIC_AXES = [
  'correctness',
  'ambiguity',
  'distractor',
  'explanation',
  'paraphrase',
  'persona',
  'absolute',
  'mcq_distinct',
  'vocab_level',
  'topic_fit',
  'template',
];

/** Ejes que pueden bloquear publish — vacío; mcq_distinct lo cubre el checker determinista. */
export const SEM2_BLOCK_AXES = new Set([]);

export const NOISE_THRESHOLD = 0.65;

export const AXIS_BLOCK_THRESHOLDS = {
  correctness: 0.85,
  ambiguity: 0.85,
  distractor: 0.90,
  explanation: 0.90,
  paraphrase: 0.88,
  persona: 0.88,
  absolute: 0.88,
  mcq_distinct: 0.88,
  vocab_level: 0.92,
  topic_fit: 0.90,
  template: null,
};

const VALID_AXES = new Set(HOLISTIC_AXES);

let _llmFn = null;

async function callJudgeLlm(prompt) {
  if (_llmFn) return _llmFn(prompt);

  const useClaude =
    String(process.env.SEMANTIC_USE_CLAUDE || '').trim() === '1' &&
    !!process.env.ANTHROPIC_API_KEY;
  if (useClaude) {
    const { generateContent } = await import('./claudeClient.mjs');
    return generateContent({ prompt, maxRetries: 2, maxTokens: 4096 });
  }

  const { generateContent } = await import('./geminiClient.mjs');
  return generateContent({ prompt, jsonMode: true, maxRetries: 2, maxTokens: 8192, temperature: 0.1 });
}

export function _setHolisticJudgeLlmFn(fn) {
  _llmFn = fn;
}

export function shouldRunSem2(part) {
  const mod = String(part?.module || part?.questions?.[0]?.module || '').toLowerCase();
  const teil = Number(part?.teil ?? part?.questions?.[0]?.teil);
  return mod === 'lesen' && teil === 2;
}

function optionText(o) {
  if (typeof o === 'string') return o.trim();
  if (o && typeof o === 'object') return String(o.text ?? o.label ?? o.value ?? o.key ?? '').trim();
  return String(o ?? '').trim();
}

function formatOptions(q) {
  const opts = q.options || [];
  if (!opts.length) return '  (sin opciones)';
  return opts.map((o, i) => {
    const letter = String.fromCharCode(97 + i);
    const text = optionText(o);
    return `  ${letter}) ${text}`;
  }).join('\n');
}

function formatCorrectKeyLine(correctLetter, opts) {
  const key = String(correctLetter ?? '').trim().toLowerCase();
  const idx = key.charCodeAt(0) - 97;
  const text = optionText(opts?.[idx] || '');
  return `Clave: ${key}${text ? ` → "${text}"` : ''}`;
}

/**
 * Prompt producción: foco mcq_distinct + ejes secundarios solo warn.
 */
export function buildSem2Prompt(ctx, opts = {}) {
  const { passageText, questions, module, teil } = ctx;
  const topicTag = opts.topicTag || ctx.topicTag || '?';

  const qBlocks = questions
    .slice(0, 8)
    .map((q) => {
      const lines = [`PREGUNTA [${q.id || '?'}]: ${q.question || ''}`];
      if (q.options?.length) lines.push(formatOptions(q));
      lines.push(formatCorrectKeyLine(q.correct ?? q.correctAnswer, q.options));
      lines.push(q.explanation ? `Explicación: ${q.explanation}` : '(sin explicación)');
      return lines.join('\n');
    })
    .join('\n\n');

  return (
    `Eres examinador Goethe B1 (${module.toUpperCase()}, Teil ${teil}, tema ${topicTag}).\n` +
    `Evalúa opciones MCQ a/b/c de prensa B1 (solo métricas — el BLOCK lo hace CHK-28 determinista).\n\n` +
    `PRIORIDAD advise (verdict "warn" o "fail" solo para log; NUNCA bloquea publish):\n` +
    `- mcq_distinct: dos opciones parafrasean el MISMO hecho (verbessern/besser machen, Unterstützung/Betreuung).\n\n` +
    `SECUNDARIO (verdict "warn"):\n` +
    `correctness, ambiguity, distractor, explanation, paraphrase, vocab_level, topic_fit, template.\n\n` +
    `OBLIGATORIO: revisa CADA pregunta — compara opciones b y c; si parafrasean el mismo hecho, emite mcq_distinct warn/fail para log.\n\n` +
    `- Cita literal ≤20 palabras en evidence.quote.\n` +
    `- Si la clave es correcta y no hay rival textual, NO emitas correctness/ambiguity fail.\n` +
    `- Distractores incorrectos deben usar OTRO dato del pasaje mal aplicado, no sinónimo de la correcta.\n\n` +
    `TEXTO:\n${passageText}\n\nPREGUNTAS:\n${qBlocks}\n\n` +
    `JSON ONLY:\n` +
    `{"themeTags":["..."],"findings":[{"axis":"mcq_distinct","itemId":"...","field":"option_b",` +
    `"verdict":"fail","detail":"...","evidence":{"quote":"...","source":"option_b"},` +
    `"confidence":0.0-1.0,"repairHint":{"scope":"item","action":"rewrite_options","constraint":"..."}}]}\n` +
    `Sin problemas: {"themeTags":[],"findings":[]}`
  );
}

export function parseHolisticJudgeResponse(raw) {
  let text = raw;
  if (typeof raw === 'object' && raw !== null) {
    text =
      raw.candidates?.[0]?.content?.parts?.[0]?.text ??
      raw.text ??
      raw.content ??
      JSON.stringify(raw);
  }
  text = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { themeTags: [], findings: [] };
  }

  const findings = (Array.isArray(parsed.findings) ? parsed.findings : [])
    .filter((f) => f && typeof f.detail === 'string' && VALID_AXES.has(String(f.axis || '')))
    .map((f) => {
      const rawConf = Number(f.confidence);
      const confidence = Number.isFinite(rawConf) ? Math.min(1, Math.max(0, rawConf)) : 0.5;
      return {
        axis: String(f.axis),
        itemId: f.itemId || 'part',
        field: f.field || 'question',
        verdict: String(f.verdict || 'fail').toLowerCase() === 'warn' ? 'warn' : 'fail',
        detail: String(f.detail).slice(0, 400),
        evidence: f.evidence && typeof f.evidence === 'object'
          ? {
              quote: String(f.evidence.quote || '').slice(0, 200),
              source: String(f.evidence.source || ''),
            }
          : { quote: '', source: '' },
        confidence,
        repairHint: f.repairHint || null,
      };
    });

  const themeTags = Array.isArray(parsed.themeTags)
    ? parsed.themeTags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
    : [];

  return { themeTags, findings };
}

export function isSelfContradictoryHolisticFinding(finding) {
  if (finding.axis === 'correctness' || finding.axis === 'ambiguity') {
    return isSelfContradictorySemIssue({ kind: finding.axis, detail: finding.detail });
  }
  return false;
}

/**
 * @returns {'noise'|'advise'|'block'}
 */
export function classifyFindingSeverity(finding) {
  const conf = finding.confidence ?? 0;
  if (conf < NOISE_THRESHOLD) return 'noise';
  if (isSelfContradictoryHolisticFinding(finding)) return 'noise';

  if (SEM2_BLOCK_AXES.has(finding.axis)) {
    const blockTh = AXIS_BLOCK_THRESHOLDS[finding.axis] ?? 0.88;
    if (conf >= blockTh) return 'block';
    return 'advise';
  }

  return conf >= NOISE_THRESHOLD ? 'advise' : 'noise';
}

export function appendSem2AdviseLog(entry) {
  if (process.env.SEM2_ADVISE_LOG === '0') return;
  try {
    fs.mkdirSync(path.dirname(ADVISE_LOG), { recursive: true });
    fs.appendFileSync(ADVISE_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* non-critical */
  }
}

const _cache = new Map();

export function clearHolisticJudgeCache() {
  _cache.clear();
}

/**
 * SEM-2 judge — 1 LLM call on Lesen T2 only.
 * @returns {Promise<{ ok, blocking, advisory, findings, skipped?, error? }>}
 */
export async function runSem2Judge(part, opts = {}) {
  if (!shouldRunSem2(part)) {
    return { ok: true, blocking: [], advisory: [], findings: [], skipped: true };
  }

  const ctx = extractPartContext(part);
  if (!ctx) {
    return { ok: true, blocking: [], advisory: [], findings: [], skipped: true };
  }

  ctx.topicTag = opts.topicTag || part._requestedTopic || part.topicTag || part.passages?.[0]?.topicTag;

  const hash = `sem2:${contentHash(part)}`;
  if (_cache.has(hash) && !opts.noCache) {
    return _cache.get(hash);
  }

  const prompt = buildSem2Prompt(ctx, { topicTag: ctx.topicTag });
  let raw;
  try {
    raw = await callJudgeLlm(prompt);
  } catch (err) {
    const result = {
      ok: false,
      blocking: [],
      advisory: [],
      findings: [],
      error: String(err?.message || err),
      _llmError: true,
    };
    _cache.set(hash, result);
    return result;
  }

  const { themeTags, findings: rawFindings } = parseHolisticJudgeResponse(raw);
  const blocking = [];
  const advisory = [];
  const findings = [];

  for (const f of rawFindings) {
    const sev = classifyFindingSeverity(f);
    if (sev === 'noise') continue;
    const enriched = { ...f, severity: sev };
    findings.push(enriched);
    if (sev === 'block') blocking.push(enriched);
    else advisory.push(enriched);
  }

  appendSem2AdviseLog({
    ts: new Date().toISOString(),
    partId: part.id || part.questions?.[0]?.passageId || hash,
    teil: 2,
    module: 'lesen',
    topicTag: ctx.topicTag,
    themeTags,
    blocking: blocking.map(({ axis, itemId, confidence, detail }) => ({ axis, itemId, confidence, detail })),
    advisory: advisory.map(({ axis, itemId, confidence, detail }) => ({ axis, itemId, confidence, detail })),
  });

  const result = {
    ok: blocking.length === 0,
    blocking,
    advisory,
    findings,
    themeTags,
    wouldBlock: blocking.length,
  };

  _cache.set(hash, result);
  return result;
}

/** @deprecated use runSem2Judge — calibration alias */
export async function validatePartHolistic(part, opts = {}) {
  const r = await runSem2Judge(part, opts);
  return {
    ...r,
    partVerdict: r.ok ? (r.advisory?.length ? 'advise' : 'pass') : 'fail',
    adviseOnly: !!opts.adviseOnly,
  };
}

export function buildHolisticPromptForPart(part, opts = {}) {
  const ctx = extractPartContext(part);
  if (!ctx) return null;
  ctx.topicTag = opts.topicTag || part._requestedTopic || part.topicTag;
  return buildSem2Prompt(ctx, { topicTag: ctx.topicTag });
}

/** Full rubric prompt — calibration only (sem2-calibrate.mjs). */
export { buildSem2Prompt as buildHolisticJudgePrompt };
