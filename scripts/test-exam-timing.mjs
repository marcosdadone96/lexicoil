import { readFileSync, existsSync } from 'fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const MODEL = process.env.CLAUDE_EXAM_MODEL || 'claude-sonnet-4-20250514';
const TOPIC = 'Umwelt und Gesundheit';
const NETLIFY_LIMIT_MS = 26000;

const META = { topic: TOPIC, level: 'B1', lang: 'de', goetheFormat: true };
const JSON_RULE =
  'Return ONE raw JSON object only. Escape " as \\". Use \\n in strings. No markdown.';

function compactPrompt(module, detail) {
  return `Goethe-Institut B1 exam writer. Topic: "${TOPIC}". ${detail} ${JSON_RULE}`;
}

const PROMPTS = {
  'read-1-2': compactPrompt(
    'reading',
    'Return topic, level, lang, goetheFormat, official, modules.lesen, lesenParts ONLY Teil 1 (6 R/F on blog) and Teil 2 (6 multiple on press article). Min word counts.',
  ),
  'read-3-5': compactPrompt(
    'reading',
    'Return topic, level, lang, lesenParts ONLY Teil 3 (5 match ads A-F), Teil 4 (5 J/N opinions), Teil 5 (5 multiple on rules text). Min word counts.',
  ),
  listen: compactPrompt(
    'listening',
    'Return topic, level, lang, horenParts (4 Teile: voicemail segments, dialogue R/F, interview multiple, discussion notes). Authentic spoken German.',
  ),
  write: compactPrompt(
    'writing',
    'Return topic, level, lang, schreibenParts (Teil 1 forum post 80w, Teil 2 formal email 120w) and gapfill if generic format.',
  ),
  speak: compactPrompt(
    'speaking',
    'Return topic, level, lang, sprechenParts (Teil 1 planning dialogue, Teil 2 presentation with 3 follow-up questions).',
  ),
};

function tryParse(text) {
  const s = text.replace(/```json|```/g, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return false;
  let depth = 0,
    inStr = false,
    esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        JSON.parse(s.slice(start, i + 1));
        return true;
      }
    }
  }
  return false;
}

async function timedCall(label, prompt, maxTokens) {
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  const text = (data.content || []).map((p) => p.text || '').join('');
  const ok = res.ok && text.length > 0;
  const parsed = ok && tryParse(text);
  const within = ms < NETLIFY_LIMIT_MS;
  console.log(
    JSON.stringify({
      label,
      ok,
      parsed,
      within,
      ms,
      maxTokens,
      promptChars: prompt.length,
      outChars: text.length,
      stop: data.stop_reason,
      err: data.error?.message,
    }),
  );
  return { ok, parsed, within, ms };
}

console.log('Model:', MODEL, 'Netlify limit:', NETLIFY_LIMIT_MS, 'ms');
const tokens = { 'read-1-2': 2800, 'read-3-5': 2800, listen: 2800, write: 1800, speak: 1200 };
let allOk = true;
for (const [label, prompt] of Object.entries(PROMPTS)) {
  const r = await timedCall(label, prompt, tokens[label]);
  if (!r.ok || !r.parsed || !r.within) allOk = false;
}
console.log('ALL_OK:', allOk);
