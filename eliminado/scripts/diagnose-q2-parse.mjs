#!/usr/bin/env node
/**
 * Diagnóstico Q2 parse — captura respuesta CRUDA del LLM en archivos que fallaron.
 *   node scripts/diagnose-q2-parse.mjs
 *   node scripts/diagnose-q2-parse.mjs batches/ready/lesen/lesen-t4-gemini-004.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  collectAnswerKeyItems,
  buildAnswerKeyCoherencePrompt,
  parseAnswerKeyCoherenceResponse,
} from './lib/qualityGates/answerKeyCoherenceGate.mjs';
import { inferJsonResponse } from './lib/llmJsonClient.mjs';

loadEnvFile();

const PARSE_FAIL_FILES = [
  'batches/ready/lesen/lesen-t4-gemini-004.json',
  'batches/ready/lesen/lesen-t4-gemini-010.json',
  'batches/ready/lesen/lesen-t4-gemini-025.json',
  'batches/ready/lesen/lesen-t1-gemini-180.json',
  'batches/ready/lesen/lesen-t1-gemini-096.json',
];

const OUT_DIR = path.join(ROOT, 'batches/ready/gate-logs/q2-parse-diagnostics');

function resolveBatch(rel) {
  const candidates = [
    path.join(ROOT, rel),
    path.join(ROOT, 'batches/generated', path.basename(rel)),
    path.join(ROOT, 'batches/ready/lesen', path.basename(rel)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`No encontrado: ${rel}`);
}

function analyzeRaw(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let parseErr = null;
  try {
    JSON.parse(slice);
  } catch (e) {
    parseErr = e.message;
  }
  return {
    totalChars: raw.length,
    hasMarkdownFence: /```/.test(raw),
    prefixBeforeBracket: start > 0 ? raw.slice(0, start) : '',
    suffixAfterBracket: end < raw.length - 1 ? raw.slice(end + 1) : '',
    sliceChars: slice.length,
    parseErr,
    line8: slice.split('\n')[7] || '',
    aroundError: slice.slice(180, 280),
  };
}

async function diagnoseOne(rel) {
  const abs = resolveBatch(rel);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const items = collectAnswerKeyItems(batch);
  const prompt = buildAnswerKeyCoherencePrompt(items);
  const maxTokens = Math.min(8192, 500 + items.length * 180);

  console.log(`\n=== ${path.basename(rel)} ===`);
  console.log(`items: ${items.length}, prompt chars: ${prompt.length}, maxTokens: ${maxTokens}`);

  let text;
  try {
    ({ text } = await inferJsonResponse({ prompt, temperature: 0.1, maxTokens }));
  } catch (e) {
    console.log('API ERROR:', e.message);
    return { file: rel, apiError: e.message };
  }

  const analysis = analyzeRaw(text);
  console.log('parseErr:', analysis.parseErr);
  console.log('line8:', analysis.line8);
  console.log('around 180-280:', analysis.aroundError);
  console.log('prefix:', JSON.stringify(analysis.prefixBeforeBracket.slice(0, 80)));
  console.log('RAW (first 1200 chars):\n', text.slice(0, 1200));

  const out = {
    file: rel,
    items: items.length,
    promptChars: prompt.length,
    maxTokens,
    analysis,
    rawText: text,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const safe = path.basename(rel, '.json');
  fs.writeFileSync(path.join(OUT_DIR, `${safe}-raw.json`), JSON.stringify(out, null, 2));
  return out;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : PARSE_FAIL_FILES.slice(0, 5);

const results = [];
for (const t of targets) {
  results.push(await diagnoseOne(t));
}

fs.writeFileSync(
  path.join(OUT_DIR, 'summary.json'),
  JSON.stringify(results.map((r) => ({
    file: r.file,
    apiError: r.apiError,
    parseErr: r.analysis?.parseErr,
    line8: r.analysis?.line8,
    promptChars: r.promptChars,
    rawLen: r.rawText?.length,
  })), null, 2),
);

console.log(`\nGuardado en ${OUT_DIR}`);
