#!/usr/bin/env node
/**
 * Live Gemini product paths — vocab quiz + listening deferred billing.
 *
 * ⚠ COSTO REAL: cada ejecución llama APIs Gemini de producción (~$0.01–0.10+).
 * No correr en CI ni en loops automatizados sin presupuesto explícito.
 *
 *   ALLOW_LISTENING_LIVE=1 node scripts/test-product-gemini-live.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);

process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'test-secret-at-least-16-chars!!';

if (process.env.ALLOW_LISTENING_LIVE !== '1' && process.env.ALLOW_LISTENING_LIVE !== 'true') {
  console.error('Set ALLOW_LISTENING_LIVE=1');
  process.exit(1);
}
process.env.GEMINI_RATE_LIMIT_SKIP = '1';

const { geminiApiKey } = require(path.join(ROOT, 'netlify/functions/lib/freeTranslate.js'));
if (!geminiApiKey()) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
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
  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const store = new MemoryBlobStore();
require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;

const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLib = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const { getAiCredits } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));

const email = 'gemini-product-live@test.com';
await store.setJSON(userKey(email), { email, name: 'Gemini Live', plan: 'pro', tokenVersion: 1 });
await store.setJSON(`quota:${email}`, {
  used: 0,
  aiUsed: 0,
  aiMax: 40,
  month: quotaLib.getMonthKey(),
  version: 1,
});

const { token } = signAuthToken(email, 'Gemini Live', 1);
const event = makeEvent(token);

async function loadHandler() {
  delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
  return require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
}

async function credits() {
  const c = await getAiCredits(event);
  return { used: c.used, remaining: c.remaining };
}

const QUIZ_WORDS = [
  { word: 'vorschlagen', type: 'verb', translation: 'proponer' },
  { word: 'aufstehen', type: 'verb', translation: 'levantarse' },
  { word: 'schwimmen', type: 'verb', translation: 'nadar' },
  { word: 'Mittag', type: 'noun', translation: 'mediodía' },
  { word: 'Büro', type: 'noun', translation: 'oficina' },
  { word: 'Wetter', type: 'noun', translation: 'tiempo' },
];

const LISTEN_POOL = ['vorschlagen', 'aufstehen', 'schwimmen', 'Mittag', 'Büro', 'Wetter'];

console.log('\n══ Gemini product live — quiz + listening billing ══\n');

let handler = await loadHandler();
const c0 = await credits();
console.log('Credits start:', c0);

const quizRes = await handler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    generateVocabQuiz: true,
    lang: 'de',
    level: 'A2',
    hintLang: 'es',
    words: QUIZ_WORDS.map((w) => w.word),
    wordMeta: QUIZ_WORDS,
    count: 6,
    requestId: randomUUID(),
  }),
});
const quiz = handlerBody(quizRes);
assert(quizRes.statusCode === 200, `quiz HTTP ${quizRes.statusCode}`);
assert(quiz.billed === true && quiz.questions?.length >= 4, 'quiz success billed');
const c1 = await credits();
assert(c1.used === c0.used + 2, `quiz +2 credits (used ${c1.used})`);
console.log('OK quiz success:', quiz.questions.length, 'questions, billed', quiz.billed);

delete process.env.LISTENING_E2E_FIXTURE;
delete process.env.ALLOW_LISTENING_E2E;
handler = await loadHandler();
const listenRes = await handler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    generateListeningGame: true,
    lang: 'de',
    level: 'A2',
    topic: 'Alltag',
    words: LISTEN_POOL,
    requestId: randomUUID(),
  }),
});
const listen = handlerBody(listenRes);
assert(listenRes.statusCode === 200, `listen HTTP ${listenRes.statusCode}`);
assert(listen.billed === true && listen.roundsGenerated === 3, 'listening 3/3 billed');
const c2 = await credits();
assert(c2.used === c1.used + 2, `listening full +2 (used ${c2.used})`);
console.log('OK listening 3/3:', listen.roundsGenerated, 'rounds');

process.env.ALLOW_LISTENING_E2E = '1';
process.env.LISTENING_E2E_FAIL_AFTER = '2';
handler = await loadHandler();
const cBeforePartial = await credits();
const partialRes = await handler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    generateListeningGame: true,
    lang: 'de',
    level: 'A2',
    words: LISTEN_POOL,
    requestId: randomUUID(),
  }),
});
const partial = handlerBody(partialRes);
assert(partial.billed === false && partial.partial === true && partial.roundsGenerated === 2, 'partial 2/3');
const cAfterPartial = await credits();
assert(cAfterPartial.used === cBeforePartial.used, 'partial no charge');
console.log('OK listening partial 2/3');

const savedTts = process.env.TTS_PROVIDER;
process.env.TTS_PROVIDER = 'none';
delete process.env.LISTENING_E2E_FAIL_AFTER;
handler = await loadHandler();
const cBeforeFail = await credits();
const failRes = await handler({
  httpMethod: 'POST',
  headers: event.headers,
  body: JSON.stringify({
    generateListeningGame: true,
    lang: 'de',
    level: 'A2',
    words: LISTEN_POOL,
    requestId: randomUUID(),
  }),
});
const fail = handlerBody(failRes);
if (savedTts) process.env.TTS_PROVIDER = savedTts;
else delete process.env.TTS_PROVIDER;
assert(fail.billed === false && (fail.error === 'listening_unavailable' || fail.ok === false), 'total fail');
const cAfterFail = await credits();
assert(cAfterFail.used === cBeforeFail.used, 'total fail no charge');
console.log('OK listening total fail');

console.log('\nFinal credits:', cAfterFail, '\n');
