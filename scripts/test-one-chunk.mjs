#!/usr/bin/env node
/** Single-chunk smoke test using engine v2 PromptBuilder (requires ANTHROPIC_API_KEY). */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { salvageJson, validateChunkObj } from './lib/examJsonUtils.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

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

require(path.join(ROOT, 'js', 'engine', 'domain', 'lexicoilDomain.js'));
require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeLoader.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'baseProviderAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'goetheAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'cambridgeAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'deleAdapter.js'));
require(path.join(ROOT, 'js', 'engine', 'providers', 'providerRegistry.js'));
const KnowledgeEngine = require(path.join(ROOT, 'js', 'engine', 'knowledge', 'KnowledgeEngine.js'));
const PromptBuilder = require(path.join(ROOT, 'js', 'engine', 'prompts', 'PromptBuilder.js'));

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const spec = await KnowledgeEngine.buildSpec({
  language: 'german',
  level: 'B1',
  provider: 'goethe',
  contentType: 'Exam',
  topic: 'Umwelt',
});
const built = PromptBuilder.buildPrompt(spec);
const chunk = built.chunks[0];
console.log('Chunk:', chunk.label, 'expect:', chunk.expectKey);

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: process.env.CLAUDE_EXAM_MODEL || 'claude-sonnet-4-6',
    max_tokens: chunk.maxTokens,
    messages: [{ role: 'user', content: chunk.prompt }],
  }),
});
const data = await res.json();
const text = (data.content || []).map((p) => p.text || '').join('');
console.log('stop:', data.stop_reason, 'len:', text.length);
const obj = validateChunkObj(chunk, salvageJson(text));
console.log('root keys:', Object.keys(obj));
console.log(chunk.expectKey + ':', Array.isArray(obj[chunk.expectKey]) ? obj[chunk.expectKey].length + ' items' : typeof obj[chunk.expectKey]);
