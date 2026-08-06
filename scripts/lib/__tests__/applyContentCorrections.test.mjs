/**
 * Tests for PASO 5 apply engine + learning extract (in-memory + temp JSON).
 *   node scripts/lib/__tests__/applyContentCorrections.test.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const applyLib = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const extractLib = require(path.join(ROOT, 'netlify/functions/lib/extractLearningFromCorrection.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key, opts) {
      if (!map.has(key)) return null;
      return map.get(key);
    },
    async setJSON(key, val) {
      map.set(key, val);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-apply-'));
const genDir = path.join(tmpRoot, 'batches', 'generated');
fs.mkdirSync(genDir, { recursive: true });

const batchName = 'lesen-t1-test-apply-001';
const batchPath = path.join(genDir, `${batchName}.json`);
const batch = {
  passages: [{ id: 'p1', text: 'Ich Glaube an Projekte.' }],
  questions: [
    {
      id: 'q1',
      question: 'Was sagt der Text?',
      options: [
        { key: 'a', text: 'A' },
        { key: 'b', text: 'B' },
      ],
      correct: 'a',
      explanation: 'ok',
      vocabularyTags: ['glaube', 'projekte'],
    },
  ],
};
fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2), 'utf8');

const store = memoryStore();

const created = await storeLib.createCorrection(
  store,
  {
    sourceFile: batchName,
    module: 'lesen',
    teil: 1,
    targetType: 'passage',
    targetId: 'p1',
    fieldPath: 'text',
    oldValue: 'Ich Glaube an Projekte.',
    newValue: 'Ich glaube an Projekte.',
    reason: 'German capitalization / grammar',
  },
  { email: 'admin@test.com', projectRoot: tmpRoot, requireSourceOnDisk: true },
);
assert(created.ok && created.correction, 'create ok');

await storeLib.updateCorrection(store, created.correction.id, { status: 'approved' }, { email: 'admin@test.com' });

// Dry-run batch default
const dry = await applyLib.applyApprovedCorrections(store, {
  projectRoot: tmpRoot,
  email: 'admin@test.com',
});
assert(dry.dryRun === true, 'default dry-run');
assert(dry.summary.wouldApply === 1, 'would apply 1');
assert(JSON.parse(fs.readFileSync(batchPath, 'utf8')).passages[0].text === 'Ich Glaube an Projekte.', 'file untouched');

// Conflict: mutate file so oldValue no longer matches
fs.writeFileSync(
  batchPath,
  JSON.stringify(
    {
      ...batch,
      passages: [{ id: 'p1', text: 'Ich glaube an Projekte.' }],
    },
    null,
    2,
  ),
  'utf8',
);

const conflict = await applyLib.applyCorrection(store, created.correction.id, {
  projectRoot: tmpRoot,
  email: 'admin@test.com',
  dryRun: false,
});
assert(conflict.error === 'conflict', 'conflict detected');
const afterConflict = await storeLib.loadCorrection(store, created.correction.id);
assert(afterConflict.status === 'conflict', 'status conflict');

// Restore matching oldValue + re-approve + apply
fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2), 'utf8');
await storeLib.updateCorrection(store, created.correction.id, { status: 'approved' }, { email: 'admin@test.com' });

const applied = await applyLib.applyCorrection(store, created.correction.id, {
  projectRoot: tmpRoot,
  email: 'admin@test.com',
  dryRun: false,
});
assert(applied.ok && applied.applied, 'applied');
const written = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
assert(written.passages[0].text === 'Ich glaube an Projekte.', 'text updated');
assert(applied.backupPath && fs.existsSync(applied.backupPath), 'backup exists');
const final = await storeLib.loadCorrection(store, created.correction.id);
assert(final.status === 'applied', 'status applied');
assert(final.history.some((h) => h.action === 'applied'), 'history applied');
assert(applied.learning && applied.learning.reusable === true, 'learning from grammar caps');

// Typo → no learning
const typo = extractLib.extractLearningFromCorrection({
  id: 'x',
  reason: 'typo',
  oldValue: 'vergisen',
  newValue: 'vergessen',
  module: 'lesen',
  teil: 1,
  fieldPath: 'text',
});
assert(typo.reusable === false && typo.kind === 'typo', 'typo skipped');

// Lexical preference → learning
const lex = extractLib.extractLearningFromCorrection({
  id: 'y',
  reason: 'naturalness / gemeinsames Projekt',
  oldValue: 'ein schönes Thema',
  newValue: 'ein schönes gemeinsames Projekt',
  module: 'lesen',
  teil: 1,
  fieldPath: 'text',
});
assert(lex.reusable === true, 'lexical reusable');

// Invalid field path rejected
assert(applyLib.resolveFieldKey('questions[3].text') == null, 'no index paths');
assert(applyLib.resolveFieldKey('text') === 'text', 'leaf text');

console.log('applyContentCorrections tests passed.');
