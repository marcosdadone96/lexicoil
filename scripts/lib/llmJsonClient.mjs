/**
 * llmJsonClient.mjs — inferencia JSON barata para gates (Q2, Q3-B).
 * Pipeline por defecto: Gemini 2.5 Flash (sin Anthropic salvo override explícito).
 */
import { generateContent } from './geminiClient.mjs';

export const DEFAULT_PIPELINE_JSON_MODEL = 'gemini-2.5-flash';
/** @deprecated use DEFAULT_PIPELINE_JSON_MODEL — kept for tests importing DEFAULT_HAIKU_MODEL */
export const DEFAULT_HAIKU_MODEL = DEFAULT_PIPELINE_JSON_MODEL;

function resolveModel(explicit) {
  const raw = (explicit || process.env.Q2_ANSWER_KEY_MODEL || process.env.CLAUDE_GEN_MODEL || DEFAULT_PIPELINE_JSON_MODEL).trim();
  if (/^claude/i.test(raw) && String(process.env.SEMANTIC_USE_CLAUDE || '').trim() !== '1') {
    return DEFAULT_PIPELINE_JSON_MODEL;
  }
  return raw;
}

function isGeminiModel(model) {
  return /^gemini/i.test(model);
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<{ text: string, model: string, provider: string, usage?: { inputTokens: number, outputTokens: number } }>}
 */
export async function inferJsonResponse(opts) {
  const model = resolveModel(opts.model);
  const maxTokens = opts.maxTokens ?? 8192;
  const temperature = opts.temperature ?? 0.1;

  if (!isGeminiModel(model)) {
    throw new Error(
      `Modelo LLM «${model}» no soportado en pipeline (solo Gemini). ` +
        'Usa Q2_ANSWER_KEY_MODEL=gemini-2.5-flash o SEMANTIC_USE_CLAUDE=1 para legacy Anthropic.',
    );
  }

  const r = await generateContent({
    prompt: opts.prompt,
    model,
    jsonMode: true,
    temperature,
    maxTokens,
    maxRetries: 2,
  });
  return {
    text: r.text,
    model: r.model,
    provider: 'gemini',
    usage: r.usage
      ? {
          inputTokens: r.usage.promptTokenCount || r.usage.inputTokens || 0,
          outputTokens: r.usage.candidatesTokenCount || r.usage.outputTokens || 0,
        }
      : undefined,
  };
}
