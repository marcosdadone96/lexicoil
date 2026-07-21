#!/usr/bin/env node
/**
 * pushSeedBlobStrict.test.mjs — fail-closed blob read guards.
 */
import {
  BlobStoreReadError,
  loadBlobIndexStrict,
  fetchBlobPayloadStrict,
  planPushOperations,
  runVerifyComparison,
  abortVerifyMessage,
} from '../pushSeedBlobStrict.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function partPayloadKey(lang, level, mod, id) {
  return `reusable_part:${lang}:${level}:${mod}:${id}`;
}

// ── T1: store.list failure → abort index load ────────────────────────────────
console.log('\nT1: store.list falla → loadBlobIndexStrict lanza BlobStoreReadError');
{
  const store = {
    list: async () => {
      throw new Error('fetch failed');
    },
    get: async () => null,
  };
  let threw = false;
  try {
    await loadBlobIndexStrict(store, { modules: ['lesen'], partPayloadKey });
  } catch (err) {
    threw = err instanceof BlobStoreReadError;
    assert(err.phase === 'index-list', 'phase=index-list');
    assert(/No se pudo leer el índice/.test(err.message), 'mensaje claro');
  }
  assert(threw, 'lanza BlobStoreReadError');
}

// ── T2: índice OK vacío → 0 entradas, sin error ─────────────────────────────
console.log('\nT2: store.list OK con 0 blobs → índice vacío real');
{
  const store = {
    list: async () => ({ blobs: [] }),
    get: async () => null,
  };
  const { blobIndex, indexStats } = await loadBlobIndexStrict(store, {
    modules: ['lesen'],
    partPayloadKey,
  });
  assert(blobIndex.size === 0, 'blobIndex.size=0');
  assert(indexStats.readOk === true, 'readOk=true');
}

// ── T3: id en índice + payload fetch falla → NO va a MISSING ────────────────
console.log('\nT3: payload fetch falla para id indexado → abort, no reclasificar UPLOAD');
{
  const id = 'pool3-de-B1-lesen-t3-test0001';
  const blobIndex = new Map([[id, { id, module: 'lesen', teil: 3 }]]);
  const store = {
    get: async (key) => {
      if (String(key).includes('idx')) return { partKey: `p:${id}`, id };
      throw new Error('fetch failed');
    },
  };
  let threw = false;
  try {
    await planPushOperations(
      [{ id, module: 'lesen', teil: 3, questions: [] }],
      store,
      blobIndex,
      { partPayloadKey },
    );
  } catch (err) {
    threw = err instanceof BlobStoreReadError;
    assert(err.phase === 'payload-fetch', 'phase=payload-fetch');
    assert(err.id === id, 'id en error');
  }
  assert(threw, 'planPushOperations lanza en vez de MISSING');
}

// ── T4: id NO en índice → MISSING (upload), sin fetch de payload ────────────
console.log('\nT4: id ausente del índice OK → MISSING (upload legítimo)');
{
  const store = {
    get: async () => {
      throw new Error('no debería fetchear payload');
    },
  };
  const { missing, differs } = await planPushOperations(
    [{ id: 'new-part-1', module: 'lesen', teil: 1, questions: [{ id: 'q1' }] }],
    store,
    new Map(),
    { partPayloadKey },
  );
  assert(missing.length === 1 && missing[0].id === 'new-part-1', 'clasificado MISSING');
  assert(differs.length === 0, 'sin DIFFERS');
}

// ── T5: simular apply bloqueado — writes no invocadas tras fallo de índice ───
console.log('\nT5: fallo de índice → apply simulado no escribe');
{
  let writes = 0;
  const store = {
    list: async () => {
      throw new Error('fetch failed');
    },
    get: async () => null,
    set: async () => {
      writes++;
    },
    setJSON: async () => {
      writes++;
    },
  };

  let aborted = false;
  try {
    await loadBlobIndexStrict(store, { modules: ['lesen'], partPayloadKey });
  } catch {
    aborted = true;
  }

  if (!aborted) {
    // would have continued to apply — simulate
    await store.set('x', 'y');
  }

  assert(aborted, 'abortó en loadBlobIndexStrict');
  assert(writes === 0, 'cero escrituras (set/setJSON)');
}

// ── T6: verify — índice falla → abort, cero divergencias reportadas ──────────
console.log('\nT6: verify — store.list falla → abort (no divergencias falsas)');
{
  const store = {
    list: async () => {
      throw new Error('fetch failed');
    },
    get: async () => null,
  };
  let aborted = false;
  let compareRan = false;
  try {
    await loadBlobIndexStrict(store, { modules: ['lesen'], partPayloadKey });
  } catch (err) {
    aborted = err instanceof BlobStoreReadError;
    assert(/No se pudo leer el índice/.test(err.message), 'mensaje índice');
    assert(abortVerifyMessage(err).includes('No se reportan divergencias'), 'abort verify claro');
  }
  if (!aborted) {
    compareRan = true;
    await runVerifyComparison(
      [{ id: 'x', module: 'lesen', questions: [] }],
      store,
      new Map(),
      { partPayloadKey },
    );
  }
  assert(aborted, 'verify aborta en loadBlobIndexStrict');
  assert(!compareRan, 'runVerifyComparison no ejecutado tras fallo de índice');
}

// ── T7: verify — payload fetch falla → abort, no LOCAL_ONLY falso ────────────
console.log('\nT7: verify — payload fetch falla → abort, no reclasificar LOCAL_ONLY');
{
  const id = 'bank-de-B1-lesen-t5-test0001';
  const blobIndex = new Map([[id, { id, module: 'lesen', teil: 5 }]]);
  const store = {
    get: async (key) => {
      if (String(key).includes('idx')) return { partKey: `p:${id}`, id };
      throw new Error('fetch failed');
    },
  };
  let threw = false;
  let localOnly = -1;
  try {
    const { results } = await runVerifyComparison(
      [{ id, module: 'lesen', teil: 5, questions: [{ id: 'q1', correct: 'a' }] }],
      store,
      blobIndex,
      {
        partPayloadKey,
        buildPayload: (blob, seed) => ({ ...blob, questions: seed.questions }),
      },
    );
    localOnly = results.LOCAL_ONLY.length;
  } catch (err) {
    threw = err instanceof BlobStoreReadError;
    assert(err.phase === 'payload-fetch', 'phase=payload-fetch');
  }
  assert(threw, 'runVerifyComparison lanza en fetch fallido');
  assert(localOnly === -1, 'sin tabla LOCAL_ONLY falsa');
}

// ── T8: verify — lectura OK + match → OK real, no abort ─────────────────────
console.log('\nT8: verify — blobs live leídos OK → OK legítimo');
{
  const id = 'bank-de-B1-lesen-t5-test0002';
  const blobPart = {
    id,
    questions: [{ id: 'q1', type: 'multiple', correct: 'c' }],
    passage: { text: 'hello' },
  };
  const blobIndex = new Map([[id, { id, module: 'lesen', teil: 5 }]]);
  const store = {
    get: async () => blobPart,
  };
  const { results } = await runVerifyComparison(
    [{ id, module: 'lesen', teil: 5, questions: [{ id: 'q1', type: 'multiple', correct: 'c' }] }],
    store,
    blobIndex,
    {
      partPayloadKey,
      buildPayload: (blob, seed) => ({ ...blob, questions: seed.questions }),
    },
  );
  assert(results.OK.length === 1, '1 OK');
  assert(results.LOCAL_ONLY.length === 0, '0 LOCAL_ONLY');
  assert(results.CONTENT_DIFFERS.length === 0, '0 CONTENT_DIFFERS');
}

console.log(`\n══ pushSeedBlobStrict: ${passed} passed, ${failed} failed ══\n`);
process.exit(failed > 0 ? 1 : 0);
