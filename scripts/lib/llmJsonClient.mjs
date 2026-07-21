/**
 * llmJsonClient.mjs — inferencia JSON barata para gates (Q2, Q3-B).
 * Por defecto Anthropic Haiku; fallback Gemini si el modelo lo indica.
 */
import { generateContent } from './geminiClient.mjs';
import { rethrowIfTlsIntercept } from './tlsFetchHint.mjs';

export const DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5';

function resolveModel(explicit) {
  return (explicit || process.env.Q2_ANSWER_KEY_MODEL || process.env.CLAUDE_GEN_MODEL || DEFAULT_HAIKU_MODEL).trim();
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

  if (isGeminiModel(model)) {
    try {
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
    } catch (err) {
      if (!process.env.ANTHROPIC_API_KEY) throw err;
      // Gemini deprecado / no disponible → fallback Haiku
      return anthropicInfer({ prompt: opts.prompt, model: DEFAULT_HAIKU_MODEL, maxTokens, temperature });
    }
  }

  return anthropicInfer({ prompt: opts.prompt, model, maxTokens, temperature });
}

async function anthropicInfer({ prompt, model, maxTokens, temperature }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('Falta ANTHROPIC_API_KEY (o usa Q2_ANSWER_KEY_MODEL=gemini-… con GEMINI_API_KEY)');
  }

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    rethrowIfTlsIntercept(err);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'Anthropic API error';
    throw new Error(`Anthropic API ${res.status}: ${msg}`);
  }

  const text = (data.content || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Anthropic no devolvió texto');
  const usage = data.usage
    ? {
        inputTokens: Number(data.usage.input_tokens || 0),
        outputTokens: Number(data.usage.output_tokens || 0),
      }
    : undefined;
  return { text, model, provider: 'anthropic', usage };
}
