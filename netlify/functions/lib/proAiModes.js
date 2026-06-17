'use strict';

const { getQuotaState } = require('./quotaLib.js');

/** Extract first JSON object from AI text (no logging of content). */
function extractJsonObject(raw) {
  let s = String(raw || '').replace(/```json\s*|```/gi, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  s = s.slice(start);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(0, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function certName(lang) {
  if (lang === 'de') return 'Goethe-Zertifikat';
  if (lang === 'es') return 'DELE';
  return 'Cambridge English';
}

async function requireProPlan(event) {
  const state = await getQuotaState(event);
  if (!state.ok) {
    if (state.error === 'token_revoked') {
      return { ok: false, status: 401, error: 'token_revoked' };
    }
    return { ok: false, status: 401, error: 'login_required' };
  }
  if (!state.authenticated) {
    return { ok: false, status: 401, error: 'login_required' };
  }
  if (state.plan !== 'pro') {
    return { ok: false, status: 403, error: 'pro_only', plan: state.plan };
  }
  return { ok: true, plan: state.plan };
}

async function callAnthropicJson(apiKey, { model, maxTokens, system, userContent }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : '') ||
      `Anthropic API error (${res.status})`;
    throw new Error(msg);
  }
  const text = (data.content || []).map((part) => part.text || '').join('');
  return { text, usage: data.usage || null };
}

module.exports = {
  extractJsonObject,
  certName,
  requireProPlan,
  callAnthropicJson,
};
