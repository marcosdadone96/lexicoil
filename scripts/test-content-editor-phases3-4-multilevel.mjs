/**
 * Multi-level (A2/B1/B2) Phase 1-2 parity + Phase 3 caps proposals + Phase 4 seed-only.
 *   node scripts/test-content-editor-phases3-4-multilevel.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const applyLib = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));
const { detectChangeSpans } = require(path.join(ROOT, 'netlify/functions/lib/detectCaseOnlyChange.js'));
const capStore = require(path.join(ROOT, 'netlify/functions/lib/capitalizationRuleProposalStore.js'));

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

function forceCaseTweak(text) {
  const t = String(text);
  const m = t.match(/[a-zäöüß]/);
  if (!m) return null;
  const i = m.index;
  return t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
}

const LEVEL_FIXTURES = {
  A2: {
    poolRel: 'batches/ready/pool-verified/A2/lesen-t1-gemini-201.json',
    questionId: null,
    field: 'question',
  },
  B1: {
    poolRel: 'batches/ready/pool-verified/B1/lesen-t1-gemini-207.json',
    questionId: null,
    field: 'question',
  },
  B2: {
    poolRel: 'batches/ready/pool-verified/B2/lesen-t1-gemini-208.json',
    questionId: 'gen-q-1-bc565198-1',
    field: 'question',
  },
};

function pickPassage(batch) {
  const ps = batch.passages || [];
  return ps.find((p) => p && typeof p.text === 'string' && p.text.length > 20);
}

async function testLevelPoolApply(level, fixture) {
  const realDisk = storeLib.tryLoadCorrectionSource(fixture.poolRel.replace(/\.json$/, ''), ROOT, {
    level,
  });
  assert(realDisk.ok, `${level}: real pool-verified resolves — ${realDisk.error || ''}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lexiloop-ml-${level}-`));
  const poolPath = path.join(dir, fixture.poolRel);
  fs.mkdirSync(path.dirname(poolPath), { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups/content-corrections'), { recursive: true });
  const seedDir = path.join(dir, 'library/reusable-seed');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(
    path.join(seedDir, `de_${level}.json`),
    JSON.stringify({ records: [], _count: 0 }, null, 2),
  );

  const oldT = 'das ist ein kurzer testtext für ' + level + '.';
  const newVal = forceCaseTweak(oldT);
  const batch = {
    module: 'lesen',
    teil: 1,
    lang: 'de',
    level,
    passages: [{ id: 'p-ml-test', text: oldT, title: 'Titel' }],
    questions: [
      {
        id: 'q-ml-test',
        type: 'multiple_choice',
        question: 'Welche Aussage passt?',
        options: [
          { key: 'a', text: 'Ja' },
          { key: 'b', text: 'Nein' },
        ],
        correct: 'a',
        correctAnswer: 'a',
      },
    ],
  };
  fs.writeFileSync(poolPath, JSON.stringify(batch, null, 2));

  const store = memoryStore();
  const sourceFile = fixture.poolRel.replace(/\.json$/, '');
  const spans = detectChangeSpans(oldT, newVal);
  assert(spans.caseOnly, `${level}: detect case-only`);

  const created = await storeLib.createCorrection(
    store,
    {
      sourceFile,
      level,
      module: 'lesen',
      teil: 1,
      targetType: 'passage',
      targetId: 'p-ml-test',
      fieldPath: 'text',
      oldValue: oldT,
      newValue: newVal,
      reason: 'Capitalization test',
      autoApprove: true,
    },
    { email: 'test@lexicoil', isAdmin: true, projectRoot: dir },
  );
  assert(created.ok, `${level}: create correction`);

  const cid = created.correction.id;
  await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: true,
    syncEnabled: true,
    localOnly: true,
    lang: 'de',
    level,
  });
  const applied = await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: false,
    syncEnabled: true,
    localOnly: true,
    lang: 'de',
    level,
  });
  assert(applied.ok && applied.applied, `${level}: apply — ${applied.error || ''} ${(applied.errors || []).join('; ')}`);
  assert(applied.changeSpans?.caseOnly, `${level}: changeSpans on correction`);
  assert(
    applied.capitalizationProposals?.count >= 1,
    `${level}: cap proposal created (${applied.capitalizationProposals?.count})`,
  );

  const reloaded = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  const p2 = (reloaded.passages || []).find((p) => String(p.id) === 'p-ml-test');
  assert(p2 && p2.text === newVal, `${level}: pool JSON updated`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✓ ${level} pool resolve + apply + sync + cap proposal`);
}

async function testB2MatchingStructure() {
  const disk = storeLib.tryLoadCorrectionSource(
    'batches/ready/pool-verified/B2/lesen-t1-gemini-208',
    ROOT,
    { level: 'B2' },
  );
  assert(disk.ok, 'B2 forum batch load');
  assert((disk.batch.passages || []).length >= 4, 'B2 lesen T1 four personas');
  const q = disk.batch.questions.find((x) => String(x.id) === 'gen-q-1-bc565198-1');
  assert(q && q.type === 'matching', 'B2 matching question');
  const { findTargetObject } = applyLib;
  const hit = findTargetObject(disk.batch, q.id, 'question');
  assert(hit && hit.obj, 'B2 findTargetObject for matching item');
  console.log('✓ B2 forum/matching structure editable');
}

async function testSeedOnlyApply() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-p4-'));
  const seedPath = path.join(dir, 'library/reusable-seed/de_A2.json');
  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups/content-corrections'), { recursive: true });

  const record = {
    id: 'seed-only-test-a2',
    lang: 'de',
    level: 'A2',
    module: 'lesen',
    teil: 1,
    questions: [
      {
        id: 'sq1',
        question: 'was ist besser?',
        correct: 'a',
        correctAnswer: 'a',
        options: [
          { key: 'a', text: 'A' },
          { key: 'b', text: 'B' },
        ],
      },
    ],
    passages: [{ id: 'sp1', text: 'Kurzer Text.' }],
    complete: true,
  };
  fs.writeFileSync(seedPath, JSON.stringify({ records: [record], _count: 1 }, null, 2));

  const store = memoryStore();
  const oldQ = record.questions[0].question;
  const newQ = 'Was ist besser?';
  const created = await storeLib.createCorrection(
    store,
    {
      sourceFile: 'library/reusable-seed/de_A2',
      recordId: record.id,
      level: 'A2',
      module: 'lesen',
      teil: 1,
      targetType: 'question',
      targetId: 'sq1',
      fieldPath: 'question',
      oldValue: oldQ,
      newValue: newQ,
      reason: 'Seed-only caps',
      autoApprove: true,
    },
    { email: 'test@lexicoil', isAdmin: true, projectRoot: dir },
  );
  assert(created.ok, 'seed-only create');

  const cid = created.correction.id;
  await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: true,
  });
  const applied = await applyLib.applyCorrection(store, cid, {
    email: 'test@lexicoil',
    projectRoot: dir,
    dryRun: false,
    syncEnabled: true,
    skipSeed: true,
    skipBlob: true,
    skipPublished: true,
  });
  assert(applied.ok && applied.applied, `seed-only apply — ${applied.error || ''} ${(applied.errors || []).join('; ')}`);

  const seedAfter = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const rec = seedAfter.records.find((r) => r.id === record.id);
  assert(rec.questions[0].question === newQ, 'seed record updated');
  assert(!fs.existsSync(path.join(dir, 'batches/ready/pool-verified/A2/seed-only-test-a2.json')), 'no pool file required');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ Phase 4 seed-only apply (de_A2.json + recordId)');
}

async function main() {
  console.log('Content editor multi-level + Phase 3/4 tests\n');

  for (const level of ['A2', 'B1', 'B2']) {
    await testLevelPoolApply(level, LEVEL_FIXTURES[level]);
  }
  await testB2MatchingStructure();
  await testSeedOnlyApply();

  console.log('\nAll multi-level / Phase 3-4 checks passed.');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
