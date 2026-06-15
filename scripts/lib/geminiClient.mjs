const DEFAULT_MODEL = 'gemini-2.5-flash';

import { acquire, DailyQuotaError, isDailyQuotaMessage } from './geminiRateLimit.mjs';

export { DailyQuotaError };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetrySeconds(message) {
  const m = String(message || '').match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1])) + 2, 120);
  return 65;
}

export function geminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

export async function generateContent({ prompt, apiKey, model, jsonMode = true, maxRetries = 3, maxTokens }) {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en .env');
  }

  const modelId = model || geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: maxTokens ?? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await acquire();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      const msg = data?.error?.message || 'Quota exceeded';
      if (isDailyQuotaMessage(msg)) {
        throw new DailyQuotaError(
          `Límite diario de Gemini alcanzado: ${msg}\nReanuda mañana (medianoche PT).`,
        );
      }
      const waitSec = parseRetrySeconds(msg);
      lastError = new Error(`Gemini API 429: ${msg}`);
      if (attempt < maxRetries) {
        console.warn(`\n⏳ Rate limit — esperando ${waitSec}s (${attempt}/${maxRetries})…`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw new Error(
        `${lastError.message}\n\nSugerencias:\n` +
          '  • El limitador global ya regula RPM; espera y reintenta\n' +
          '  • npm run gemini:doctor — peticiones restantes hoy\n' +
          '  • GEMINI_MODEL=gemini-2.5-flash-lite (más cupo diario)\n' +
          '  • Revisa cuota en https://aistudio.google.com/',
      );
    }

    if (res.status >= 500 && attempt < maxRetries) {
      const waitSec = Math.min(15 * attempt, 60);
      console.warn(`\n⏳ Error ${res.status} — reintento en ${waitSec}s…`);
      await sleep(waitSec * 1000);
      continue;
    }

    if (!res.ok) {
      const msg = data?.error?.message || res.statusText || 'Gemini API error';
      throw new Error(`Gemini API ${res.status}: ${msg}`);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('\n').trim();
    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || 'unknown';
      throw new Error(`Gemini no devolvió texto (finishReason=${reason})`);
    }

    return { text, model: modelId, usage: data?.usageMetadata, maxTokens: body.generationConfig.maxOutputTokens };
  }

  throw lastError || new Error('Gemini API: reintentos agotados');
}
