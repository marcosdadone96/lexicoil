/**
 * Smoke / post-deploy login — same path as web Auth.login when Supabase is enabled.
 *
 * Web (authClient.js): supabase.auth.signInWithPassword → auth-supabase-session
 * Legacy blob-only sites: auth-login (bcrypt on Netlify Blobs)
 */

/**
 * @param {string} baseUrl
 * @param {{ email: string, password: string, origin?: string }} creds
 * @returns {Promise<{ token: string, user: object, via: 'supabase'|'legacy' }>}
 */
export async function smokeLogin(baseUrl, creds) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const origin = creds.origin || (() => {
    try {
      return new URL(base).origin;
    } catch {
      return base;
    }
  })();
  const email = String(creds.email || '').trim().toLowerCase();
  const password = String(creds.password || '');
  if (!email || !password) {
    throw new Error('smokeLogin: email and password required');
  }

  const fn = (path, init = {}) => {
    const url = `${base}/.netlify/functions/${path}`;
    const headers = {
      Accept: 'application/json',
      Origin: origin,
      ...(init.headers || {}),
    };
    return fetch(url, { ...init, headers });
  };

  const cfgRes = await fn('auth-config');
  const cfg = await cfgRes.json().catch(() => ({}));
  if (!cfgRes.ok) {
    throw new Error(`auth-config failed (${cfgRes.status})`);
  }

  // Web + smoke: password login via auth-login (server handles Blobs + Supabase).
  const legRes = await fn('auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const legData = await legRes.json().catch(() => ({}));
  if (!legRes.ok || !legData.token) {
    throw new Error(`auth-login failed (${legRes.status}): ${legData.error || 'no token'}`);
  }
  return { token: legData.token, user: legData.user, via: 'server-login' };
}

/**
 * Demonstrate why legacy auth-login returns bad_credentials for Supabase-only users.
 */
export async function diagnoseLoginMismatch(baseUrl, email) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const em = String(email || '').trim().toLowerCase();
  const cfgRes = await fetch(`${base}/.netlify/functions/auth-config`);
  const cfg = await cfgRes.json();
  const legRes = await fetch(`${base}/.netlify/functions/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: new URL(base).origin,
    },
    body: JSON.stringify({ email: em, password: '__probe_invalid__' }),
  });
  const legData = await legRes.json().catch(() => ({}));
  return {
    authConfig: {
      supabase: cfg.supabase,
      enabled: cfg.enabled,
      siteUrl: cfg.siteUrl,
    },
    legacyAuthLoginProbe: {
      url: `${base}/.netlify/functions/auth-login`,
      status: legRes.status,
      error: legData.error,
      note:
        'Supabase users have no passwordHash in Blobs; invalid password and missing blob both return bad_credentials',
    },
    webLoginPath: 'POST auth-login (server-side Blobs + Supabase fallback)',
    supabaseClientEnabled: cfg.supabase,
  };
}
