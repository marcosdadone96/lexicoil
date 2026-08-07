#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  parsePoolVerifiedMeta,
  resolveSyncTeils,
} from '../autoSyncPersonalPoolLib.mjs';

const meta057 = parsePoolVerifiedMeta('schreiben-gemini-057.json');
const batchT1 = {
  level: 'A2',
  questions: [{ module: 'schreiben', teil: 1 }],
};
assert.equal(meta057.bundle, true);
assert.deepEqual(
  resolveSyncTeils({ meta: meta057, batch: batchT1, mod: 'schreiben', lv: 'A2' }),
  [1],
);

const meta058 = parsePoolVerifiedMeta('schreiben-gemini-058.json');
const batchT2 = {
  level: 'A2',
  questions: [{ module: 'schreiben', teil: 2 }],
};
assert.deepEqual(
  resolveSyncTeils({ meta: meta058, batch: batchT2, mod: 'schreiben', lv: 'A2' }),
  [2],
);

const metaCur = parsePoolVerifiedMeta('schreiben-cur-education.json');
const batchBoth = {
  level: 'A2',
  questions: [{ teil: 1 }, { teil: 2 }],
};
assert.equal(metaCur.bundle, true);
assert.deepEqual(
  resolveSyncTeils({ meta: metaCur, batch: batchBoth, mod: 'schreiben', lv: 'A2' }),
  [1, 2],
);

const metaB1 = parsePoolVerifiedMeta('schreiben-gemini-012.json');
assert.deepEqual(
  resolveSyncTeils({
    meta: metaB1,
    batch: { questions: [{ teil: 1 }, { teil: 2 }, { teil: 3 }] },
    mod: 'schreiben',
    lv: 'B1',
  }),
  [1, 2, 3],
);

const metaSpT1 = parsePoolVerifiedMeta('sprechen-t1-gemini-016.json');
assert.equal(metaSpT1.bundle, false);
assert.deepEqual(
  resolveSyncTeils({
    meta: metaSpT1,
    batch: { questions: [{ teil: 1 }] },
    mod: 'sprechen',
    lv: 'A2',
  }),
  [1],
);

console.log('PASS: autoSync per-Teil oral resolveSyncTeils');
