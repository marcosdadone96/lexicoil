#!/usr/bin/env node
/**
 * Live Listening AI (3 rounds) — real Anthropic + TTS, deferred billing.
 *
 * ⚠ COSTO REAL: cada ejecución llama Anthropic + TTS (~$0.05–0.30+).
 * No correr en CI ni en loops automatizados sin presupuesto explícito.
 *
 *   ALLOW_LISTENING_LIVE=1 node scripts/test-listening-ai-live.mjs
 *   ALLOW_LISTENING_LIVE=1 node scripts/test-listening-ai-live.mjs --partial-only
 *
 * Optional: netlify dev on :8888 (same .env). Handler is invoked in-process with
 * MemoryBlobStore (identical claude-chat path as Netlify).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const PARTIAL_ONLY = process.argv.includes('--partial-only');
const USE_FIXTURE =
  process.argv.includes('--fixture') ||
  process.env.LISTENING_E2E_FIXTURE === '1' ||
  process.env.LISTENING_E2E_FIXTURE === 'true';
if (USE_FIXTURE) {
  process.env.ALLOW_LISTENING_E2E = '1';
  process.env.LISTENING_E2E_FIXTURE = '1';
}

process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'test-secret-at-least-16-chars!!';

if (process.env.ALLOW_LISTENING_LIVE !== '1' && process.env.ALLOW_LISTENING_LIVE !== 'true') {
  console.error('Set ALLOW_LISTENING_LIVE=1 to run (real API spend).');
  process.exit(1);
}

const anthropic = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
if (!anthropic || anthropic.length < 20) {
  if (!process.argv.includes('--fixture') && process.env.LISTENING_E2E_FIXTURE !== '1') {
    console.warn('No ANTHROPIC_API_KEY — listening uses Gemini (no Claude required).');
  }
}

const ttsProvider = String(process.env.TTS_PROVIDER || 'none').toLowerCase();
if (ttsProvider === 'none' && !process.env.ELEVENLABS_API_KEY) {
  process.env.TTS_PROVIDER = 'stub';
  console.warn('TTS_PROVIDER unset — using stub MP3 for live rounds (set elevenlabs for real voice).');
}

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async getWithMetadata(key) {
    const row = this.blobs.get(key);
    if (!row) return null;
    return { data: structuredClone(row.data), etag: row.etag };
  }

  async get(key, opts = {}) {
    const row = await this.getWithMetadata(key);
    const data = row?.data ?? null;
    if (opts.type === 'json' && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data;
  }

  async set(key, val) {
    this.etagSeq += 1;
    this.blobs.set(key, { data: val, etag: `e${this.etagSeq}` });
  }

  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
    if (opts.onlyIfNew && existing) return { modified: false };
    if (opts.onlyIfMatch && (!existing || existing.etag !== opts.onlyIfMatch)) {
      return { modified: false };
    }
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }
}

function handlerBody(res) {
  return JSON.parse(res.body || '{}');
}

function makeEvent(authToken) {
  return {
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
  };
}

const POOLS = {
  A2: ['vorschlagen', 'aufstehen', 'schwimmen', 'Mittag', 'Büro', 'Wetter'],
  B1: ['Klimawandel', 'Mülltrennung', 'Recycling', 'Plastik', 'Energie', 'Nachhaltigkeit'],
};

const OUT_DIR = path.join(ROOT, 'batches', 'logs', 'listening-live');
fs.mkdirSync(OUT_DIR, { recursive: true });

const store = new MemoryBlobStore();
require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;

const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLibPath = path.join(ROOT, 'netlify/functions/lib/quotaLib.js');
delete require.cache[quotaLibPath];
const quotaLib = require(quotaLibPath);
const { getAiCredits } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
const { detectAppearedWords } = require(path.join(ROOT, 'netlify/functions/lib/listeningGameUtils.js'));
const HorenGame = require(path.join(ROOT, 'js/library/HorenGame.js'));

const email = 'listening-live@test.com';
await store.setJSON(userKey(email), {
  email,
  name: 'Listening Live',
  plan: 'pro',
  tokenVersion: 1,
});
await store.setJSON(`quota:${email}`, {
  used: 0,
  aiUsed: 0,
  aiMax: 100,
  month: quotaLib.getMonthKey(),
  version: 1,
});

const { token: authToken } = signAuthToken(email, 'Listening Live', 1);
const event = makeEvent(authToken);

async function loadHandler() {
  delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
  return require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
}

async function callListening(handler, level, requestId, words) {
  const res = await handler({
    httpMethod: 'POST',
    headers: event.headers,
    body: JSON.stringify({
      generateListeningGame: true,
      lang: 'de',
      level,
      topic: level === 'A2' ? 'Alltag' : 'Umwelt',
      words,
      requestId,
    }),
  });
  return { status: res.statusCode, body: handlerBody(res) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function summarizeRound(r, pool, level) {
  const det = detectAppearedWords(pool, r.passage, 'de');
  const poolHit = r.appeared?.length >= 1;
  return {
    roundIndex: r.roundIndex,
    passageWords: r.passage.split(/\s+/).length,
    appeared: r.appeared,
    absent: r.absent,
    audioBytes: r.audioBase64 ? Buffer.from(r.audioBase64, 'base64').length : 0,
    poolWordsInPassage: det.appeared,
    poolHit,
  };
}

async function creditsSnapshot() {
  const c = await getAiCredits(event);
  return { used: c.used, remaining: c.remaining, max: c.max };
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' LISTENING AI LIVE — 3 rounds / 2 credits when 3/3');
console.log(` TTS_PROVIDER=${process.env.TTS_PROVIDER || 'none'}`);
if (USE_FIXTURE) console.log(' LISTENING_E2E_FIXTURE=1 (Anthropic bypass — real TTS + LexiCoil credits)');
console.log('══════════════════════════════════════════════════════════\n');

const before = await creditsSnapshot();
console.log('Credits BEFORE:', before);

let handler = await loadHandler();
const results = [];

if (!PARTIAL_ONLY) {
  for (const level of ['A2', 'B1']) {
    const words = POOLS[level];
    const rid = randomUUID();
    const t0 = Date.now();
    const { status, body } = await callListening(handler, level, rid, words);
    const ms = Date.now() - t0;
    console.log(`\n── ${level} (${ms}ms) HTTP ${status} ──`);
    if (status !== 200 || body.billed !== true) {
      console.log('  response:', JSON.stringify({ ok: body.ok, billed: body.billed, partial: body.partial, error: body.error, rounds: body.roundsGenerated, userMessage: body.userMessage?.slice?.(0, 120) }));
    }
    assert(status === 200, `${level} HTTP ${status}`);
    assert(body.billed === true, `${level} billed=true`);
    assert(body.partial !== true, `${level} not partial`);
    assert(body.roundsGenerated === 3, `${level} 3 rounds`);
    assert(body.rounds?.length === 3, `${level} rounds array len 3`);
    for (const r of body.rounds) {
      assert(r.valid && r.audioBase64?.length > 100, `${level} round ${r.roundIndex} has audio`);
      const sum = summarizeRound(r, words, level);
      assert(sum.poolHit, `${level} R${r.roundIndex} pool word in passage: ${sum.appeared.join(', ')}`);
      console.log(`  R${sum.roundIndex}: ${sum.passageWords}w, appeared=[${sum.appeared.join(', ')}], audio=${sum.audioBytes}B`);
      const out = path.join(OUT_DIR, `${level}-r${r.roundIndex}.mp3`);
      fs.writeFileSync(out, Buffer.from(r.audioBase64, 'base64'));
    }
    results.push({ level, billed: body.billed, rounds: body.roundsGenerated, ms, aiUsed: body.aiUsed });
  }
}

const mid = await creditsSnapshot();
console.log('\nCredits AFTER success runs:', mid);
if (!PARTIAL_ONLY) {
  assert(mid.used === before.used + 4, `expected +4 aiUsed (2× A2 + 2× B1), got +${mid.used - before.used} (used=${mid.used})`);
  assert(results.length === 2 && results.every((r) => r.billed && r.rounds === 3), 'A2+B1 each 3/3 billed');
}

// Real partial: stop after 2 valid rounds (dev E2E hook — no round-3 Anthropic bill attempt)
process.env.ALLOW_LISTENING_E2E = '1';
process.env.LISTENING_E2E_FAIL_AFTER = '2';
handler = await loadHandler();
const beforePartial = await creditsSnapshot();
const { status: pSt, body: pBody } = await callListening(
  handler,
  'A2',
  randomUUID(),
  POOLS.A2,
);
console.log(`\n── Partial A2 (E2E fail after 2) HTTP ${pSt} ──`);
assert(pSt === 200, `partial HTTP ${pSt}`);
assert(pBody.billed === false, 'partial billed=false');
assert(pBody.partial === true, 'partial flag true');
assert(pBody.roundsGenerated === 2, 'partial 2 rounds');
const afterPartial = await creditsSnapshot();
assert(afterPartial.used === beforePartial.used, 'partial run did not charge credits');
console.log('Credits unchanged across partial:', beforePartial.used, '→', afterPartial.used);

// Free tier logic (unchanged)
const round = HorenGame.buildRound(['Haus', 'Auto', 'Brot', 'Milch'], { lang: 'de', rng: () => 0.3 });
assert(round && round.played.length >= 1 && round.absent.length >= 1, 'free buildRound');
const scored = HorenGame.scoreRound(round, [...round.played]);
assert(scored.correct >= round.played.length, 'free scoreRound hits played words');
assert(typeof HorenGame.mountSession === 'function', 'mountSession export');
console.log('\nFree HorenGame buildRound/scoreRound: OK');

console.log('\n══════════════════════════════════════════════════════════');
console.log(' LIVE LISTENING SUMMARY');
for (const r of results) {
  console.log(`  ${r.level}: 3/3 billed=${r.billed} (${r.ms}ms)`);
}
console.log(`  Credits: ${before.used} → ${mid.used} (+${mid.used - before.used} on full sessions)`);
console.log(`  Partial 2/3: billed=false, credits ${beforePartial.used} → ${afterPartial.used}`);
console.log(`  Audio samples: ${OUT_DIR}`);
console.log('══════════════════════════════════════════════════════════\n');
