#!/usr/bin/env node
/**
 * Pool admin helpers + disable/enable serve gate (Blobs pool).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));
const { isValidPoolEntry } = require(path.join(ROOT, 'netlify/functions/exam-pool.js'));
const {
  publishPoolExam,
  pickPoolExam,
  listPoolExamsAdmin,
  setPoolExamDisabled,
  removePoolExam,
} = require(path.join(ROOT, 'netlify/functions/lib/poolIndex.js'));

class MemoryBlobStore {
  constructor() {
    this.blobs = new Map();
    this.etagSeq = 0;
  }

  async get(key) {
    const row = this.blobs.get(key);
    return row ? structuredClone(row.data) : null;
  }

  async setJSON(key, data, opts = {}) {
    const existing = this.blobs.get(key);
    if (opts.onlyIfNew && existing) return { modified: false };
    this.etagSeq += 1;
    this.blobs.set(key, { data: structuredClone(data), etag: `e${this.etagSeq}` });
    return { modified: true };
  }

  async delete(key) {
    this.blobs.delete(key);
  }

  async list({ prefix }) {
    const blobs = [];
    for (const key of this.blobs.keys()) {
      if (!prefix || key.startsWith(prefix)) blobs.push({ key });
    }
    return { blobs };
  }
}

const validExam = {
  goetheFormat: true,
  lang: 'de',
  level: 'B1',
  lesenParts: [{
    teil: 1,
    text: 'Beispieltext zum Lesen und Verstehen mit genug Wörtern.',
    items: [{
      id: 'l1',
      question: 'Test?',
      options: ['a) One', 'b) Two', 'c) Three'],
      correct: 'b',
    }],
  }],
  horenParts: [{
    transcript: 'Moderator: Willkommen. Gast: Danke für die Einladung.',
    segments: [{
      id: 'h1',
      question: 'Topic?',
      options: ['A) X', 'B) Y', 'C) Z'],
      correct: 'B',
    }],
  }],
};

assert(validateGeneratedExam(validExam).valid, 'fixture exam must pass quality gate');

async function main() {
  const store = new MemoryBlobStore();
  const lang = 'de';
  const level = 'B1';
  const id = randomUUID();
  const entry = {
    lang,
    level,
    topic: 'Admin test exam',
    exam: validExam,
    source: 'ai',
    servedCount: 0,
    createdAt: Date.now(),
    contributedBy: 'tester@example.com',
  };

  await publishPoolExam(store, { lang, level, id, entry });

  const listed = await listPoolExamsAdmin(store, lang, level);
  assert.equal(listed.length, 1, 'admin list finds published exam');
  assert.equal(listed[0].contributedBy, 'tester@example.com');
  assert.equal(listed[0].disabled, false);

  assert(isValidPoolEntry(entry), 'active entry is valid for serve');

  let picked = await pickPoolExam(store, lang, level, new Set(), { isValidEntry: isValidPoolEntry });
  assert(picked?.id === id, 'pool serves active exam');

  const disabled = await setPoolExamDisabled(store, lang, level, id, true);
  assert(disabled, 'disable_pool succeeds');

  const disabledEntry = await store.get(`pool:${lang}:${level}:${id}`, { type: 'json' });
  assert.equal(disabledEntry.disabled, true);
  assert(!isValidPoolEntry(disabledEntry), 'disabled entry fails isValidPoolEntry');

  picked = await pickPoolExam(store, lang, level, new Set(), { isValidEntry: isValidPoolEntry });
  assert(!picked, 'disabled exam is not served');

  const enabled = await setPoolExamDisabled(store, lang, level, id, false);
  assert(enabled, 'enable_pool succeeds');
  const reenabled = await store.get(`pool:${lang}:${level}:${id}`, { type: 'json' });
  assert(!reenabled.disabled);
  assert(isValidPoolEntry(reenabled), 're-enabled entry is valid again');

  picked = await pickPoolExam(store, lang, level, new Set(), { isValidEntry: isValidPoolEntry });
  assert(picked?.id === id, 're-enabled exam is served again');

  const removed = await removePoolExam(store, lang, level, id);
  assert(removed, 'delete_pool removes blob');
  assert.equal((await listPoolExamsAdmin(store, lang, level)).length, 0);

  console.log('OK  pool admin disable/enable/serve cycle');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
