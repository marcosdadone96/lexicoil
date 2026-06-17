#!/usr/bin/env node
/** Inspect ANTHROPIC_API_KEY from .env file vs process.env (no full secrets printed). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');

function fp(v) {
  if (!v) return '(empty)';
  return `${v.slice(0, 8)}…${v.slice(-4)} (len=${v.length})`;
}

function classify(v) {
  if (!v) return 'missing';
  if (v.startsWith('sk-ant-')) return 'anthropic-ok';
  if (v.startsWith('eyJ')) return 'jwt-wrong';
  return 'unknown-format';
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
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
    out[k] = v;
  }
  return out;
}

const fileVars = parseEnvFile(envPath);
const fileKey = fileVars.ANTHROPIC_API_KEY || '';
const procKey = process.env.ANTHROPIC_API_KEY || '';

console.log('--- ANTHROPIC_API_KEY sources ---\n');
console.log('.env path:', envPath, fs.existsSync(envPath) ? 'exists' : 'MISSING');
console.log('.env file value:', fp(fileKey), '→', classify(fileKey));

const dupes = Object.entries(fileVars).filter(([k]) => /anthropic|claude.*key/i.test(k));
if (dupes.length > 1) {
  console.log('\nOther anthropic-related keys in .env:');
  for (const [k, v] of dupes) console.log(`  ${k}:`, fp(v), '→', classify(v));
}

console.log('\nprocess.env.ANTHROPIC_API_KEY:', fp(procKey), '→', classify(procKey));
if (fileKey && procKey && fileKey !== procKey) {
  console.log('\n⚠ MISMATCH: .env and process.env differ (Netlify CLI likely injected remote env).');
}

const allLines = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.includes('ANTHROPIC'))
  : [];
if (allLines.length > 1) {
  console.log('\n⚠ Multiple ANTHROPIC lines in .env:');
  allLines.forEach((l, i) => console.log(`  [${i + 1}]`, l.split('=')[0]));
}

console.log('\nNETLIFY_DEV:', process.env.NETLIFY_DEV || '(unset)');
console.log('CONTEXT:', process.env.CONTEXT || '(unset)');
