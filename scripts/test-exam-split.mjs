import { readFileSync, existsSync, writeFileSync } from 'fs';

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
const MODEL = 'claude-haiku-4-5';
const TOPIC = 'Umwelt und Gesundheit';
const JR =
  'Return ONE raw JSON object. Full authentic German B1 content — NO placeholders like "..." or "Option". Escape " as \\". No markdown.';

function p(detail) {
  return `Goethe-Institut B1 exam writer. Topic: "${TOPIC}". ${detail} ${JR}`;
}

const tests = [
  ['read-1-2', p('lesenParts ONLY Teil 1 (blog 180w + 6 R/F) and Teil 2 (press 220w + 6 multiple). Include topic,level:"B1",lang:"de",goetheFormat:true,official,modules.lesen.'), 3200],
  ['read-3', p('lesenParts ONLY Teil 3 (6 ads A-F + 5 match questions). topic,level,lang.'), 2400],
  ['read-4-5', p('lesenParts ONLY Teil 4 (5 opinions 25w each + J/N) and Teil 5 (rules text 130w + 5 multiple). topic,level,lang.'), 2800],
  ['listen-1-2', p('horenParts ONLY Teil 1 (2 voicemail segments) and Teil 2 (dialogue R/F + multiple). topic,level,lang.'), 3000],
  ['listen-3-4', p('horenParts ONLY Teil 3 (interview multiple) and Teil 4 (discussion + notes). topic,level,lang.'), 3000],
  ['write', p('schreibenParts Teil 1 (forum 80w task) and Teil 2 (formal email 120w). topic,level,lang.'), 2000],
  ['speak', p('sprechenParts Teil 1 (planning dialogue) and Teil 2 (presentation + 3 questions). topic,level,lang.'), 1500],
];

function tryParse(text) {
  const s = text.replace(/```json|```/g, '').trim();
  const a = s.indexOf('{');
  if (a < 0) return { ok: false };
  let d = 0,
    iS = false,
    e = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (iS) {
      if (e) e = false;
      else if (c === '\\') e = true;
      else if (c === '"') iS = false;
      continue;
    }
    if (c === '"') iS = true;
    else if (c === '{') d++;
    else if (c === '}') {
      d--;
      if (d === 0) {
        const obj = JSON.parse(s.slice(a, i + 1));
        return { ok: true, obj };
      }
    }
  }
  return { ok: false };
}

let allOk = true;
const results = [];
for (const [label, prompt, maxTokens] of tests) {
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
  const text = (data.content || []).map((x) => x.text || '').join('');
  const ms = Date.now() - t0;
  const { ok: parsed, obj } = tryParse(text);
  const within = ms < 26000;
  const hasPlaceholder = /\.\.\.|"a\) \.\.\."|Option one/i.test(text);
  if (!parsed || !within || hasPlaceholder) allOk = false;
  const row = {
    label,
    ms,
    within,
    parsed,
    hasPlaceholder,
    stop: data.stop_reason,
    out: text.length,
    parts: obj?.lesenParts?.length || obj?.horenParts?.length || obj?.schreibenParts?.length || obj?.sprechenParts?.length || 0,
    err: data.error?.message,
  };
  results.push(row);
  console.log(JSON.stringify(row));
}
console.log('ALL_OK:', allOk);
writeFileSync('scripts/test-exam-last.json', JSON.stringify(results, null, 2));
