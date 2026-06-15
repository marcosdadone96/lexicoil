/**
 * Output token limits per batch job (Claude truncates at max_tokens → invalid JSON).
 */
const MODULE_MIN = {
  'lesen:1': 12288,
  'lesen:2': 16384,
  'lesen:3': 16384,
  'horen:2': 16384,
  'horen:3': 16384,
  'horen:4': 16384,
};

const ABS_MAX = 16384;

export function resolveMaxOutputTokens(provider, module, teil) {
  const mod = String(module || '').toLowerCase();
  const t = Number(String(teil ?? '').replace(/[^\d]/g, '')) || 0;
  const key = `${mod}:${t}`;
  const moduleMin = MODULE_MIN[key] || 0;

  const envDefault =
    provider === 'gemini'
      ? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192)
      : Number(process.env.CLAUDE_MAX_OUTPUT_TOKENS || 8000);

  const cap = Number(process.env.GEN_MAX_OUTPUT_TOKENS || 0);
  const base = cap > 0 ? cap : Math.max(envDefault, moduleMin);
  return Math.min(base, ABS_MAX);
}

export function isLikelyTruncated(provider, usage, maxTokens, stopReason) {
  if (stopReason === 'max_tokens') return true;
  const out =
    provider === 'gemini'
      ? Number(usage?.candidatesTokenCount || 0)
      : Number(usage?.output_tokens || 0);
  return out >= maxTokens - 16;
}
