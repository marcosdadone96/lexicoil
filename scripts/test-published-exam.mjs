#!/usr/bin/env node
/**
 * test-published-exam.mjs — Unit tests for publish / status / re-publish flow (in-memory).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPublishedExamDoc,
  capturePublishedParts,
  assessPublishedExamIntegrity,
  canonicalPartHash,
  normalizePartSnapshot,
  parseAssembledExamFile,
  seedRecordToSnapshotPayload,
  writePublishedExam,
  readPublishedExam,
  upsertPublishedCatalog,
  listPublishedExams,
  localPublishedDir,
} from './lib/publishedExamLib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStore {
  constructor() {
    this.data = new Map();
  }

  async get(key, opts = {}) {
    const v = this.data.get(key);
    if (v == null) return null;
    return opts.type === 'json' ? structuredClone(v) : v;
  }

  async setJSON(key, value) {
    this.data.set(key, structuredClone(value));
    return { modified: true };
  }
}

function makeFixturePart(id, overrides = {}) {
  return normalizePartSnapshot({
    id,
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 1,
    instruction: 'Test',
    passage: { text: 'Hallo Welt.', title: 'T' },
    questions: [
      { id: 'q1', type: 'richtig_falsch', question: 'Q?', correct: 'Richtig', module: 'lesen', teil: 1 },
    ],
    complete: true,
    verified: true,
    ...overrides,
  });
}

async function testPartContentHashStable() {
  const a = makeFixturePart('p1');
  const b = makeFixturePart('p1', { servedCount: 99, createdAt: 123 });
  assert.equal(canonicalPartHash(a), canonicalPartHash(b));
  console.log('  ✓ hash ignores volatile fields');
}

async function testCaptureAndPublishLocal() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-exam-'));
  const lang = 'de';
  const level = 'B1';
  const libDir = path.join(tmp, 'library', 'published-exams', lang, level);
  fs.mkdirSync(libDir, { recursive: true });

  const origRoot = process.env.PUBLISHED_EXAM_TEST_ROOT;
  // Patch via direct paths in test — use store memory + manual write to temp
  const store = new MemoryStore();
  const part = makeFixturePart('test-part-001');
  const partKey = `reusable_part:${lang}:${level}:lesen:test-part-001`;
  await store.setJSON(partKey, part);

  const partIdMap = {};
  for (let i = 1; i <= 5; i++) partIdMap[`lesen_${i}`] = 'test-part-001';
  for (let i = 1; i <= 4; i++) partIdMap[`horen_${i}`] = 'test-part-001';
  for (let i = 1; i <= 3; i++) partIdMap[`schreiben_${i}`] = 'test-part-001';

  // Mock getReusablePart via store injection — capture uses getReusablePart from lib;
  // for unit test use seed fallback instead
  const seedById = new Map([['test-part-001', {
    id: 'test-part-001',
    lang: 'de',
    level: 'B1',
    module: 'lesen',
    teil: 1,
    instruction: 'Test',
    passage: { text: 'Hallo Welt.', title: 'T' },
    questions: part.questions,
    complete: true,
    verified: true,
  }]]);

  const { parts, missing } = await capturePublishedParts(null, {
    lang,
    level,
    partIdMap,
    seedById,
  });
  assert.equal(missing.length, 0);
  assert.equal(parts.length, 12);
  assert.ok(parts[0].snapshot);
  assert.ok(parts[0].contentHash);

  const doc = buildPublishedExamDoc({
    examId: 'test-official-de-B1-e1',
    lang,
    level,
    title: 'Test Exam 1',
    slot: 1,
    parts,
  });

  fs.writeFileSync(path.join(libDir, `${doc.examId}.json`), JSON.stringify(doc));
  fs.writeFileSync(path.join(libDir, '_catalog.json'), JSON.stringify({
    schema: 'published-catalog/v1',
    exams: [{ examId: doc.examId, slot: 1, status: 'live', manifestVersion: 1 }],
  }));

  const report = await assessPublishedExamIntegrity(null, doc, seedById);
  assert.equal(report.integrity, 'ok');

  // Simulate pool drift
  const drifted = seedRecordToSnapshotPayload({
    ...seedById.get('test-part-001'),
    passage: { text: 'Geändert.', title: 'T' },
  });
  const driftById = new Map([['test-part-001', {
    ...seedById.get('test-part-001'),
    passage: { text: 'Geändert.', title: 'T' },
  }]]);
  const report2 = await assessPublishedExamIntegrity(null, doc, driftById);
  assert.equal(report2.integrity, 'divergent');
  assert.ok(report2.partResults.some((p) => p.state === 'divergent'));

  fs.rmSync(tmp, { recursive: true, force: true });
  if (origRoot) process.env.PUBLISHED_EXAM_TEST_ROOT = origRoot;
  console.log('  ✓ capture, publish doc, status ok/divergent');
}

async function testAssembledE4DryRunShape() {
  const fp = path.join(ROOT, 'assembled-exam-b1-e4.json');
  if (!fs.existsSync(fp)) {
    console.log('  ⊘ skip E4 shape (assembled-exam-b1-e4.json not present)');
    return;
  }
  const assembled = parseAssembledExamFile(fp);
  assert.equal(assembled.slot, 4);
  assert.ok(assembled.partIds.lesen_3.includes('7217186ecff6'));
  const { byId } = await import('./lib/publishedExamLib.mjs').then((m) => ({
    byId: m.loadSeedRecords('de', 'B1').byId,
  }));
  const resolved = await import('./lib/publishedExamLib.mjs').then((m) =>
    m.resolvePartPayload(null, {
      lang: 'de',
      level: 'B1',
      module: 'lesen',
      teil: 3,
      partId: assembled.partIds.lesen_3,
      seedById: byId,
    }),
  );
  assert.ok(resolved?.contentHash);
  console.log(`  ✓ E4 lesen_3 resolves from seed hash=${resolved.contentHash.slice(0, 12)}…`);
}

async function main() {
  console.log('test-published-exam');
  await testPartContentHashStable();
  await testCaptureAndPublishLocal();
  await testAssembledE4DryRunShape();
  console.log('\nAll tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
