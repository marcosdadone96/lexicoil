#!/usr/bin/env node
/**
 * Lista los modelos Gemini disponibles para tu API key (los que sirven para generar).
 * Uso:  node scripts/list-gemini-models.mjs
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
loadEnvFile();

const key = (process.env.GEMINI_API_KEY || '').trim();
if (!key) { console.error('GEMINI_API_KEY no está en .env'); process.exit(1); }

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${key}`);
if (!res.ok) { console.error(`Error ${res.status}: ${await res.text()}`); process.exit(1); }
const data = await res.json();
const models = (data.models || [])
  .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
  .map((m) => m.name.replace(/^models\//, ''))
  .sort();
console.log('Modelos que soportan generateContent:\n');
for (const name of models) console.log('  ' + name + (/flash/i.test(name) ? '   <- candidato (flash)' : ''));
console.log('\nActual en .env: GEMINI_MODEL=' + (process.env.GEMINI_MODEL || '(no definido)'));
