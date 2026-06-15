#!/usr/bin/env node
/**
 * Preflight: Gemini key, daily budget, pending jobs for de/B1.
 * Usage: npm run gemini:doctor
 *        npm run gemini:doctor -- --ping
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { remainingToday, USAGE_FILE } from './lib/geminiRateLimit.mjs';
import { getGenerationJobs } from './lib/coverageJobs.mjs';
import { generateContent } from './lib/geminiClient.mjs';

loadEnvFile();

const TARGET = Math.max(1, Number(process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 10) || 10);
const PING = process.argv.includes('--ping');

function rpdLimit() {
  const n = Number(process.env.GEMINI_RPD);
  return Number.isFinite(n) && n >= 0 ? n : 240;
}

function rpmLimit() {
  return Math.max(1, Number(process.env.GEMINI_RPM) || 8);
}

console.log('\n=== Gemini doctor — de/B1 ===\n');

const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
console.log(`API key:     ${hasKey ? '✓ configurada' : '✗ falta GEMINI_API_KEY en .env'}`);

const rpd = rpdLimit();
const rpm = rpmLimit();
const left = remainingToday();
const used = rpd - left;
console.log(`Modelo:      ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}`);
console.log(`Límites:     ${rpm} req/min · ${rpd} req/día (PT)`);
console.log(`Hoy (PT):    ${used} usadas · ${left} restantes`);

if (fs.existsSync(USAGE_FILE)) {
  console.log(`Usage file:  ${path.relative(ROOT, USAGE_FILE)}`);
} else {
  console.log('Usage file:  (aún no creado — se genera en la 1ª llamada)');
}

const jobs = getGenerationJobs('de', 'B1', { mode: 'gaps', targetExams: TARGET });
console.log(`\nJobs gaps→${TARGET}: ${jobs.length}`);
if (jobs.length) {
  const byTeil = {};
  for (const j of jobs) {
    const k = jobLabel(j);
    byTeil[k] = (byTeil[k] || 0) + 1;
  }
  Object.entries(byTeil).forEach(([k, n]) => console.log(`  · ${k}${n > 1 ? ` ×${n}` : ''}`));
}

const daysNeeded = left > 0 ? Math.ceil(jobs.length / Math.min(left, rpm * 60 * 8)) : '∞ (sin cupo hoy)';
const daysSimple = left > 0 ? Math.ceil(jobs.length / left) : '∞';
console.log(`\nEstimación:  ~${jobs.length} llamadas Gemini · ${daysSimple} día(s) al ritmo ${left}/día restantes`);

const cp = path.join(ROOT, 'batches', '.generate-checkpoint.json');
if (fs.existsSync(cp)) {
  try {
    const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
    console.log(`\nCheckpoint:  ${data.pendingJobs?.length ?? '?'} jobs pendientes (${data.timestamp})`);
  } catch {
    console.log('\nCheckpoint:  batches/.generate-checkpoint.json (corrupto)');
  }
}

function jobLabel(job) {
  return job.teil != null ? `${job.module} T${job.teil}` : job.module;
}

if (PING) {
  if (!hasKey) {
    console.error('\n--ping requiere GEMINI_API_KEY');
    process.exit(1);
  }
  console.log('\nPing Gemini…');
  try {
    const { text, model } = await generateContent({ prompt: '{"ok":true}', jsonMode: true, maxRetries: 2 });
    console.log(`Ping OK (${model}): ${text.slice(0, 80)}`);
  } catch (e) {
    console.error(`Ping FAIL: ${e.message}`);
    process.exit(1);
  }
}

console.log('\nRunbook:');
console.log('  npm run generate:b1:10');
console.log('  npm run assemble:b1:10');
console.log('  npm run coverage:b1:10');
console.log('  node scripts/accept-de-b1.mjs\n');

if (!hasKey) process.exit(1);
