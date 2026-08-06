/**
 * Persistent Gemini generation cost log (JSONL).
 * Path: batches/ready/gate-logs/generation-cost.jsonl
 *
 * Prices (Gemini 2.5 Flash, confirmed session rates):
 *   input  $0.30 / 1M tokens
 *   output $2.50 / 1M tokens  (candidates + thoughts — thinking billed as output)
 *
 * Gemini 2.5 Flash exposes thoughtsTokenCount separately from candidatesTokenCount
 * when thinking is enabled; both are recorded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';

export const GENERATION_COST_LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/generation-cost.jsonl',
);

/** USD per 1M tokens — Gemini 2.5 Flash (paid tier rates used in session cost analysis). */
export const GEMINI_PRICE_INPUT_PER_M = 0.3;
export const GEMINI_PRICE_OUTPUT_PER_M = 2.5;

/** Cached input tokens billed at 10% of standard input rate (90% implicit-cache discount). */
export const GEMINI_PRICE_CACHED_INPUT_PER_M = GEMINI_PRICE_INPUT_PER_M * 0.1;

export function parseUsageMetadata(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokens: 0,
      candidatesTokens: 0,
      thoughtsTokens: 0,
      cachedContentTokenCount: 0,
      totalTokens: 0,
      outputTokensBilled: 0,
    };
  }
  const promptTokens = Number(
    usage.promptTokenCount ?? usage.promptTokens ?? usage.input_tokens ?? 0,
  ) || 0;
  const candidatesTokens = Number(
    usage.candidatesTokenCount ?? usage.candidatesTokens ?? usage.output_tokens ?? 0,
  ) || 0;
  const thoughtsTokens = Number(
    usage.thoughtsTokenCount ?? usage.thoughtsTokens ?? 0,
  ) || 0;
  const cachedContentTokenCount = Math.min(
    Number(
      usage.cachedContentTokenCount ??
        usage.totalCachedTokens ??
        usage.cached_content_token_count ??
        0,
    ) || 0,
    promptTokens,
  );
  const totalTokens =
    Number(usage.totalTokenCount ?? usage.totalTokens ?? 0) ||
    promptTokens + candidatesTokens + thoughtsTokens;
  // Thinking tokens are billed as output (same $/M as candidates).
  const outputTokensBilled = candidatesTokens + thoughtsTokens;
  return {
    promptTokens,
    candidatesTokens,
    thoughtsTokens,
    cachedContentTokenCount,
    totalTokens,
    outputTokensBilled,
  };
}

export function costUsdFromTokens(promptTokens, outputTokensBilled, cachedContentTokenCount = 0) {
  const prompt = Number(promptTokens) || 0;
  const cached = Math.min(Number(cachedContentTokenCount) || 0, prompt);
  const uncached = Math.max(0, prompt - cached);
  const input =
    (uncached / 1e6) * GEMINI_PRICE_INPUT_PER_M +
    (cached / 1e6) * GEMINI_PRICE_CACHED_INPUT_PER_M;
  const output = (Number(outputTokensBilled) || 0) / 1e6 * GEMINI_PRICE_OUTPUT_PER_M;
  return Number((input + output).toFixed(8));
}

/** Input-token savings vs billing every prompt token at full input rate. */
export function cachedInputSavingsUsd(promptTokens, cachedContentTokenCount) {
  const prompt = Number(promptTokens) || 0;
  const cached = Math.min(Number(cachedContentTokenCount) || 0, prompt);
  if (!cached) return 0;
  const fullRate = (cached / 1e6) * GEMINI_PRICE_INPUT_PER_M;
  const cachedRate = (cached / 1e6) * GEMINI_PRICE_CACHED_INPUT_PER_M;
  return Number((fullRate - cachedRate).toFixed(8));
}

function newCallId() {
  return `gc_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

/**
 * Queue one API call on the session (written on flush with part outcome).
 * @param {object} session
 * @param {object|null} usage — Gemini usageMetadata
 * @param {object} [ctx]
 */
export function trackGenerationCostPending(session, usage, ctx = {}) {
  if (!session) return null;
  const parsed = parseUsageMetadata(usage);
  const entry = {
    callId: newCallId(),
    ts: new Date().toISOString(),
    module: ctx.module || session.module || null,
    teil: ctx.teil ?? session.teil ?? null,
    topic: ctx.topic || ctx._resolvedTopic || null,
    model: ctx.model || session.model || null,
    promptTokens: parsed.promptTokens,
    candidatesTokens: parsed.candidatesTokens,
    thoughtsTokens: parsed.thoughtsTokens,
    cachedContentTokenCount: parsed.cachedContentTokenCount,
    totalTokens: parsed.totalTokens,
    outputTokensBilled: parsed.outputTokensBilled,
    costUsd: costUsdFromTokens(
      parsed.promptTokens,
      parsed.outputTokensBilled,
      parsed.cachedContentTokenCount,
    ),
    cachedInputSavingsUsd: cachedInputSavingsUsd(
      parsed.promptTokens,
      parsed.cachedContentTokenCount,
    ),
    priceInputPerM: GEMINI_PRICE_INPUT_PER_M,
    priceOutputPerM: GEMINI_PRICE_OUTPUT_PER_M,
  };
  if (!session._costLogPending) session._costLogPending = [];
  session._costLogPending.push(entry);
  return entry;
}

/**
 * Append pending API calls to disk with part-level outcome.
 * @param {object} session
 * @param {{ ok: boolean, file?: string|null, failReason?: string|null, failGate?: string|null, module?: string, teil?: number, topic?: string }} outcome
 */
export function flushGenerationCostLog(session, outcome = {}) {
  const pending = session?._costLogPending;
  if (!pending?.length) return [];
  const written = [];
  fs.mkdirSync(path.dirname(GENERATION_COST_LOG), { recursive: true });
  for (const entry of pending) {
    const line = {
      ...entry,
      module: outcome.module ?? entry.module,
      teil: outcome.teil ?? entry.teil,
      topic: outcome.topic ?? entry.topic,
      ok: outcome.ok === true,
      file: outcome.file || null,
      failReason: outcome.ok ? null : outcome.failReason || null,
      failGate: outcome.ok ? null : outcome.failGate || null,
      flushedAt: new Date().toISOString(),
    };
    fs.appendFileSync(GENERATION_COST_LOG, `${JSON.stringify(line)}\n`, 'utf8');
    written.push(line);
  }
  session._costLogPending = [];
  return written;
}

export function readGenerationCostLog(logPath = GENERATION_COST_LOG) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Format USD for CLI tables (4 decimals below $1, else 2). */
export function formatCostUsd(usd) {
  const n = Number(usd) || 0;
  if (n === 0) return '$0.0000';
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * Sum API cost for one cell run (module+teil) since an ISO timestamp.
 * @param {object[]} entries — from readGenerationCostLog()
 * @param {string} sinceIso
 * @param {string} module
 * @param {number} teil
 */
export function sumCellCostSince(entries, sinceIso, module, teil) {
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since)) return 0;
  const mod = String(module || '').toLowerCase();
  const t = Number(teil);
  let total = 0;
  for (const e of entries) {
    if (String(e.module || '').toLowerCase() !== mod) continue;
    if (Number(e.teil) !== t) continue;
    const ts = Date.parse(e.flushedAt || e.ts || 0);
    if (!Number.isFinite(ts) || ts < since) continue;
    total += Number(e.costUsd) || 0;
  }
  return Number(total.toFixed(8));
}

export function summarizeGenerationCost(entries) {
  const byModuleTeil = {};
  let totalCost = 0;
  let totalPrompt = 0;
  let totalCandidates = 0;
  let totalThoughts = 0;
  let okCalls = 0;
  let failCalls = 0;
  let okCost = 0;
  let failCost = 0;
  const byFile = new Map();

  for (const e of entries) {
    const cost = Number(e.costUsd) || 0;
    totalCost += cost;
    totalPrompt += Number(e.promptTokens) || 0;
    totalCandidates += Number(e.candidatesTokens) || 0;
    totalThoughts += Number(e.thoughtsTokens) || 0;
    if (e.ok) {
      okCalls += 1;
      okCost += cost;
    } else {
      failCalls += 1;
      failCost += cost;
    }
    const key = `${e.module || '?'}-t${e.teil ?? '?'}`;
    if (!byModuleTeil[key]) {
      byModuleTeil[key] = { calls: 0, ok: 0, fail: 0, costUsd: 0, promptTokens: 0, outputTokensBilled: 0 };
    }
    const b = byModuleTeil[key];
    b.calls += 1;
    if (e.ok) b.ok += 1;
    else b.fail += 1;
    b.costUsd += cost;
    b.promptTokens += Number(e.promptTokens) || 0;
    b.outputTokensBilled += Number(e.outputTokensBilled) || 0;

    if (e.file) {
      const f = byFile.get(e.file) || { file: e.file, ok: !!e.ok, costUsd: 0, calls: 0 };
      f.calls += 1;
      f.costUsd += cost;
      f.ok = f.ok || !!e.ok;
      byFile.set(e.file, f);
    }
  }

  const calls = entries.length;
  for (const k of Object.keys(byModuleTeil)) {
    byModuleTeil[k].costUsd = Number(byModuleTeil[k].costUsd.toFixed(8));
  }

  return {
    calls,
    okCalls,
    failCalls,
    successRate: calls ? okCalls / calls : 0,
    totalCostUsd: Number(totalCost.toFixed(8)),
    okCostUsd: Number(okCost.toFixed(8)),
    failCostUsd: Number(failCost.toFixed(8)),
    promptTokens: totalPrompt,
    candidatesTokens: totalCandidates,
    thoughtsTokens: totalThoughts,
    byModuleTeil,
    files: [...byFile.values()],
  };
}
