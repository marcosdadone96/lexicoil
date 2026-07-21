/**
 * content_corrector role — permissions + mandatory dry-run gate.
 *   node scripts/lib/__tests__/contentCorrectorRole.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const roles = require(path.join(ROOT, 'netlify/functions/lib/adminRoles.js'));
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

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-cc-role-'));
  const poolDir = path.join(dir, 'batches', 'ready', 'pool-verified');
  fs.mkdirSync(poolDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups', 'content-corrections'), { recursive: true });

  const batch = {
    module: 'lesen',
    teil: 1,
    lang: 'de',
    level: 'B1',
    questions: [
      {
        id: 'q-cc',
        type: 'multiple_choice',
        question: 'Test?',
        options: [
          { key: 'a', text: 'A' },
          { key: 'b', text: 'B' },
        ],
        correct: 'a',
      },
    ],
    passages: [{ id: 'p-cc', text: 'Texto de prueba.' }],
  };
  fs.writeFileSync(path.join(poolDir, 'lesen-t1-cc-role.json'), JSON.stringify(batch, null, 2));
  return { dir, batch };
}

async function testRoleMatrix() {
  assert(!roles.canUseAdminApi('content_corrector'), 'corrector must not use admin-api');
  assert(roles.canUseAdminApi('admin'), 'admin can use admin-api');
  assert(roles.canAccessContentCorrections('content_corrector'), 'corrector can access corrections API');
  assert(!roles.canManageAssemblyCorrections('content_corrector'), 'corrector cannot assembly');
  assert(roles.canManageAssemblyCorrections('admin'), 'admin can assembly');
  assert(roles.canApproveContentCorrections('content_corrector'), 'corrector can approve');
}

async function testCorrectorCanCreateContentNotAssembly() {
  const store = memoryStore();
  const { dir } = makeProject();

  const content = await storeLib.createCorrection(
    store,
    {
      origin: 'content',
      sourceFile: 'lesen-t1-cc-role',
      module: 'lesen',
      teil: 1,
      targetId: 'q-cc',
      targetType: 'question',
      fieldPath: 'question',
      oldValue: 'Test?',
      newValue: 'Test corregido?',
      reason: 'typo fix',
      autoApprove: true,
    },
    { email: 'corrector@test', canApprove: true, isAdmin: false, projectRoot: dir },
  );
  assert(content.ok && content.correction?.status === 'approved', 'content corrector auto-approve');

  const assembly = await storeLib.createCorrection(
    store,
    {
      origin: 'assembly',
      assemblyStage: 'exam_builder',
      assemblyContext: { builderFunction: 'buildExam.pickLesen' },
      module: 'lesen',
      teil: 1,
      fieldPath: 'instruction',
      oldValue: 'old',
      newValue: 'new',
      reason: 'assembly tweak',
    },
    { email: 'corrector@test', canApprove: true, isAdmin: false, projectRoot: dir },
  );
  assert(assembly.ok, 'store accepts assembly; API must block');
}

async function testDryRunRequiredBeforeApply() {
  const store = memoryStore();
  const { dir } = makeProject();

  const created = await storeLib.createCorrection(
    store,
    {
      origin: 'content',
      sourceFile: 'lesen-t1-cc-role',
      module: 'lesen',
      teil: 1,
      targetId: 'q-cc',
      targetType: 'question',
      fieldPath: 'question',
      oldValue: 'Test?',
      newValue: 'Test corregido?',
      reason: 'typo fix',
      autoApprove: true,
    },
    { email: 'corrector@test', canApprove: true, projectRoot: dir },
  );
  const id = created.correction.id;

  const blocked = await applyLib.applyCorrection(store, id, {
    email: 'corrector@test',
    projectRoot: dir,
    dryRun: false,
  });
  assert(blocked.error === 'confirm_required', `apply without dry-run blocked: ${blocked.error}`);

  const dry = await applyLib.applyCorrection(store, id, {
    email: 'corrector@test',
    projectRoot: dir,
    dryRun: true,
  });
  assert(dry.ok && dry.dryRun, 'dry-run ok');

  const applied = await applyLib.applyCorrection(store, id, {
    email: 'corrector@test',
    projectRoot: dir,
    dryRun: false,
  });
  assert(applied.ok && applied.applied, 'apply after dry-run ok');
}

async function testAdminApiRoleGate() {
  const { canUseAdminApi, canAccessContentCorrections } = roles;
  const corrector = 'content_corrector';
  assert(!canUseAdminApi(corrector), 'add_admin / staging / set_plan blocked');
  assert(canAccessContentCorrections(corrector), 'corrections allowed');
}

async function main() {
  await testRoleMatrix();
  await testCorrectorCanCreateContentNotAssembly();
  await testDryRunRequiredBeforeApply();
  await testAdminApiRoleGate();
  console.log('contentCorrectorRole.test.mjs — all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
