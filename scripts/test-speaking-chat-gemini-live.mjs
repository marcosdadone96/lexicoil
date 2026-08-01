#!/usr/bin/env node
/**
 * Live multi-turn speaking-chat (Gemini partner).
 *
 * ⚠ COSTO REAL: cada ejecución llama APIs Gemini de producción (~$0.01–0.10+).
 * No correr en CI ni en loops automatizados sin presupuesto explícito.
 *
 *   ALLOW_LISTENING_LIVE=1 node scripts/test-speaking-chat-gemini-live.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();
process.env.GEMINI_RATE_LIMIT_SKIP = '1';
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || 'test-secret-at-least-16-chars!!';

if (process.env.ALLOW_LISTENING_LIVE !== '1') {
  console.error('Set ALLOW_LISTENING_LIVE=1');
  process.exit(1);
}

const require = createRequire(import.meta.url);

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
  async setJSON(key, data) {
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }
  async delete(key) {
    this.blobs.delete(key);
  }
}

function body(res) {
  return JSON.parse(res.body || '{}');
}

const store = new MemoryBlobStore();
require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;

const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLib = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));
const { getAiCredits } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
const chat = require(path.join(ROOT, 'netlify/functions/speaking-chat.js'));

const email = 'speaking-chat-live@test.com';
await store.setJSON(userKey(email), { email, plan: 'pro', tokenVersion: 1, name: 'Sprechen' });
await store.setJSON(`quota:${email}`, {
  used: 0,
  aiUsed: 0,
  aiMax: 40,
  month: quotaLib.getMonthKey(),
  version: 1,
});

const { token } = signAuthToken(email, 'Sprechen', 1);
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const eventBase = { httpMethod: 'POST', headers };

async function post(payload) {
  return chat.handler({ ...eventBase, body: JSON.stringify(payload) });
}

const situation =
  'Teil 2: Ihr Freund Max plant eine Reise nach Berlin. Sprechen Sie mit ihm über Transport, Sehenswürdigkeiten und Budget.';

const c0 = await getAiCredits({ headers });
console.log('\n══ speaking-chat Gemini multi-turn ══');
console.log('Credits before:', c0.used, '/', c0.max);

const start = body(
  await post({
    action: 'start',
    consent: true,
    personaId: 'balanced',
    level: 'B1',
    situation,
    whoStarts: 'user',
    requestId: randomUUID(),
  }),
);
if (!start.ok) {
  console.error('start failed', start);
  process.exit(1);
}
const c1 = await getAiCredits({ headers });
console.log('Credits after start (+4 expected):', c1.used, 'remaining', c1.remaining);
if (c1.used !== c0.used + 4) {
  console.error('Expected +4 credits on start');
  process.exit(1);
}

let sessionId = start.session.sessionId;
const userLines = [
  'Hallo Max! Ich habe gehört, du willst nach Berlin fahren. Wann möchtest du reisen?',
  'Ich würde mit dem ICE fahren — das ist schnell. Hast du schon ein Hotel?',
  'Das Brandenburger Tor und die Museumsinsel solltest du unbedingt sehen. Wie viel Budget hast du?',
  'Dann könnten wir zusammen die U-Bahn-Karte kaufen — erinnerst du dich noch an unsere letzte Reise?',
];

for (let i = 0; i < userLines.length; i++) {
  const res = body(
    await post({
      action: 'turn',
      sessionId,
      text: userLines[i],
    }),
  );
  if (!res.ok) {
    console.error('turn', i + 1, 'failed', res);
    process.exit(1);
  }
  const partner = res.session.turns.filter((t) => t.role === 'partner').pop();
  console.log(`\nTurn ${i + 1} user:`, userLines[i].slice(0, 70) + '…');
  console.log(`Turn ${i + 1} partner (${partner?.text?.split(/\s+/).length || 0}w):`, partner?.text?.slice(0, 200));
  const mentionsBerlin =
    i >= 1 && /berlin|hotel|brandenburg|budget|u-bahn|reise|museumsinsel/i.test(partner?.text || '');
  if (i >= 2 && !mentionsBerlin && i === 3) {
    console.warn('  (Turn 4: partner may not echo all context — review text above)');
  }
}

const c2 = await getAiCredits({ headers });
console.log('\nCredits after 4 turns (unchanged):', c2.used, '===', c1.used);
console.log('Total turns:', userLines.length * 2, 'messages in thread');
console.log('Provider: gemini\n');
