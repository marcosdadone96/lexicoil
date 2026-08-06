import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadEnvFile(envPath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
  applyPipelineLlmDefaults();
}

/** Generation/repair/verification pipeline: Gemini-only unless explicitly overridden. */
export function applyPipelineLlmDefaults() {
  if (!process.env.SEMANTIC_USE_GEMINI) process.env.SEMANTIC_USE_GEMINI = '1';
  if (!process.env.GEN_PROVIDER) process.env.GEN_PROVIDER = 'gemini';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey && !process.env.Q2_ANSWER_KEY_MODEL) {
    process.env.Q2_ANSWER_KEY_MODEL = 'gemini-2.5-flash';
  }
}

export { ROOT };
