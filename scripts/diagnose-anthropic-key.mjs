#!/usr/bin/env node
/** Local Anthropic key diagnostic — never prints the full key. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');

function loadDotEnv() {
  if (!fs.existsSync(envPath)) {
    console.log('FAIL  .env not found at', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnv();

const rawKey = String(process.env.ANTHROPIC_API_KEY || '');
const key = rawKey.trim();

console.log('--- Anthropic key diagnostic ---');
console.log('env file:', envPath, fs.existsSync(envPath) ? 'OK' : 'MISSING');
console.log('ANTHROPIC_API_KEY set:', key.length > 0);
console.log('length:', key.length, key.length >= 40 ? '(OK)' : '(suspicious — too short?)');
console.log('prefix:', key.slice(0, 12) + (key.length > 12 ? '…' : ''));
console.log('starts with sk-ant-:', key.startsWith('sk-ant-'));
console.log('looks like JWT (eyJ...):', key.startsWith('eyJ'));
console.log('has leading/trailing whitespace in raw:', rawKey !== rawKey.trim());
console.log('has embedded CR/LF:', /[\r\n]/.test(key));

if (key.startsWith('eyJ')) {
  console.log('\nFAIL  ANTHROPIC_API_KEY is a JWT — wrong variable pasted.');
  console.log('      Use sk-ant-... from console.anthropic.com, not Supabase/service keys.');
  process.exit(1);
}
if (key && !key.startsWith('sk-ant-')) {
  console.log('\nFAIL  ANTHROPIC_API_KEY must start with sk-ant-');
  process.exit(1);
}

if (!key) {
  console.log('\nFix: add ANTHROPIC_API_KEY=sk-ant-... to .env (no quotes needed)');
  process.exit(1);
}

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'Reply with OK only.' }],
  }),
});

const data = await res.json().catch(() => ({}));
console.log('\nAPI test status:', res.status, res.ok ? 'OK' : 'FAILED');
if (!res.ok) {
  console.log('API message:', data?.error?.message || data?.error || '(unknown)');
  console.log('\nIf Invalid x-api-key:');
  console.log('  1. Create a NEW key at console.anthropic.com → API Keys');
  console.log('  2. Paste into .env as ANTHROPIC_API_KEY=sk-ant-... (one line, no quotes)');
  console.log('  3. Stop and restart npm run dev (netlify dev caches env on start)');
  console.log('  4. If site is netlify link-ed, run: netlify env:list — remote may override .env');
  process.exit(1);
}
console.log('API response OK — key works from this machine.');
