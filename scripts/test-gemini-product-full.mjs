#!/usr/bin/env node
/**
 * Live Gemini — Schreiben correction, grammar coaching, spell, phrases, drill.
 *
 * ⚠ COSTO REAL: cada ejecución llama APIs Gemini de producción (~$0.01–0.10+).
 * No correr en CI ni en loops automatizados sin presupuesto explícito.
 *
 *   ALLOW_LISTENING_LIVE=1 node scripts/test-gemini-product-full.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();
process.env.GEMINI_RATE_LIMIT_SKIP = '1';
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET || process.env.LEXICOIL_JWT_SECRET || 'test-secret-at-least-16-chars!!';

if (process.env.ALLOW_LISTENING_LIVE !== '1') {
  console.error('Set ALLOW_LISTENING_LIVE=1');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const GrammarCategories = require(path.join(ROOT, 'js/library/grammarCategories.js'));

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
}

function body(res) {
  return JSON.parse(res.body || '{}');
}

const store = new MemoryBlobStore();
require(path.join(ROOT, 'netlify/functions/lib/blobStore.js')).getStoreForEvent = () => store;
const { signAuthToken, userKey } = require(path.join(ROOT, 'netlify/functions/lib/authLib.js'));
const quotaLib = require(path.join(ROOT, 'netlify/functions/lib/quotaLib.js'));

const email = 'gemini-full@test.com';
await store.setJSON(userKey(email), { email, plan: 'pro', tokenVersion: 1 });
await store.setJSON(`quota:${email}`, {
  used: 0,
  aiUsed: 0,
  aiMax: 40,
  month: quotaLib.getMonthKey(),
  version: 1,
});

const { token } = signAuthToken(email, 'T', 1);
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

function loadHandler() {
  delete require.cache[path.join(ROOT, 'netlify/functions/claude-chat.js')];
  return require(path.join(ROOT, 'netlify/functions/claude-chat.js')).handler;
}

const handler = loadHandler();

async function post(payload) {
  return handler({ httpMethod: 'POST', headers, body: JSON.stringify(payload) });
}

console.log('\n══ Gemini full product smoke ══\n');

const spell = body(await post({ spellCheckWord: true, word: 'vorschlagen', lang: 'de' }));
console.log('spellCheck vorschlagen:', spell.correct, spell.suggestion || '(ok)');

const SAMPLES = [
  {
    label: 'B1 Konjunktiv II',
    level: 'B1',
    userText:
      'Liebe Anna, wenn ich mehr Zeit hätte, würde ich öfter ins Kino gehen. Gestern ich bin zu spät zur Arbeit gekommen, weil der Bus nicht kommen. Ich wünsche mir, dass ich besser Deutsch sprechen kann.',
  },
  {
    label: 'B1 Passiv',
    level: 'B1',
    userText:
      'In unserer Stadt wird viel über Umwelt gesprochen. Die Plastikflaschen müssen recycle werden. Letzte Woche man hat ein neues Gesetz beschlossen, das die Mülltrennung verbessert.',
  },
  {
    label: 'A2 Wortstellung',
    level: 'A2',
    userText:
      'Hallo! Ich heute Morgen früh aufstehen um 6 Uhr. Danach ich gehe mit dem Hund spazieren. Am Abend wir essen zusammen Pizza und schauen Fernsehen.',
  },
];

for (const sample of SAMPLES) {
  const res = body(
    await post({
      correctWriting: true,
      lang: 'de',
      level: sample.level,
      task: 'Alltags-E-Mail / Bericht',
      userText: sample.userText,
      passPercent: 60,
      requestId: randomUUID(),
    }),
  );
  const errs = res.correction?.errors || [];
  const cats = errs
    .filter((e) => e.type === 'grammar' && e.grammarCategory)
    .map((e) => e.grammarCategory);
  console.log(`\nSchreiben ${sample.label}: ok=${res.ok} errors=${errs.length} grammarCats=[${[...new Set(cats)].slice(0, 4).join(', ')}]`);
  if (errs[0]) {
    console.log('  first:', errs[0].original, '→', errs[0].correction, `(${errs[0].grammarCategory || errs[0].type})`);
  }
}

const coach = body(
  await post({
    grammarCoaching: true,
    lang: 'de',
    level: 'B1',
    weakTags: ['konjunktiv_ii', 'passiv', 'wortstellung'],
    sampleMistakes: [
      {
        tag: 'konjunktiv_ii',
        yours: 'Ich wünsche mir, dass ich besser sprechen kann.',
        correct: 'Ich wünsche mir, dass ich besser sprechen könnte.',
      },
      {
        tag: 'passiv',
        yours: 'Die Flaschen müssen recycle werden.',
        correct: 'Die Flaschen müssen recycelt werden.',
      },
    ],
    requestId: randomUUID(),
  }),
);
console.log('\ngrammarCoaching topics:', coach.coaching?.topics?.length || 0, coach.ok);

const phrases = body(
  await post({
    generateVocabPhrases: true,
    lang: 'de',
    level: 'A2',
    words: ['vorschlagen', 'aufstehen', 'schwimmen', 'Mittag'],
    count: 4,
    requestId: randomUUID(),
  }),
);
console.log('vocabPhrases:', phrases.ok, phrases.phrases?.length);

const drill = body(
  await post({
    generateGrammarDrill: true,
    lang: 'de',
    level: 'B1',
    category: 'passiv',
    examples: [{ original: 'wird recycle', correction: 'wird recycelt', explanation: 'Partizip II' }],
    requestId: randomUUID(),
  }),
);
console.log('grammarDrill:', drill.ok, drill.exercises?.length || drill.drill?.exercises?.length);

console.log('\nDone.\n');
