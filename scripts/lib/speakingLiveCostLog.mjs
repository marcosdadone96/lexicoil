/**
 * Persistent Gemini Live (Sprechen voice) cost log (JSONL).
 * Path: batches/ready/gate-logs/speaking-live-cost.jsonl
 *
 * Prices (gemini-*-flash-live*, paid-tier listed rates used for paidEquivalent):
 *   audio/input  $3.00 / 1M tokens
 *   audio/output $12.00 / 1M tokens
 *
 * Free tier for Live preview models is often $0 charged; we still record
 * paidEquivalentUsd from tokens so lab sessions are comparable.
 *
 * Pattern mirrors generationCostLog.mjs (content generation).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from './loadEnv.mjs';

export const SPEAKING_LIVE_COST_LOG = path.join(
  ROOT,
  'batches/ready/gate-logs/speaking-live-cost.jsonl',
);

/** USD per 1M tokens — Live native audio (paid listed rates). */
export const LIVE_PRICE_INPUT_PER_M = 3;
export const LIVE_PRICE_OUTPUT_PER_M = 12;

export function parseLiveUsageMetadata(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
      raw: null,
    };
  }
  const promptTokens =
    Number(usage.promptTokenCount ?? usage.promptTokens ?? usage.input_tokens ?? 0) || 0;
  const responseTokens =
    Number(
      usage.responseTokenCount ??
        usage.candidatesTokenCount ??
        usage.responseTokens ??
        usage.output_tokens ??
        0,
    ) || 0;
  const totalTokens =
    Number(usage.totalTokenCount ?? usage.totalTokens ?? 0) ||
    promptTokens + responseTokens;
  return { promptTokens, responseTokens, totalTokens, raw: usage };
}

export function liveCostUsdFromTokens(promptTokens, responseTokens) {
  const input = ((Number(promptTokens) || 0) / 1e6) * LIVE_PRICE_INPUT_PER_M;
  const output = ((Number(responseTokens) || 0) / 1e6) * LIVE_PRICE_OUTPUT_PER_M;
  return Number((input + output).toFixed(8));
}

function newSessionCostId() {
  return `slc_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

/**
 * Append one finalized Live lab/production session cost line.
 * @param {object} opts
 * @returns {object} written entry
 */
export function appendSpeakingLiveCostLog(opts = {}) {
  const parsed = parseLiveUsageMetadata(opts.usageMetadata);
  const hasUsage = !!(opts.usageMetadata && parsed.totalTokens > 0);
  const paidEquivalentUsd = liveCostUsdFromTokens(parsed.promptTokens, parsed.responseTokens);
  const entry = {
    id: newSessionCostId(),
    ts: new Date().toISOString(),
    source: opts.source || 'lab-mic',
    sessionId: opts.sessionId || null,
    closeReason: opts.closeReason || null,
    model: opts.model || null,
    durationMs: opts.durationMs ?? null,
    turnCount: opts.turnCount ?? null,
    pcmBytesIn: opts.pcmBytesIn ?? null,
    pcmBytesOut: opts.pcmBytesOut ?? null,
    promptTokens: parsed.promptTokens,
    responseTokens: parsed.responseTokens,
    totalTokens: parsed.totalTokens,
    usageMetadata: parsed.raw,
    usageCaptured: hasUsage,
    priceInputPerM: LIVE_PRICE_INPUT_PER_M,
    priceOutputPerM: LIVE_PRICE_OUTPUT_PER_M,
    // Listed free-tier charge for preview Live is often $0; still log paid equivalent.
    chargedThisCallUsd: opts.chargedThisCallUsd ?? 0,
    paidEquivalentUsd,
    sessionLogFile: opts.sessionLogFile || null,
    note: hasUsage
      ? null
      : 'No usageMetadata from Live WS — cost unknown for this session',
  };
  fs.mkdirSync(path.dirname(SPEAKING_LIVE_COST_LOG), { recursive: true });
  fs.appendFileSync(SPEAKING_LIVE_COST_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}
