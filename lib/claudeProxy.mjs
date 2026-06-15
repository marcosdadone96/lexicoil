// ??? LexiCoil  claudeProxy.mjs ???????????????????????????????????????????????
// Proxy to Anthropic API with server-side quota enforcement.
// Quota is checked and incremented here  the client cannot bypass it.
// ??????????????????????????????????????????????????????????????????????????????

import crypto from 'crypto';

const DEFAULT_MODEL   = 'claude-sonnet-4-5';
const MAX_PROMPT_LEN  = 16000;
const MAX_TOKENS      = 8000;

// ?? Plan limits ??????????????????????????????????????????????????????????????
const GUEST_MAX = 2;   // lifetime (per IP, 30-day rolling)
const FREE_MAX  = 5;   // per calendar month
const PRO_MAX   = 12;  // per calendar month

const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

// ?? Allowed origins ??????????????????????????????????????????????????????????
const DEFAULT_ORIGINS = [
  'https://www.lexicoil.com',
  'https://lexicoil.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

export class ClaudeProxyError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

// ?? Helpers ??????????????????????????????????????????????????????????????????

function allowedOrigins() {
  const extra = (process.env.LEXICOIL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function corsHeaders(origin) {
  const allowed  = allowedOrigins();
  const isPreview = origin && origin.includes('.netlify.app');
  const match    = (origin && (allowed.includes(origin) || isPreview)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin':  match,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function parseBody(raw, isBase64Encoded) {
  let text = raw || '';
  if (isBase64Encoded && typeof text === 'string') {
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new ClaudeProxyError(400, 'Invalid JSON body');
  }
}

function getJwtSecret() {
  return process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || null;
}

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function hashIp(ip) {
  const salt = getJwtSecret() || 'lexicoil-guest-salt';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}

function getClientIp(event) {
  const fwd =
    (event.headers &&
      (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'])) || '';
  return String(fwd).split(',')[0].trim() || 'unknown';
}

// Simple HS256 JWT verify (mirrors jwt.js in functions/lib)
function verifyJwtPayload(token) {
  const secret = getJwtSecret();
  if (!secret || !token) return null;
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const sig     = crypto
      .createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    const valid   = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]));
    if (!valid) return null;
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (payload.typ !== 'lc-auth') return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearer(event) {
  const raw =
    (event.headers &&
      (event.headers.authorization || event.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw));
  return m ? m[1].trim() : '';
}

// ?? Quota helpers (ESM  cannot require quotaLib which is CJS) ????????????????

async function getBlobStore(event) {
  // Dynamic import so this file stays pure ESM
  const { connectLambda, getStore } = await import('@netlify/blobs');
  connectLambda(event);
  return getStore('lexicoil-data');
}

async function getQuotaInfo(event) {
  const token   = getBearer(event);
  const payload = token ? verifyJwtPayload(token) : null;

  if (payload && payload.sub) {
    // ?? Authenticated user ?????????????????????????????????????????????????
    const email = String(payload.sub).trim().toLowerCase();
    const store = await getBlobStore(event);
    let user = null;
    try { user = await store.get(`user:${email}`, { type: 'json' }); } catch (_) {}
    if (!user) return { ok: false, status: 401, error: 'unauthorized' };

    const plan  = user.pro || user.plan === 'pro' ? 'pro' : 'free';
    const max   = plan === 'pro' ? PRO_MAX : FREE_MAX;
    const month = getMonthKey();
    let used = 0;
    try {
      const q = await store.get(`quota:${email}`, { type: 'json' });
      if (q && q.month === month) used = Number(q.used) || 0;
    } catch (_) {}

    return { ok: true, authenticated: true, email, plan, used, max, month, store };
  }

  // ?? Guest (IP-based) ???????????????????????????????????????????????????????
  const ipHash = hashIp(getClientIp(event));
  const gKey   = `guest_quota:${ipHash}`;
  const store  = await getBlobStore(event);
  let used = 0;
  let expiresAt = 0;
  try {
    const g = await store.get(gKey, { type: 'json' });
    if (g) {
      expiresAt = g.expiresAt || 0;
      used = (expiresAt && Date.now() > expiresAt) ? 0 : (Number(g.used) || 0);
    }
  } catch (_) {}

  return {
    ok: true, authenticated: false, plan: 'guest',
    used, max: GUEST_MAX, store, gKey, ipHash, expiresAt,
  };
}

async function incrementQuota(info) {
  const newUsed = info.used + 1;
  if (info.authenticated) {
    await info.store.setJSON(`quota:${info.email}`, { used: newUsed, month: info.month });
  } else {
    await info.store.setJSON(info.gKey, {
      used: newUsed,
      createdAt: Date.now(),
      expiresAt: info.expiresAt || Date.now() + GUEST_TTL_MS,
    });
  }
  return newUsed;
}

// ?? Core Claude call ??????????????????????????????????????????????????????????

export async function runClaudeChat(body, event) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeProxyError(503, 'AI service is not configured on the server');
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) throw new ClaudeProxyError(400, 'prompt is required');
  if (prompt.length > MAX_PROMPT_LEN) {
    throw new ClaudeProxyError(400, `prompt exceeds ${MAX_PROMPT_LEN} characters`);
  }

  // ?? Check quota (skip if consumeQuota === false, e.g. speaking eval) ???????
  const skipQuota = body.consumeQuota === false;
  let quotaInfo   = null;

  if (!skipQuota && event) {
    quotaInfo = await getQuotaInfo(event);

    if (!quotaInfo.ok) {
      throw new ClaudeProxyError(quotaInfo.status || 403, quotaInfo.error || 'unauthorized');
    }

    if (quotaInfo.used >= quotaInfo.max) {
      throw new ClaudeProxyError(429, 'quota_exceeded', {
        code:  'quota_exceeded',
        used:  quotaInfo.used,
        max:   quotaInfo.max,
        plan:  quotaInfo.plan,
      });
    }
  }

  // ?? Call Anthropic ????????????????????????????????????????????????????????
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 6000, 1), MAX_TOKENS);
  const model     =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : process.env.CLAUDE_MODEL || DEFAULT_MODEL;

  // Sanitize model string  reject obviously wrong values
  const ALLOWED_MODEL_PREFIXES = ['claude-'];
  const safeModel = ALLOWED_MODEL_PREFIXES.some(p => model.startsWith(p))
    ? model
    : DEFAULT_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: safeModel,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data.error?.message || data.error?.type || 'Anthropic API request failed';
    const errCode = data.error?.type || 'api_error';
    // Log to help debugging (visible in Netlify function logs)
    console.error('[claude-chat] Anthropic error:', res.status, errCode, errMsg);
    throw new ClaudeProxyError(
      res.status >= 500 ? 502 : res.status,
      errMsg,
      { anthropicCode: errCode },
    );
  }

  // ?? Increment quota after successful call ?????????????????????????????????
  let newUsed = quotaInfo ? quotaInfo.used : 0;
  if (!skipQuota && quotaInfo) {
    try { newUsed = await incrementQuota(quotaInfo); } catch (_) {}
  }

  const text = (data.content || []).map((part) => part.text || '').join('');
  return {
    text,
    usage: data.usage || null,
    // Return quota info to the client so it can update the UI
    used:  !skipQuota && quotaInfo ? newUsed         : undefined,
    max:   !skipQuota && quotaInfo ? quotaInfo.max   : undefined,
    plan:  !skipQuota && quotaInfo ? quotaInfo.plan  : undefined,
  };
}

// ?? HTTP handler (local dev server) ??????????????????????????????????????????

export async function handleClaudeHttpRequest(req, res, bodyOverride) {
  const origin = req.headers.origin || '';
  const cors   = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = bodyOverride ?? parseBody(await readRequestBody(req), false);
    // In local dev, quota enforcement is skipped (no Netlify Blobs)
    const result = await runClaudeChat(body, null);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    const status  = err instanceof ClaudeProxyError ? err.statusCode : 500;
    const message = err instanceof ClaudeProxyError ? err.message    : 'Internal server error';
    const extra   = err.code === 'quota_exceeded'
      ? { code: err.code, used: err.used, max: err.max, plan: err.plan }
      : {};
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message, ...extra }));
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ?? Netlify Lambda handler ????????????????????????????????????????????????????

export async function handleClaudeLambdaEvent(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const cors   = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body   = parseBody(event.body, event.isBase64Encoded);
    const result = await runClaudeChat(body, event);
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    const status  = err instanceof ClaudeProxyError ? err.statusCode : 500;
    const message = err instanceof ClaudeProxyError ? err.message    : 'Internal server error';
    const extra   = err.code === 'quota_exceeded'
      ? { code: err.code, used: err.used, max: err.max, plan: err.plan }
      : {};
    return {
      statusCode: status,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message, ...extra }),
    };
  }
}
