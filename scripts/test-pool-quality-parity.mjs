#!/usr/bin/env node
/**
 * Pool quality parity — pool ingest uses the same bar as servible exams.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { poolValidateExam } = require(path.join(ROOT, 'netlify/functions/exam-pool.js'));
const { loadBlueprintFileSync } = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));
const {
  validateStagingRecord,
  partExactTargetFromBlueprint,
} = require(path.join(ROOT, 'netlify/functions/lib/partQualityGate.js'));
const { approvePartToReusable, isAutoApprovable } = require(path.join(
  ROOT,
  'netlify/functions/lib/autoApprovePartToReusable.js',
));
const { addReusablePart, pickReusablePart } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function makeMockStore() {
  const blobs = new Map();
  return {
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && blobs.has(key)) return { modified: false };
      blobs.set(key, value);
      return { modified: true };
    },
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(key) {
      blobs.delete(key);
    },
    async list({ prefix }) {
      const keys = [...blobs.keys()].filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

function tfQuestion(i) {
  return {
    id: `q${i}`,
    type: 'richtig_falsch',
    question: `Aussage ${i} zum Text.`,
    correct: i % 2 ? 'Richtig' : 'Falsch',
  };
}

// ── (a) Short Teil exam rejected by exam-pool gate ───────────────────────────

const goetheBp = loadBlueprintFileSync('goethe_B1');
assert('goethe B1 blueprint loads', !!goetheBp?.modules?.length);

const lesenT1Target = partExactTargetFromBlueprint(goetheBp, 'lesen', 1);
assert('lesen T1 target known', lesenT1Target >= 3);

const shortTeilExam = {
  lang: 'de',
  level: 'B1',
  goetheFormat: true,
  lesenParts: [
    {
      teil: 1,
      text: 'Ein kurzer Text über Stadtgärten in Deutschland. Viele Menschen nutzen sie.',
      items: Array.from({ length: lesenT1Target - 2 }, (_, i) => tfQuestion(i + 1)),
    },
  ],
  horenParts: [
    {
      teil: 1,
      transcript: 'Moderator: Hallo. Gast: Guten Tag.',
      segments: [{ id: 'h1', question: 'Thema?', options: ['A) X', 'B) Y', 'C) Z'], correct: 'A' }],
    },
  ],
};

const poolGate = poolValidateExam(shortTeilExam, 'de', 'B1');
assert(
  '(a) short Teil exam rejected by exam-pool gate',
  !poolGate.valid && (poolGate.errors || []).length > 0,
);

// ── (b) Partial part: complete:false, not picked for assembly ────────────────

const partialRecord = {
  id: 'partial-lesen-t1',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  passage: {
    id: 'pass-partial',
    text: 'Stadtgärten werden immer beliebter. Sie bieten frische Produkte und Gemeinschaft.',
  },
  questions: Array.from({ length: lesenT1Target - 2 }, (_, i) => tfQuestion(i + 1)),
};

const partialGate = await validateStagingRecord(partialRecord, { blueprint: goetheBp, apiKey: null });
assert('(b) partial part passes staging with MIN_ITEMS', partialGate.valid);
assert('(b) partial part marked complete:false', partialGate.complete === false);
assert(
  '(b) partial part not auto-approvable',
  !isAutoApprovable(
    { ...partialRecord, validation: { valid: true }, complete: false },
    { blueprint: goetheBp, callerVerified: true },
  ),
);

const store = makeMockStore();
partialRecord.complete = partialGate.complete;
partialRecord.validation = { valid: partialGate.valid, complete: partialGate.complete };
await approvePartToReusable(store, partialRecord, { blueprint: goetheBp, verified: true });

const fullRecord = {
  id: 'full-lesen-t1',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  passage: {
    id: 'pass-full',
    text: 'Ein längerer Text über Stadtgärten. Kinder lernen über Pflanzen. Die Wartelisten sind lang.',
  },
  questions: Array.from({ length: lesenT1Target }, (_, i) => tfQuestion(i + 1)),
  complete: true,
  validation: { valid: true, complete: true },
};
await approvePartToReusable(store, fullRecord, { blueprint: goetheBp, verified: true });

const picked = await pickReusablePart(store, 'de', 'B1', 'lesen', { excludeIds: [] });
assert('(b) pickReusablePart returns a part', !!picked?.part);
assert('(b) incomplete part never served', picked.id === 'full-lesen-t1');

// ── (c) Non-renderable key rejected ────────────────────────────────────────

const badKeyRecord = {
  id: 'bad-key-lesen-t1',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  passage: { id: 'pass-bad', text: 'Text für ungültige Schlüssel.' },
  questions: [
    {
      id: 'bad-gap',
      type: 'gap',
      question: 'Das Wort lautet ____.',
      answer: 'Stadtgarten',
      correct: 'Stadtgarten',
    },
    ...Array.from({ length: lesenT1Target - 1 }, (_, i) => tfQuestion(i + 2)),
  ],
  validation: { valid: true },
};

const badGate = await validateStagingRecord(badKeyRecord, { blueprint: goetheBp, apiKey: null });
assert('(c) non-renderable key fails staging validation', !badGate.valid);
assert(
  '(c) staging errors mention non_renderable_key',
  (badGate.errors || []).some((e) => e.startsWith('non_renderable_key')),
);

const badApprove = await approvePartToReusable(store, badKeyRecord, { blueprint: goetheBp, verified: true });
assert('(c) approvePartToReusable rejects non-renderable keys', badApprove === null);

// ── (d) pickReusablePart teil filter ───────────────────────────────────────

const teilStore = makeMockStore();
await addReusablePart(teilStore, {
  id: 'lesen-t1-only',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 1,
  passage: { text: 'T1 passage.' },
  questions: Array.from({ length: lesenT1Target }, (_, i) => tfQuestion(i + 1)),
  complete: true,
  verified: true,
});
await addReusablePart(teilStore, {
  id: 'lesen-t3-only',
  lang: 'de',
  level: 'B1',
  module: 'lesen',
  teil: 3,
  passage: { text: '' },
  ads: Array.from({ length: 10 }, (_, i) => ({ key: String.fromCharCode(65 + i), text: `Ad ${i}.` })),
  questions: Array.from({ length: 7 }, (_, i) => ({
    id: String(13 + i),
    question: `Situation ${13 + i}.`,
    type: 'matching',
    correct: 'A',
  })),
  complete: true,
  verified: true,
});
const pickT3 = await pickReusablePart(teilStore, 'de', 'B1', 'lesen', { teil: 3 });
assert('(d) teil filter returns T3 part', pickT3?.id === 'lesen-t3-only' && Number(pickT3.part.teil) === 3);
const pickT1 = await pickReusablePart(teilStore, 'de', 'B1', 'lesen', { teil: 1 });
assert('(d) teil filter returns T1 part', pickT1?.id === 'lesen-t1-only' && Number(pickT1.part.teil) === 1);

console.log('\nPool quality parity tests passed.');
