/**
 * Smoke tests for contentCorrectionsStore create/dedupe/ignore (in-memory store).
 *   node scripts/lib/__tests__/contentCorrectionsStore.test.mjs
 */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/contentCorrectionsStore.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key, opts) {
      if (!map.has(key)) return null;
      const v = map.get(key);
      return opts && opts.type === 'json' ? v : v;
    },
    async setJSON(key, val) {
      map.set(key, val);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

const base = {
  sourceFile: 'lesen-t1-gemini-136',
  module: 'lesen',
  teil: 1,
  targetType: 'passage',
  targetId: 'gen-l1-22499493',
  fieldPath: 'text',
  oldValue: 'Home',
  newValue: 'Zuhause',
  reason: 'German naturalness',
  comment: 'test',
};

const store = memoryStore();

const a = await storeLib.createCorrection(store, base, { email: 'a@test.com' });
assert(a.ok && a.correction && !a.reused && !a.ignored, 'first create');
assert(a.summary && a.summary.fieldPath === 'text', 'summary present');
assert(a.correctionId === a.correction.id, 'correctionId');
assert(a.correction.origin === 'content', 'default origin content');

const b = await storeLib.createCorrection(store, base, { email: 'b@test.com' });
assert(b.ok && b.reused === true, 'second create reused');
assert(b.correctionId === a.correction.id, 'same id');
assert(/pendiente/i.test(b.message || ''), 'reuse message');

const noop = await storeLib.createCorrection(
  store,
  { ...base, oldValue: 'same', newValue: 'same', fieldPath: 'title' },
  { email: 'a@test.com' },
);
assert(noop.ok && noop.ignored === true && noop.reason === 'no_changes', 'ignore no changes');

const other = await storeLib.createCorrection(
  store,
  { ...base, newValue: 'Wohnung', fieldPath: 'text' },
  { email: 'a@test.com' },
);
assert(other.ok && !other.reused && other.correction.id !== a.correction.id, 'different newValue is new');

assert(storeLib.valuesEqual(['a', 'b'], ['a', 'b']), 'valuesEqual arrays');
assert(!storeLib.valuesEqual('a', 'b'), 'valuesEqual differ');

const bad = await storeLib.createCorrection(store, { ...base, fieldPath: 'questions[0].text' }, {});
assert(!bad.ok && bad.errors.includes('fieldPath_array_index_forbidden'), 'reject index path');

// --- assembly origin (module+teil+example, no array index) ---
const assemblyPayload = {
  origin: 'assembly',
  module: 'lesen',
  teil: 3,
  assemblyStage: 'PublishedExamAdapter.snapshotToExamPart',
  fieldPath: 'example',
  oldValue: 'Beispiel text identical to question 7',
  newValue: 'Distinct Beispiel that does not duplicate question 7',
  reason: 'Lesen T3 Beispiel duplicated with question 7 — bug in assembly, not pool-verified JSON',
  comment: 'assembly-origin smoke',
  assemblyContext: {
    builderFunction: 'PublishedExamAdapter.snapshotToExamPart',
    bug: 'beispiel_duplicates_q7',
    note: 'When record.example is missing, T3 fallback copies zeroQ.question into part.example',
  },
};

const asm1 = await storeLib.createCorrection(store, assemblyPayload, { email: 'a@test.com' });
assert(asm1.ok && !asm1.reused && !asm1.ignored, 'assembly first create');
assert(asm1.correction.origin === 'assembly', 'assembly origin stored');
assert(asm1.correction.assemblyStage === 'PublishedExamAdapter.snapshotToExamPart', 'stage stored');
assert(asm1.correction.fieldPath === 'example', 'fieldPath example');
assert(asm1.correction.module === 'lesen' && asm1.correction.teil === 3, 'module+teil');

const asm2 = await storeLib.createCorrection(store, assemblyPayload, { email: 'b@test.com' });
assert(asm2.ok && asm2.reused === true, 'assembly second create reused');
assert(asm2.correctionId === asm1.correction.id, 'assembly same id');

// Same fieldPath "example" but different teil must NOT collide
const asmOtherTeil = await storeLib.createCorrection(
  store,
  { ...assemblyPayload, teil: 4, reason: 'other teil example' },
  { email: 'a@test.com' },
);
assert(asmOtherTeil.ok && !asmOtherTeil.reused, 'different teil is a new correction');
assert(asmOtherTeil.correctionId !== asm1.correctionId, 'different id for teil 4');

console.log('contentCorrectionsStore tests passed.');
