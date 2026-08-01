#!/usr/bin/env node
/**
 * Compare auth + planModule across apex vs www (no secrets in output).
 * Loads .env like post-deploy. Requires SMOKE_USER_EMAIL/PASSWORD.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeLogin } from './lib/smokeAuthLogin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const email = process.env.SMOKE_USER_EMAIL;
const password = process.env.SMOKE_USER_PASSWORD;
if (!email || !password) {
  console.error('Need SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD in .env');
  process.exit(1);
}

const M15_WORDS = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];

async function probeBase(base) {
  const row = { base, steps: {} };
  const origin = new URL(base).origin;

  const cfgUrl = `${base}/.netlify/functions/auth-config`;
  const cfgRes = await fetch(cfgUrl, { headers: { Accept: 'application/json', Origin: origin } });
  row.steps.authConfig = {
    requestUrl: cfgUrl,
    finalUrl: cfgRes.url,
    status: cfgRes.status,
    redirected: cfgRes.redirected,
  };
  const cfg = await cfgRes.json().catch(() => ({}));
  row.steps.authConfig.siteUrl = cfg.siteUrl;
  row.steps.authConfig.supabase = cfg.supabase;

  let login;
  try {
    login = await smokeLogin(base, { email, password, origin });
    row.steps.login = { ok: true, via: login.via, tokenLen: login.token?.length || 0 };
  } catch (e) {
    row.steps.login = { ok: false, error: e.message };
    return row;
  }

  // Re-run session POST to capture Set-Cookie shape (same host as base)
  const cfgRes2 = await fetch(`${base}/.netlify/functions/auth-config`);
  const cfg2 = await cfgRes2.json();
  if (cfg2.supabase && cfg2.supabaseUrl && cfg2.supabaseAnonKey) {
    const sbRes = await fetch(`${String(cfg2.supabaseUrl).replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg2.supabaseAnonKey,
        Authorization: `Bearer ${cfg2.supabaseAnonKey}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const sbData = await sbRes.json();
    const sessRes = await fetch(`${base}/.netlify/functions/auth-supabase-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin },
      body: JSON.stringify({ access_token: sbData.access_token }),
    });
    row.steps.authSupabaseSession = {
      status: sessRes.status,
      setCookie: sessRes.headers.get('set-cookie') || '(none)',
      tokenInBody: !!(await sessRes.clone().json().catch(() => ({}))).token,
    };
  }

  const params = new URLSearchParams({
    planModule: '1',
    lang: 'de',
    level: 'B1',
    module: 'horen',
    words: M15_WORDS.join(','),
    assembleMode: 'practice',
    topicTag: 'Bildung',
  });
  const planUrl = `${base}/.netlify/functions/exam-part?${params}`;
  const planRes = await fetch(planUrl, {
    headers: {
      Accept: 'application/json',
      Origin: origin,
      Authorization: `Bearer ${login.token}`,
    },
  });
  const planText = await planRes.text();
  let planJson;
  try {
    planJson = JSON.parse(planText);
  } catch {
    planJson = { _raw: planText.slice(0, 200) };
  }
  row.steps.planModule = {
    requestUrl: planUrl.split('?')[0] + '?…',
    finalUrl: planRes.url.replace(/\?.*$/, '?…'),
    status: planRes.status,
    redirected: planRes.redirected,
    originSent: origin,
    error: planJson.error,
    ok: planJson.ok,
    decision: planJson.decision,
  };

  return row;
}

async function headRedirect(url) {
  const res = await fetch(url, { redirect: 'manual' });
  return { url, status: res.status, location: res.headers.get('location') };
}

console.log('=== Redirect probes (functions path) ===');
for (const u of [
  'https://lexicoil.com/.netlify/functions/auth-config',
  'https://www.lexicoil.com/.netlify/functions/auth-config',
  'https://lexicoil.com/.netlify/functions/exam-part?planModule=1',
  'https://www.lexicoil.com/.netlify/functions/exam-part?planModule=1',
]) {
  console.log(JSON.stringify(await headRedirect(u)));
}

console.log('\n=== Full auth + planModule (apex) ===');
console.log(JSON.stringify(await probeBase('https://lexicoil.com'), null, 2));

console.log('\n=== Full auth + planModule (www) ===');
console.log(JSON.stringify(await probeBase('https://www.lexicoil.com'), null, 2));
