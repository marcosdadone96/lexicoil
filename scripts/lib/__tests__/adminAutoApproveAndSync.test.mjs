/**
 * Auto-approve (admin create) + Admin API syncEnabled default tests.
 *   node scripts/lib/__tests__/adminAutoApproveAndSync.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));
const applyLib = require(path.join(ROOT, 'netlify/functions/lib/applyContentCorrections.js'));

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

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-admin-aa-'));
  const poolDir = path.join(dir, 'batches', 'ready', 'pool-verified');
  const seedDir = path.join(dir, 'library', 'reusable-seed');
  fs.mkdirSync(poolDir, { recursive: true });
  fs.mkdirSync(seedDir, { recursive: true });
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
        options: [
          { key: 'a', text: 'A' },
          { key: 'b', text: 'B' },
        ],
        correct: 'a',
        correctAnswer: 'a',
      },
    ],
    passages: [{ id: 'p1', text: 'Passage über Naturschutz.' }],
  };
  fs.writeFileSync(path.join(poolDir, 'lesen-t5-admin-aa.json'), JSON.stringify(batch, null, 2));

  const seed = {
    records: [
      {
        id: 'pub-de-B1-lesen-t5-adminaa',
        lang: 'de',
        level: 'B1',
        module: 'lesen',
        teil: 5,
        sourceFile: 'batches/generated/lesen-t5-admin-aa.json',
        questions: JSON.parse(JSON.stringify(batch.questions)),
        passages: JSON.parse(JSON.stringify(batch.passages)),
        complete: true,
        verified: true,
      },
    ],
    _count: 1,
  };
  fs.writeFileSync(path.join(seedDir, 'de_B1.json'), JSON.stringify(seed, null, 2));
  return { dir, batch };
}

const baseFields = {
  sourceFile: 'lesen-t5-admin-aa',
  module: 'lesen',
  teil: 5,
  targetType: 'question',
  targetId: 'q1',
  fieldPath: 'text',
  oldValue: 'Alttext',
  newValue: 'Neu: Naturschutz sync',
  reason: 'German naturalness',
};

console.log('=== (a) admin + autoApprove:true → approved + history ===');
{
  const store = memoryStore();
  const r = await storeLib.createCorrection(
    store,
    { ...baseFields, autoApprove: true },
    { email: 'admin@lexicoil.test', isAdmin: true },
  );
  assert(r.ok && r.correction, 'create ok');
  assert(r.correction.status === 'approved', `status approved, got ${r.correction.status}`);
  assert(r.correction.createdBy === 'admin@lexicoil.test', 'createdBy');
  const hist = r.correction.history || [];
  assert(hist.some((h) => h.action === 'created' && h.user === 'admin@lexicoil.test'), 'history created');
  const auto = hist.find((h) => h.action === 'status_changed' && h.autoApprove === true);
  assert(auto, 'history autoApprove status_changed');
  assert(auto.from === 'pending' && auto.to === 'approved', 'pending→approved');
  assert(auto.note === 'auto_approved_on_create', 'note');
  console.log('PASS (a)', {
    id: r.correction.id,
    status: r.correction.status,
    historyActions: hist.map((h) => h.action),
    autoApproveEntry: auto,
  });
}

console.log('=== (b) without autoApprove / non-admin → pending ===');
{
  const store = memoryStore();
  const noFlag = await storeLib.createCorrection(
    store,
    { ...baseFields, newValue: 'pending-A' },
    { email: 'admin@lexicoil.test', isAdmin: true },
  );
  assert(noFlag.ok && noFlag.correction.status === 'pending', 'admin without flag → pending');

  const notAdmin = await storeLib.createCorrection(
    store,
    { ...baseFields, newValue: 'pending-B', autoApprove: true },
    { email: 'user@lexicoil.test', isAdmin: false },
  );
  assert(notAdmin.ok && notAdmin.correction.status === 'pending', 'autoApprove ignored without isAdmin');
  assert(
    (notAdmin.warnings || []).includes('autoApprove_ignored_not_admin'),
    'warning autoApprove_ignored_not_admin',
  );
  console.log('PASS (b)', {
    noFlag: noFlag.correction.status,
    notAdmin: notAdmin.correction.status,
    warnings: notAdmin.warnings,
  });
}

console.log('=== (c) Admin API apply path → sync without explicit syncEnabled ===');
{
  const { dir } = makeProject();
  const store = memoryStore();
  const created = await storeLib.createCorrection(
    store,
    { ...baseFields, autoApprove: true },
    { email: 'admin@lexicoil.test', isAdmin: true, projectRoot: dir },
  );
  assert(created.correction.status === 'approved', 'pre-approved');

  // Mimic admin-api body: confirm:true, NO syncEnabled field
  const body = { confirm: true, localOnly: true, skipBlob: true, lang: 'de', level: 'B1' };
  assert(body.syncEnabled === undefined, 'payload has no syncEnabled');
  const opts = applyLib.buildAdminApplyOptions(body, 'admin@lexicoil.test');
  assert(opts.syncEnabled === true, 'buildAdminApplyOptions defaults syncEnabled true');
  assert(opts.confirmPublish === false, 'confirmPublish stays false');

  const dry = await applyLib.applyCorrection(store, created.correction.id, {
    ...opts,
    projectRoot: dir,
    dryRun: true,
  });
  assert(dry.ok && dry.dryRun, 'dry-run ok');

  const result = await applyLib.applyCorrection(store, created.correction.id, {
    ...opts,
    projectRoot: dir,
    dryRun: false,
  });
  assert(result.ok && result.applied, 'applied ok');
  const syncStatus = result.correction?.syncStatus || result.sync?.syncStatus;
  // seed updated + published not touched → synced or published_stale (no published fixtures here → synced)
  assert(
    syncStatus === 'synced' || syncStatus === 'published_stale',
    `expected synced|published_stale, got ${syncStatus}`,
  );
  assert(result.sync?.skipped !== true, 'sync was not skipped');
  const seed = JSON.parse(fs.readFileSync(path.join(dir, 'library', 'reusable-seed', 'de_B1.json'), 'utf8'));
  const rec = seed.records.find((r) => r.id === 'pub-de-B1-lesen-t5-adminaa');
  assert(rec.questions[0].text === baseFields.newValue, 'seed field updated by sync');
  console.log('PASS (c)', {
    syncStatus,
    seedText: rec.questions[0].text,
    confirmPublish: opts.confirmPublish,
    syncEnabledFromPayload: body.syncEnabled,
    syncEnabledResolved: opts.syncEnabled,
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('=== (d) CLI/engine default syncEnabled remains false ===');
{
  const { dir } = makeProject();
  const store = memoryStore();
  // Fresh batch text for this apply (c already would have changed if same dir; new project)
  const created = await storeLib.createCorrection(
    store,
    {
      ...baseFields,
      newValue: 'CLI path text',
      autoApprove: true,
    },
    { email: 'cli@local', isAdmin: true, projectRoot: dir },
  );
  // Engine/CLI path: do NOT pass syncEnabled (same as apply-content-corrections.mjs)
  const cliOpts = {
    email: 'cli@local',
    projectRoot: dir,
    dryRun: false,
    // syncEnabled intentionally omitted
  };
  assert(cliOpts.syncEnabled === undefined, 'CLI omits syncEnabled');
  const defaults = applyLib.buildAdminApplyOptions({}, 'x');
  assert(defaults.syncEnabled === true, 'admin helper still defaults true');

  const dryCli = await applyLib.applyCorrection(store, created.correction.id, {
    ...cliOpts,
    dryRun: true,
  });
  assert(dryCli.ok && dryCli.dryRun, 'CLI dry-run ok');

  const result = await applyLib.applyCorrection(store, created.correction.id, cliOpts);
  assert(result.ok && result.applied, 'CLI-style apply ok');
  assert(result.correction.syncStatus === 'sync_pending', 'CLI → sync_pending');
  assert(result.sync?.skipped === true, 'sync skipped');
  const hist = result.correction.history || [];
  assert(
    hist.some((h) => h.action === 'sync' && h.note === 'syncEnabled=false'),
    'history notes syncEnabled=false',
  );
  const seed = JSON.parse(fs.readFileSync(path.join(dir, 'library', 'reusable-seed', 'de_B1.json'), 'utf8'));
  assert(seed.records[0].questions[0].text === 'Alttext', 'seed untouched on CLI path');
  console.log('PASS (d)', {
    syncStatus: result.correction.syncStatus,
    syncSkipped: result.sync?.skipped,
    seedUnchanged: seed.records[0].questions[0].text,
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\nadminAutoApproveAndSync.test.mjs: ALL PASS');
