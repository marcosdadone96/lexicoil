#!/usr/bin/env node
/** Smoke test — Hören A2 T2 picture_matching (normalize → quality → exam part → render). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { partRecordToExamPart } from './audit-pass-2.mjs';
import { buildExamSeedRecordFromBatch } from './lib/publishToPool.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HPM = require(path.join(ROOT, 'js/engine/horenPictureMatching.js'));

const FIXTURE = path.join(ROOT, 'batches/fixtures/horen-a2-t2-picture-matching-smoke.json');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK  ', msg);
}

const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const normalized = normalizeBatch(raw, { module: 'horen', teil: 2, lang: 'de', level: 'A2' });

assert(normalized.passages[0].pictures?.length === 9, 'normalize: 9 pictures on passage');
assert(
  normalized.questions.every((q) => !q.options?.length && q._keyOnlyMatch),
  'normalize: questions sin options + _keyOnlyMatch',
);

const quality = checkHorenBatchQuality(normalized, 2, { level: 'A2' });
assert(quality.ok, `quality gate: ${quality.issues.join('; ') || 'ok'}`);

const struct = HPM.validatePictureMatchingBatch(normalized, { module: 'horen', teil: 2, level: 'A2' });
assert(struct.length === 0, `structure: ${struct.join('; ') || 'ok'}`);

const record = buildExamSeedRecordFromBatch(normalized, {
  module: 'horen',
  teil: 2,
  lang: 'de',
  level: 'A2',
});
assert(record.segments?.[0]?.pictures?.length === 9, 'pool record: segment has pictures');

const part = partRecordToExamPart(record);
part.instruction =
  'Sie hören ein Gespräch. Sie hören den Text einmal.\nWählen Sie für die Aufgaben 6 bis 10 ein passendes Bild aus a bis i.';
assert(part.blueprintSlot === 'picture_matching', 'exam part: blueprintSlot picture_matching');
assert(part.segments[0].pictures?.length === 9, 'exam part: segment pictures');

const runnerSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examRunner.js'), 'utf8');
assert(runnerSrc.includes('renderHorenPictureBank'), 'examRunner: picture bank renderer');
assert(runnerSrc.includes('renderHorenPictureMatchQuestion'), 'examRunner: picture match questions');

const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_A2.json'), 'utf8'));
const h2 = bp.modules.find((m) => m.id === 'horen').parts.find((p) => p.teil === 2);
assert(h2.slotType === 'picture_matching', 'blueprint T2 picture_matching');
assert(h2.pictureOptions === 9, 'blueprint pictureOptions 9');
assert(h2.uniqueAnswerKeys === true, 'blueprint uniqueAnswerKeys');

console.log('\nHören A2 T2 picture_matching smoke tests passed.');
