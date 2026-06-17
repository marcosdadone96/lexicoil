#!/usr/bin/env node
/**
 * End-to-end test: pending → approved → maybePromote → pool (no API spend).
 *
 * Usage: node scripts/test-collab-bank-flow.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { examPartsToStagingRecords } = require(path.join(ROOT, 'netlify/functions/lib/stagingFromExam.js'));
const {
  loadStagingIndex,
  saveStagingIndex,
  saveStagingCandidate,
  loadStagingCandidate,
  updateCandidateStatus,
} = require(path.join(ROOT, 'netlify/functions/lib/stagingStore.js'));
const { maybePromote } = require(path.join(ROOT, 'netlify/functions/lib/promoteFromApproved.js'));
const { validateGeneratedExam } = require(path.join(ROOT, 'netlify/functions/lib/examQualityGate.js'));
const { listPoolIndexEntries } = require(path.join(ROOT, 'netlify/functions/lib/poolIndex.js'));

const LANG = 'de';
const LEVEL = 'B1';

class MemStore {
  constructor() {
    this.data = new Map();
  }

  async get(key, { type } = {}) {
    const raw = this.data.get(key);
    if (raw == null) return null;
    if (type === 'json') {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }
    return raw;
  }

  async setJSON(key, val, opts = {}) {
    if (opts.onlyIfNew && this.data.has(key)) return { modified: false };
    this.data.set(key, JSON.stringify(val));
    return { modified: true };
  }

  async delete(key) {
    this.data.delete(key);
  }

  async list({ prefix } = {}) {
    const blobs = [];
    for (const key of this.data.keys()) {
      if (!prefix || key.startsWith(prefix)) blobs.push({ key });
    }
    return { blobs };
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

function lesenPart() {
  return {
    teil: 1,
    textTitle: 'Stadtgarten Test',
    text: 'Immer mehr Menschen in deutschen Städten entscheiden sich für einen eigenen kleinen Garten. Stadtgärten bieten frische Produkte und Gemeinschaft. Kinder lernen, wie Pflanzen wachsen. Die Wartelisten sind oft lang und die Nachfrage steigt jedes Jahr.',
    questions: [
      { question: 'Stadtgärten werden beliebter.', correct: 'Richtig', type: 'richtig_falsch' },
      { question: 'Stadtgärten gibt es nur auf dem Land.', correct: 'Falsch', type: 'richtig_falsch' },
      { question: 'Kinder können etwas über Pflanzen lernen.', correct: 'Richtig', type: 'richtig_falsch' },
      { question: 'Es gibt keine Wartelisten.', correct: 'Falsch', type: 'richtig_falsch' },
      { question: 'Stadtgärten fördern Gemeinschaft.', correct: 'Richtig', type: 'richtig_falsch' },
      { question: 'Frische Produkte sind ein Vorteil.', correct: 'Richtig', type: 'richtig_falsch' },
    ],
  };
}

function horenPart() {
  const mk = (n, transcript) => ({
    label: String.fromCharCode(64 + n),
    transcript,
    questions: [
      { question: `Text ${n} Aussage A`, correct: 'Richtig', type: 'richtig_falsch' },
      { question: `Text ${n} Aussage B`, correct: 'Falsch', type: 'richtig_falsch' },
    ],
  });
  return {
    teil: 1,
    context: 'Kurze Texte',
    segments: [
      mk(1, 'Im Supermarkt gibt es heute frisches Obst im Angebot.'),
      mk(2, 'Der Bus nach Berlin faehrt heute zehn Minuten spaeter ab.'),
      mk(3, 'Im Buero findet morgen ein wichtiges Meeting statt.'),
      mk(4, 'Das Schwimmbad bleibt wegen Reparaturen bis Freitag geschlossen.'),
      mk(5, 'Im Park gibt es am Wochenende ein Konzert fuer Familien.'),
    ],
  };
}

function schreibenPart() {
  return {
    teil: 1,
    task: 'Schreiben Sie eine E-Mail an Ihre Freundin Anna. Erzählen Sie von Ihrem Wochenende und laden Sie sie ein.',
    prompt: 'Schreiben Sie eine E-Mail an Ihre Freundin Anna. Erzählen Sie von Ihrem Wochenende und laden Sie sie ein.',
  };
}

function sprechenPart() {
  return {
    teil: 1,
    situation: 'Sie möchten am Wochenende mit Freunden wandern gehen. Planen Sie die Tour gemeinsam.',
  };
}

function buildSampleExam(modules) {
  const exam = { topic: 'Collab test exam', level: LEVEL, lang: LANG };
  if (modules.includes('lesen')) exam.lesenParts = [lesenPart()];
  if (modules.includes('horen')) exam.horenParts = [horenPart()];
  if (modules.includes('schreiben')) exam.schreibenParts = [schreibenPart()];
  if (modules.includes('sprechen')) exam.sprechenParts = [sprechenPart()];
  return exam;
}

async function ingestExam(store, exam) {
  const records = examPartsToStagingRecords(exam, {
    lang: LANG,
    level: LEVEL,
    source: 'test-collab-bank-flow',
    batchId: `test-${Date.now()}`,
  });
  let index = await loadStagingIndex(store, LANG, LEVEL);
  for (const rec of records) {
    rec.status = 'pending';
    rec.contributor = 'test@example.com';
    await saveStagingCandidate(store, LANG, LEVEL, rec);
    index.push({
      id: rec.id,
      module: rec.module,
      teil: rec.teil,
      status: 'pending',
      valid: !!rec.validation?.valid,
      createdAt: Date.now(),
    });
  }
  await saveStagingIndex(store, LANG, LEVEL, index);
  return records.map((r) => r.id);
}

async function approveIds(store, ids) {
  for (const id of ids) {
    await updateCandidateStatus(store, LANG, LEVEL, id, 'approved');
  }
}

async function countPromoted(store) {
  const index = await loadStagingIndex(store, LANG, LEVEL);
  let n = 0;
  for (const row of index) {
    const c = await loadStagingCandidate(store, LANG, LEVEL, row.id);
    if (c?.status === 'promoted') n++;
  }
  return n;
}

async function main() {
  const store = new MemStore();

  const allIds = await ingestExam(store, buildSampleExam(['lesen', 'horen', 'schreiben', 'sprechen']));
  assert(allIds.length === 4, `ingested 4 pending parts (got ${allIds.length})`);

  const pendingOnly = await loadStagingIndex(store, LANG, LEVEL);
  assert(pendingOnly.every((r) => r.status === 'pending'), 'all parts start pending');

  await approveIds(store, [allIds[0]]);
  let promoted = await maybePromote(store, LANG, LEVEL);
  assert(promoted === 0, 'insufficient module coverage → 0 exams published');

  const poolBefore = await listPoolIndexEntries(store, LANG, LEVEL);
  await approveIds(store, allIds.slice(1));
  promoted = await maybePromote(store, LANG, LEVEL);
  assert(promoted >= 1, `full module coverage → at least 1 exam published (got ${promoted})`);

  const poolAfter = await listPoolIndexEntries(store, LANG, LEVEL);
  assert(poolAfter.length === poolBefore.length + promoted, 'pool index grew by promoted count');

  const latest = poolAfter[poolAfter.length - 1];
  const entry = await store.get(latest.examKey, { type: 'json' });
  assert(entry?.exam, 'pool entry has exam payload');
  const gate = validateGeneratedExam(entry.exam, { strict: false });
  assert(gate.valid, `published exam passes validateGeneratedExam (${gate.errors?.join(', ') || 'ok'})`);

  const promotedParts = await countPromoted(store);
  assert(promotedParts >= 1, 'at least one staging part marked promoted');

  const stillPending = (await loadStagingIndex(store, LANG, LEVEL)).filter((r) => r.status === 'pending');
  assert(stillPending.length === 0, 'no auto-approved parts remain pending');

  console.log('\nPASS  Collaborative bank flow (pending → approved → pool)');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
