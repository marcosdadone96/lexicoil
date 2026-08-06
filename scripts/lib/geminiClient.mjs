const DEFAULT_MODEL = 'gemini-2.5-flash';

import './ensureSystemCa.mjs';
import { acquire, DailyQuotaError, isDailyQuotaMessage } from './geminiRateLimit.mjs';
import { rethrowIfTlsIntercept } from './tlsFetchHint.mjs';

export { DailyQuotaError };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Like sleep(), but prints a countdown tick every 10 s so the operator can
 *  see the process is alive during long 503 backoff waits. */
async function sleepWithCountdown(totalMs, context) {
  const TICK_MS = 10_000;
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(TICK_MS, remaining);
    await sleep(chunk);
    remaining -= chunk;
    if (remaining > 0) {
      const sec = Math.ceil(remaining / 1000);
      process.stderr.write(`      ${context} — ${sec}s restantes…\n`);
    }
  }
}

function parseRetrySeconds(message) {
  const m = String(message || '').match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1])) + 2, 120);
  return 65;
}

export function geminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

export async function generateContent({
  prompt,
  apiKey,
  model,
  jsonMode = true,
  maxRetries = 3,
  max503Retries,
  maxTokens,
  temperature,
  thinkingConfig,
}) {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en .env');
  }

  const modelId = model || geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

  // Priority: explicit param > GEMINI_TEMPERATURE env var > default 0.4
  const resolvedTemp =
    temperature ??
    (process.env.GEMINI_TEMPERATURE ? Number(process.env.GEMINI_TEMPERATURE) : 0.4);

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: resolvedTemp,
      maxOutputTokens: maxTokens ?? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  };

  // max503Retries: cap for transient 5xx/503 retries (infrastructure errors).
  // maxRetries: cap for quality/format retries at caller level.
  // These are separate: a 503 should be retried many times without counting
  // against the caller's quality-retry budget.
  const effective503Retries = max503Retries != null ? max503Retries : Math.max(maxRetries, 5);

  let lastError;
  for (let attempt = 1; attempt <= effective503Retries; attempt++) {
    await acquire();

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      rethrowIfTlsIntercept(err);
    }

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

    if (res.status >= 500 && attempt < effective503Retries) {
      const waitSec = Math.min(15 * attempt, 60);
      const label = res.status === 503 ? 'Alta demanda (503)' : `Error ${res.status}`;
      console.warn(`\n⏳ Gemini ${label} — reintento en ${waitSec}s (${attempt}/${effective503Retries})…`);
      await sleepWithCountdown(waitSec * 1000, `reintento ${attempt + 1}/${effective503Retries}`);
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
