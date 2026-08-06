/**
 * PASO 13 P0-1 — syncCorrectionToRuntime tests (local, no Blobs required).
 *   node scripts/lib/__tests__/syncCorrectionToRuntime.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  syncCorrectionToRuntime,
  resolvePartIdForSourceFile,
  applyPatchToPart,
} from '../syncCorrectionToRuntime.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-sync-'));
  const poolDir = path.join(dir, 'batches', 'ready', 'pool-verified');
  const seedDir = path.join(dir, 'library', 'reusable-seed');
  const pubDir = path.join(dir, 'library', 'published-exams', 'de', 'B1');
  fs.mkdirSync(poolDir, { recursive: true });
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(pubDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups', 'content-corrections'), { recursive: true });

  const batch = {
    module: 'lesen',
    teil: 5,
    lang: 'de',
    level: 'B1',
    questions: [
      {
        id: 'q1',
        type: 'multiple_choice',
        question: 'Was ist Naturschutz?',
        text: 'Alttext',
        options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }],
        correct: 'a',
        correctAnswer: 'a',
      },
    ],
    passages: [{ id: 'p1', text: 'Passage über Naturschutz und Recycling.' }],
  };
  fs.writeFileSync(path.join(poolDir, 'lesen-t5-test-sync.json'), JSON.stringify(batch, null, 2));

  const seed = {
    records: [
      {
        id: 'pub-de-B1-lesen-t5-testsync',
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil: 5,
        sourceFile: 'batches/generated/lesen-t5-test-sync.json',
        questions: JSON.parse(JSON.stringify(batch.questions)),
        passages: JSON.parse(JSON.stringify(batch.passages)),
        complete: true,
        verified: true,
      },
      {
        id: 'other-part',
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil: 1,
        questions: [{ id: 'qx', question: 'x', correct: 'a' }],
      },
    ],
    _count: 2,
  };
  fs.writeFileSync(path.join(seedDir, 'de_B1.json'), JSON.stringify(seed, null, 2));

  const exam = {
    examId: 'official-de-B1-e-test',
    lang: 'de',
    level: 'B1',
    title: 'Test',
    slot: 99,
    manifestVersion: 1,
    status: 'published',
    parts: [
      {
        cell: 'lesen_5',
        module: 'lesen',
        teil: 5,
        partId: 'lesen-t5-test-sync',
        contentHash: 'abc',
        snapshot: { id: 'lesen-t5-test-sync', questions: batch.questions },
      },
    ],
  };
  fs.writeFileSync(path.join(pubDir, 'official-de-B1-e-test.json'), JSON.stringify(exam, null, 2));
  fs.writeFileSync(
    path.join(pubDir, '_catalog.json'),
    JSON.stringify({
      version: '1',
      lang: 'de',
      level: 'B1',
      exams: [{ examId: 'official-de-B1-e-test', slot: 99, title: 'Test', status: 'published' }],
    }, null, 2),
  );

  return { dir, batch };
}

const correction = {
  id: 'cc-test-sync',
  sourceFile: 'lesen-t5-test-sync',
  module: 'lesen',
  teil: 5,
  targetId: 'q1',
  targetType: 'question',
  fieldPath: 'text',
  oldValue: 'Alttext',
  newValue: 'Neu: Naturschutz und Recycling',
  status: 'applied',
};

// 1) resolve sourceFile → partId via seed.sourceFile
{
  const { dir } = makeTempProject();
  const resolved = resolvePartIdForSourceFile('lesen-t5-test-sync', {
    lang: 'de',
    level: 'B1',
    projectRoot: dir,
  });
  assert(resolved.partId === 'pub-de-B1-lesen-t5-testsync', 'resolve seed id');
  assert(resolved.seedRecord?.id === resolved.partId, 'seed record');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2) dry-run never writes seed
{
  const { dir } = makeTempProject();
  const seedPath = path.join(dir, 'library', 'reusable-seed', 'de_B1.json');
  const before = fs.readFileSync(seedPath, 'utf8');
  const result = await syncCorrectionToRuntime(correction, {
    projectRoot: dir,
    dryRun: true,
    confirm: false,
    localOnly: true,
    skipBlob: true,
    lang: 'de',
    level: 'B1',
  });
  assert(result.report.dryRun === true, 'dryRun flag');
  assert(result.report.sourceFile === 'lesen-t5-test-sync', 'sourceFile');
  assert(result.report.partId === 'pub-de-B1-lesen-t5-testsync', 'partId in report');
  const seedT = result.report.targets.find((t) => t.type === 'seed');
  assert(seedT?.status === 'updated', 'seed would update');
  const pubT = result.report.targets.find((t) => t.type === 'published');
  assert(pubT?.status === 'stale', 'published stale without confirmPublish');
  assert(result.report.syncStatus === 'published_stale', 'aggregate published_stale');
  assert(fs.readFileSync(seedPath, 'utf8') === before, 'seed unchanged in dry-run');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3) confirm updates seed only (no invent ids); published stays stale without confirmPublish
{
  const { dir } = makeTempProject();
  const seedPath = path.join(dir, 'library', 'reusable-seed', 'de_B1.json');
  const result = await syncCorrectionToRuntime(correction, {
    projectRoot: dir,
    confirm: true,
    dryRun: false,
    confirmPublish: false,
    localOnly: true,
    skipBlob: true,
    lang: 'de',
    level: 'B1',
  });
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const rec = seed.records.find((r) => r.id === 'pub-de-B1-lesen-t5-testsync');
  assert(rec.questions[0].text === correction.newValue, 'seed field updated');
  assert(seed.records.length === 2, 'no duplicate seed records');
  const pubT = result.report.targets.find((t) => t.type === 'published');
  assert(pubT?.status === 'stale', 'published not auto-written');
  assert(result.report.syncStatus === 'published_stale', 'synced seed + stale published');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4) confirm + confirmPublish updates published snapshot
{
  const { dir } = makeTempProject();
  // First update pool-verified text so snapshot differs
  const poolPath = path.join(dir, 'batches', 'ready', 'pool-verified', 'lesen-t5-test-sync.json');
  const batch = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  batch.questions[0].text = correction.newValue;
  fs.writeFileSync(poolPath, JSON.stringify(batch, null, 2));

  const result = await syncCorrectionToRuntime(correction, {
    projectRoot: dir,
    confirm: true,
    dryRun: false,
    confirmPublish: true,
    localOnly: true,
    skipBlob: true,
    lang: 'de',
    level: 'B1',
  });
  const pubPath = path.join(dir, 'library', 'published-exams', 'de', 'B1', 'official-de-B1-e-test.json');
  const exam = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
  assert(exam.manifestVersion === 2, 'manifest bumped');
  assert(exam.parts[0].partId === 'lesen-t5-test-sync', 'partId stable');
  assert(exam.parts[0].snapshot.questions[0].text === correction.newValue, 'snapshot updated');
  const pubT = result.report.targets.find((t) => t.type === 'published');
  assert(pubT?.status === 'updated', 'published updated');
  assert(result.report.syncStatus === 'synced', 'fully synced');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5) no seed match → sync_pending (never invent id)
{
  const { dir } = makeTempProject();
  const seedPath = path.join(dir, 'library', 'reusable-seed', 'de_B1.json');
  fs.writeFileSync(seedPath, JSON.stringify({ records: [{ id: 'unrelated', module: 'lesen', teil: 1 }] }, null, 2));
  // remove published link too
  fs.writeFileSync(
    path.join(dir, 'library', 'published-exams', 'de', 'B1', '_catalog.json'),
    JSON.stringify({ exams: [] }, null, 2),
  );
  const result = await syncCorrectionToRuntime(correction, {
    projectRoot: dir,
    dryRun: true,
    localOnly: true,
    skipBlob: true,
  });
  assert(result.report.partId == null, 'no invented partId');
  const seedT = result.report.targets.find((t) => t.type === 'seed');
  assert(seedT?.status === 'sync_pending', 'seed sync_pending');
  assert(result.report.syncStatus === 'sync_pending', 'aggregate sync_pending');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 6) applyPatchToPart surgical
{
  const part = {
    questions: [{ id: 'q1', text: 'old', correct: 'a' }],
  };
  const r = applyPatchToPart(part, {
    targetId: 'q1',
    targetType: 'question',
    fieldPath: 'text',
    newValue: 'new',
  });
  assert(r.ok && part.questions[0].text === 'new', 'patch ok');
}

console.log('syncCorrectionToRuntime tests passed.');
