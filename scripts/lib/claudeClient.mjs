const DEFAULT_MODEL = 'claude-haiku-4-5';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(res, attempt) {
  const raw = res.headers?.get?.('retry-after');
  if (raw) {
    const sec = Number(raw);
    if (Number.isFinite(sec) && sec > 0) return Math.min(sec + Math.random(), 60);
  }
  return Math.min(2 ** attempt + Math.random(), 60);
}

export function genModel() {
  return (process.env.CLAUDE_GEN_MODEL || DEFAULT_MODEL).trim();
}

export async function generateContent({ prompt, apiKey, model, maxRetries = 4, maxTokens }) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('Falta ANTHROPIC_API_KEY en .env');
  }

  const modelId = model || genModel();
  const maxOut = maxTokens ?? Number(process.env.CLAUDE_MAX_OUTPUT_TOKENS || 8000);
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: modelId,
    max_tokens: maxOut,
    messages: [{ role: 'user', content: prompt }],
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 429 || res.status === 500 || res.status === 529) {
      const msg = data?.error?.message || res.statusText || `HTTP ${res.status}`;
      lastError = new Error(`Claude API ${res.status}: ${msg}`);
      if (attempt < maxRetries) {
        const waitSec = parseRetryAfter(res, attempt);
        console.warn(`\n⏳ Claude ${res.status} — reintento en ${waitSec.toFixed(1)}s (${attempt}/${maxRetries})…`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw lastError;
    }

    if (res.status === 401) {
      throw new Error('Claude API 401: clave inválida o sin permiso (ANTHROPIC_API_KEY)');
    }
    if (res.status === 400) {
      const msg = data?.error?.message || res.statusText || 'Bad request';
      throw new Error(`Claude API 400: ${msg}`);
    }
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText || 'Claude API error';
      throw new Error(`Claude API ${res.status}: ${msg}`);
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text.trim()) {
      throw new Error('Claude no devolvió texto');
    }

    return {
      text: text.trim(),
      model: modelId,
      usage: data.usage || {},
      stopReason: data.stop_reason || null,
      maxTokens: maxOut,
    };
  }

  throw lastError || new Error('Claude API: reintentos agotados');
}
