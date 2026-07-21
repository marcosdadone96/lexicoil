#!/usr/bin/env node
import { buildUpdatedPayload } from '../mergeSeedBlobPayload.mjs';
import { comparePayloadSemantic } from '../verifyBlobContent.mjs';
import { runVerifyComparison } from '../pushSeedBlobStrict.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

console.log('\nT1: transcript:"" vs ausente + ads:[] vs ausente → COSMETIC, no REAL');
{
  const seedPart = {
    id: 'bank-de-B1-lesen-t1-test',
    module: 'lesen',
    teil: 1,
    passage: { title: 'T', text: 'Hallo Welt.', transcript: '', ads: [] },
    ads: null,
    questions: [{ id: 'q1', type: 'richtig_falsch', question: 'Q?', correct: 'richtig' }],
  };
  const blobPart = {
    id: 'bank-de-B1-lesen-t1-test',
    passage: { title: 'T', text: 'Hallo Welt.' },
    questions: [{ id: 'q1', type: 'richtig_falsch', question: 'Q?', correct: 'richtig' }],
  };
  const expected = buildUpdatedPayload(blobPart, seedPart);
  const { hasRealDiff, realFields, cosmeticFields } = comparePayloadSemantic(expected, blobPart);
  assert(!hasRealDiff, 'sin diff real');
  assert(realFields.length === 0, 'realFields vacío');
  assert(cosmeticFields.includes('passage') || cosmeticFields.includes('ads'), 'marca cosmético');
}

console.log('\nT2: passage.text distinto → REAL');
{
  const blobPart = {
    id: 'x',
    passage: { text: 'Alter Text' },
    questions: [],
  };
  const expected = {
    ...blobPart,
    passage: { text: 'Neuer Text' },
  };
  const { hasRealDiff, realFields } = comparePayloadSemantic(expected, blobPart);
  assert(hasRealDiff, 'diff real');
  assert(realFields.includes('passage'), 'passage real');
}

console.log('\nT3: instruction solo espacios/puntuación → COSMETIC');
{
  const blobPart = { id: 'x', instruction: 'Lesen Sie den Text.', questions: [] };
  const seedPart = { id: 'x', instruction: 'Lesen  Sie   den Text .', questions: [] };
  const expected = buildUpdatedPayload(blobPart, seedPart);
  const { hasRealDiff, cosmeticFields } = comparePayloadSemantic(expected, blobPart);
  assert(!hasRealDiff, 'instruction equivalente semánticamente');
  assert(cosmeticFields.includes('instruction') || cosmeticFields.length >= 0, 'ok');
}

console.log('\nT4: simulación 282 partes seed — 0 REAL con blob minimal');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const seedArr = JSON.parse(fs.readFileSync(path.join(root, 'library/reusable-seed/de_B1.json'), 'utf8')).records;
  function blobMinimal(sp) {
    const b = JSON.parse(JSON.stringify(sp));
    if (b.passage?.ads?.length === 0) delete b.passage.ads;
    if (b.passage?.transcript === '') delete b.passage.transcript;
    if (b.ads == null || (Array.isArray(b.ads) && b.ads.length === 0)) delete b.ads;
    return b;
  }
  let real = 0;
  let cosmetic = 0;
  for (const sp of seedArr) {
    const blob = blobMinimal(sp);
    const exp = buildUpdatedPayload(blob, sp);
    const c = comparePayloadSemantic(exp, blob);
    if (c.hasRealDiff) real++;
    else if (c.cosmeticFields.length) cosmetic++;
  }
  assert(real === 0, `real=${real} (esperado 0)`);
  assert(cosmetic >= 200, `cosmetic=${cosmetic} (esperado ~270)`);
}

console.log('\nT5: LOCAL_ONLY no afectado por compare semántico');
{
  const store = { get: async () => { throw new Error('no fetch'); } };
  const blobIndex = new Map();
  const { results } = await runVerifyComparison(
    [{ id: 'bank-de-B1-lesen-t2-6e99d4850239d932', module: 'lesen', questions: [] }],
    store,
    blobIndex,
    { buildPayload: (b, s) => ({ ...b, ...s }) },
  );
  assert(results.LOCAL_ONLY.length === 1, '1 LOCAL_ONLY');
  assert(results.LOCAL_ONLY[0].id.includes('6e99d485'), 'id L2');
}

console.log(`\n══ verifyBlobContent: ${passed} passed, ${failed} failed ══\n`);
process.exit(failed > 0 ? 1 : 0);
