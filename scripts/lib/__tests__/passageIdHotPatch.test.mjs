/**
 * Passage/transcript id preservation + hot-patch on real assembler shapes.
 *   node scripts/lib/__tests__/passageIdHotPatch.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyHotPatchToExamData, MSG_HOT_PATCHED } from '../examSessionHotPatch.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PF = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const seed = require(path.join(ROOT, 'library/reusable-seed/de_B1.json'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('=== Lesen T1: assembler preserves passageId; hot-patch text ===');
{
  const poolPart = seed.records.find(
    (r) => r.module === 'lesen' && Number(r.teil) === 1 && r.passage?.text && r.questions?.[0]?.passageId,
  );
  assert(poolPart, 'seed lesen t1 found');
  const expectedPid = String(poolPart.questions[0].passageId);
  assert(!poolPart.passage.id && !poolPart.passage.passageId, 'seed passage object has no id (precondition)');

  const assembled = PF.reusablePartToLesenPart(poolPart);
  assert(assembled.teil === 1, 'teil 1');
  assert(assembled.passageId === expectedPid, `part.passageId=${assembled.passageId} expected ${expectedPid}`);
  assert(assembled.id === expectedPid, 'part.id set');
  assert(assembled.text && assembled.text.length > 20, 'has text');
  assert(assembled._poolPartId === poolPart.id, '_poolPartId is part record id, not passage');

  const exam = { lang: 'de', level: 'B1', lesenParts: [assembled] };
  const before = assembled.text;
  const r = applyHotPatchToExamData(exam, {
    targetId: expectedPid,
    fieldPath: 'text',
    newValue: 'HOTPATCHED LESEN T1 PASSAGE TEXT',
  });
  assert(r.patched === true, 'patched: ' + r.reason);
  assert(r.message === MSG_HOT_PATCHED, 'msg');
  assert(exam.lesenParts[0].text === 'HOTPATCHED LESEN T1 PASSAGE TEXT', 'text updated on part');
  assert(before !== exam.lesenParts[0].text, 'changed');
  console.log('PASS lesen T1', {
    passageId: expectedPid,
    _poolPartId: assembled._poolPartId,
    patchedText: exam.lesenParts[0].text.slice(0, 40),
  });
}

console.log('=== Hören T1: segments have id/passageId; hot-patch transcript via text field ===');
{
  const poolPart = seed.records.find(
    (r) => r.module === 'horen' && Number(r.teil) === 1 && Array.isArray(r.segments) && r.segments.length,
  );
  assert(poolPart, 'seed horen t1 with segments');
  const assembled = PF.reusablePartToHorenPart(poolPart);
  assert(Array.isArray(assembled.segments) && assembled.segments.length, 'has segments');
  const seg = assembled.segments[0];
  assert(seg.id, 'seg.id present: ' + seg.id);
  assert(seg.passageId != null || seg.id, 'seg locator');
  const targetId = String(seg.passageId || seg.id);
  const before = seg.transcript;
  const exam = { lang: 'de', level: 'B1', horenParts: [assembled] };
  const r = applyHotPatchToExamData(exam, {
    targetId,
    fieldPath: 'text', // admin passage modal uses fieldPath text
    newValue: 'HOTPATCHED HOREN SEGMENT TRANSCRIPT',
  });
  assert(r.patched === true, 'horen patched: ' + JSON.stringify(r));
  assert(
    exam.horenParts[0].segments[0].transcript === 'HOTPATCHED HOREN SEGMENT TRANSCRIPT',
    'segment transcript updated',
  );
  assert(before !== exam.horenParts[0].segments[0].transcript, 'changed');
  console.log('PASS horen T1', {
    targetId,
    segId: seg.id,
    segPassageId: seg.passageId,
    partPassageId: assembled.passageId,
  });
}

console.log('=== Lesen T2: nested passages keep passageId ===');
{
  const poolPart = seed.records.find(
    (r) =>
      r.module === 'lesen' &&
      Number(r.teil) === 2 &&
      (Array.isArray(r.passage?.passages) || r.questions?.some((q) => q.passageId === 'A' || q.passageId === 'B')),
  );
  if (!poolPart) {
    console.log('SKIP lesen T2 — no dual-passage seed record');
  } else {
    const assembled = PF.reusablePartToLesenPart(poolPart);
    if (Array.isArray(assembled.passages) && assembled.passages.length >= 2) {
      const pp = assembled.passages[0];
      assert(pp.passageId, 'nested passageId');
      const exam = { lesenParts: [assembled] };
      const r = applyHotPatchToExamData(exam, {
        targetId: String(pp.passageId),
        fieldPath: 'text',
        newValue: 'HOTPATCHED T2 PASSAGE A',
      });
      assert(r.patched === true, 't2 patched');
      assert(exam.lesenParts[0].passages[0].text === 'HOTPATCHED T2 PASSAGE A', 'nested text');
      console.log('PASS lesen T2', { passageId: pp.passageId });
    } else {
      console.log('SKIP lesen T2 nested — assembler did not emit passages[]', {
        hasText: !!assembled.text,
        passageId: assembled.passageId,
      });
    }
  }
}

console.log('\npassageIdHotPatch.test.mjs: ALL PASS');
