/**
 * Phase 2 — pool path resolution, apply+sync, published snapshot + frozen attempts.
 *   node scripts/test-content-editor-phase2.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalPartHash } from './lib/partContentHash.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const applyLib = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, val) {
      map.set(key, val);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

function makePublishedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-p2-'));
  const poolDir = path.join(dir, 'batches', 'ready', 'pool-verified', 'B2');
  const seedDir = path.join(dir, 'library', 'reusable-seed');
  const pubDir = path.join(dir, 'library', 'published-exams', 'de', 'B2');
  fs.mkdirSync(poolDir, { recursive: true });
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(pubDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups', 'content-corrections'), { recursive: true });

  const batch = {
    module: 'lesen',
    teil: 1,
    lang: 'de',
    level: 'B2',
    questions: [
      {
        id: 'q-cap',
        type: 'multiple_choice',
        question: 'die Person genießt die Möglichkeit.',
        options: [{ key: 'a', text: 'A' }],
        correct: 'a',
        correctAnswer: 'a',
      },
    ],
    passages: [{ id: 'p-cap', title: 'Titel', text: 'Text.' }],
  };
  fs.writeFileSync(path.join(poolDir, 'lesen-t1-phase2-cap.json'), JSON.stringify(batch, null, 2));

  const seed = {
    records: [
      {
        id: 'pub-de-B2-lesen-t1-phase2cap',
        lang: 'de',
        level: 'B2',
        module: 'lesen',
        teil: 1,
        sourceFile: 'batches/ready/pool-verified/B2/lesen-t1-phase2-cap.json',
        questions: JSON.parse(JSON.stringify(batch.questions)),
        passages: JSON.parse(JSON.stringify(batch.passages)),
        complete: true,
        verified: true,
      },
    ],
    _count: 1,
  };
  fs.writeFileSync(path.join(seedDir, 'de_B2.json'), JSON.stringify(seed, null, 2));

  const snap = {
    id: 'lesen-t1-phase2-cap',
    lang: 'de',
    level: 'B2',
    module: 'lesen',
    teil: 1,
    questions: batch.questions,
  };
  const exam = {
    examId: 'official-de-B2-e-phase2',
    lang: 'de',
    level: 'B2',
    title: 'Phase2 test',
    slot: 98,
    manifestVersion: 1,
    status: 'published',
    parts: [
      {
        cell: 'lesen_1',
        module: 'lesen',
        teil: 1,
        partId: 'lesen-t1-phase2-cap',
        contentHash: canonicalPartHash(snap),
        snapshot: snap,
      },
    ],
  };
  fs.writeFileSync(path.join(pubDir, 'official-de-B2-e-phase2.json'), JSON.stringify(exam, null, 2));
  fs.writeFileSync(
    path.join(pubDir, '_catalog.json'),
    JSON.stringify(
      {
        version: '1',
        lang: 'de',
        level: 'B2',
        exams: [{ examId: 'official-de-B2-e-phase2', slot: 98, title: 'Phase2 test', status: 'published' }],
      },
      null,
      2,
    ),
  );

  const attemptFrozen = {
    examId: 'official-de-B2-e-phase2',
    userId: 'user-frozen',
    completedAt: '2026-01-01T00:00:00.000Z',
    answers: [{ questionId: 'q-cap', chosen: 'a', questionTextAtSubmit: 'die Person genießt die Möglichkeit.' }],
  };
  fs.writeFileSync(path.join(dir, 'user-attempt-frozen.json'), JSON.stringify(attemptFrozen, null, 2));

  return { dir, batch, exam, attemptFrozen };
}

async function main() {
  console.log('Phase 2 content editor tests\n');

  const disk = storeLib.tryLoadSourceBatch(
    'batches/ready/pool-verified/B2/lesen-t1-gemini-208',
    ROOT,
  );
  assert(disk.ok, 'real repo: resolve B2 pool-verified path — ' + (disk.error || ''));
  console.log('✓ partId → pool-verified (B2/lesen-t1-gemini-208)');

  const { dir, batch, exam, attemptFrozen } = makePublishedProject();
  const store = memoryStore();
  const sourceFile = 'batches/ready/pool-verified/B2/lesen-t1-phase2-cap';
  const oldQ = batch.questions[0].question;
  const newQ = 'Die Person genießt die Möglichkeit.';

  const created = await storeLib.createCorrection(
    store,
    {
      sourceFile,
      module: 'lesen',
      teil: 1,
      targetType: 'question',
      targetId: 'q-cap',
      fieldPath: 'question',
      oldValue: oldQ,
      newValue: newQ,
      reason: 'Capitalization typo',
      autoApprove: true,
    },
    { email: 'test@lexicoil', isAdmin: true, projectRoot: dir },
  );
  assert(created.ok && created.correction?.id, 'create correction');
  const cid = created.correction.id;

  const dry = await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: true,
    syncEnabled: true,
    confirmPublish: true,
    localOnly: true,
    lang: 'de',
    level: 'B2',
  });
  assert(dry.ok && dry.wouldApply, 'dry-run ok');

  const applied = await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: false,
    syncEnabled: true,
    confirmPublish: true,
    localOnly: true,
    lang: 'de',
    level: 'B2',
  });
  assert(applied.ok && applied.applied, 'apply ok');
  const syncSt = applied.sync?.syncStatus || applied.correction?.syncStatus;
  assert(syncSt === 'synced', 'expected syncStatus synced, got ' + syncSt);
  console.log('✓ apply + sync (syncStatus=' + syncSt + ')');

  const pubPath = path.join(dir, 'library/published-exams/de/B2/official-de-B2-e-phase2.json');
  const pubAfter = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
  const part = pubAfter.parts[0];
  const qSnap = part.snapshot.questions.find((q) => q.id === 'q-cap');
  assert(qSnap.question === newQ, 'published snapshot question updated');
  assert(part.contentHash !== exam.parts[0].contentHash, 'contentHash recalculated');
  assert(Number(pubAfter.manifestVersion) > Number(exam.manifestVersion), 'manifestVersion bumped');
  console.log('✓ official published snapshot + contentHash updated');

  const attemptAfter = JSON.parse(fs.readFileSync(path.join(dir, 'user-attempt-frozen.json'), 'utf8'));
  assert(
    JSON.stringify(attemptAfter) === JSON.stringify(attemptFrozen),
    'completed attempt must not be rewritten',
  );
  console.log('✓ frozen user attempt unchanged (future loads only)');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nAll Phase 2 checks passed.');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
