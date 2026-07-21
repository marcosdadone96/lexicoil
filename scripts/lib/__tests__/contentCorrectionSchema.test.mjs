/**
 * Unit tests for contentCorrectionSchema (no Blobs required).
 *   node scripts/lib/__tests__/contentCorrectionSchema.test.mjs
 */
import { validateContentCorrection, STATUSES, ORIGINS } from '../contentCorrectionSchema.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const base = {
  sourceFile: 'horen-t2-gemini-006',
  module: 'horen',
  teil: 2,
  targetType: 'question',
  targetId: 'gen-q-h2-41c1f630-q4',
  fieldPath: 'questions.explanation',
  oldValue: 'old',
  newValue: 'new',
  reason: 'German naturalness',
};

const ok = validateContentCorrection(base);
assert(ok.ok, 'valid payload should pass');
assert(ok.value.status === 'pending', 'default status pending');
assert(ok.value.sourceFile === 'horen-t2-gemini-006', 'strip .json not needed');
assert(ok.value.origin === 'content', 'default origin content');

const withJson = validateContentCorrection({ ...base, sourceFile: 'horen-t2-gemini-006.json' });
assert(withJson.ok && withJson.value.sourceFile === 'horen-t2-gemini-006', 'normalize sourceFile');

const badIndex = validateContentCorrection({ ...base, fieldPath: 'questions[3].text' });
assert(
  !badIndex.ok && badIndex.errors.includes('fieldPath_array_index_forbidden'),
  'reject array indices with clear error',
);

const badStatus = validateContentCorrection({ ...base, status: 'done' });
assert(!badStatus.ok, 'reject bad status');

const partial = validateContentCorrection({ status: 'approved' }, { partial: true });
assert(partial.ok && partial.value.status === 'approved', 'partial status ok');

assert(STATUSES.includes('applied'), 'has applied');
assert(STATUSES.includes('conflict') && STATUSES.includes('failed'), 'has conflict/failed');
assert(ORIGINS.includes('content') && ORIGINS.includes('assembly'), 'has origins');

const assemblyOk = validateContentCorrection({
  origin: 'assembly',
  module: 'lesen',
  teil: 3,
  assemblyStage: 'PublishedExamAdapter.snapshotToExamPart',
  fieldPath: 'example',
  oldValue: 'dup',
  newValue: 'fixed',
  reason: 'Beispiel duplicated with question 7',
  assemblyContext: {
    builderFunction: 'PublishedExamAdapter.snapshotToExamPart',
    note: 'T3 example fallback copies zeroQ.question',
  },
});
assert(assemblyOk.ok, 'assembly payload should pass');
assert(assemblyOk.value.origin === 'assembly', 'assembly origin');
assert(assemblyOk.value.fieldPath === 'example', 'simple fieldPath');
assert(assemblyOk.value.assemblyContext.builderFunction === 'PublishedExamAdapter.snapshotToExamPart', 'builder');

const assemblyIndex = validateContentCorrection({
  origin: 'assembly',
  module: 'lesen',
  teil: 3,
  assemblyStage: 'PublishedExamAdapter.snapshotToExamPart',
  fieldPath: 'lesenParts[2].example',
  oldValue: 'a',
  newValue: 'b',
  reason: 'x',
  assemblyContext: { builderFunction: 'PublishedExamAdapter.snapshotToExamPart' },
});
assert(
  !assemblyIndex.ok && assemblyIndex.errors.includes('fieldPath_array_index_forbidden'),
  'assembly rejects indexed fieldPath',
);

const assemblyMissingCtx = validateContentCorrection({
  origin: 'assembly',
  module: 'lesen',
  teil: 3,
  assemblyStage: 'PublishedExamAdapter.snapshotToExamPart',
  fieldPath: 'example',
  oldValue: 'a',
  newValue: 'b',
  reason: 'x',
});
assert(
  !assemblyMissingCtx.ok && assemblyMissingCtx.errors.includes('missing_assemblyContext'),
  'assembly needs assemblyContext',
);

const contentMissingSource = validateContentCorrection({
  origin: 'content',
  module: 'lesen',
  teil: 1,
  targetType: 'passage',
  targetId: 'gen-l1-x',
  fieldPath: 'text',
  oldValue: 'a',
  newValue: 'b',
  reason: 'x',
});
assert(!contentMissingSource.ok && contentMissingSource.errors.includes('missing_sourceFile'), 'content needs sourceFile');

console.log('contentCorrectionSchema tests passed.');
