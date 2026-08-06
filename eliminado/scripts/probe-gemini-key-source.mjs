#!/usr/bin/env node
/** Compare GEMINI_API_KEY source (no full key printed). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { createRequire } from 'node:module';

loadEnvFile();
const require = createRequire(import.meta.url);
const { readGeminiKey } = require(path.join(ROOT, 'netlify/functions/lib/geminiLiveAuth.js'));

function fp(k) {
  if (!k) return '(empty)';
  return `${k.slice(0, 8)}…${k.slice(-4)} (len=${k.length})`;
}

function readFileKey() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return '';
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('GEMINI_API_KEY=')) {
      let v = t.slice('GEMINI_API_KEY='.length).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return '';
}

const envKey = process.env.GEMINI_API_KEY || '';
const fileKey = readFileKey();
const resolved = readGeminiKey();

console.log('NETLIFY_DEV:', process.env.NETLIFY_DEV || '(not set)');
console.log('process.env.GEMINI_API_KEY:', fp(envKey));
console.log('.env GEMINI_API_KEY:      ', fp(fileKey));
console.log('readGeminiKey() resolves: ', fp(resolved));
console.log('env vs file match:', envKey === fileKey || (!envKey && !fileKey));
