#!/usr/bin/env node
/**
 * Official reserved index — unit + smoke tests.
 * Run: node scripts/lib/__tests__/official-reserved-index.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../loadEnv.mjs';

const require = createRequire(import.meta.url);
const {
  buildOfficialReservedIndex,
  loadOfficialReservedIndex,
  applyOfficialReservedFlags,
  reservedPartIdSet,
  readAvailabilityExamCount,
  summarizeIndex,
  localOfficialIndexPath,
  officialReservedIndexBlobKey,
  INDEX_VERSION,
} = require(path.join(ROOT, 'netlify/functions/lib/officialReservedIndex.js'));
const { filterRows } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

// ── Build against synced B1 catalog (19 live exams) ─────────────────────────
const built = buildOfficialReservedIndex({ lang: 'de', level: 'B1', root: ROOT });
assert.equal(built.indexVersion, INDEX_VERSION);
assert.equal(built.lang, 'de');
assert.equal(built.level, 'B1');
assert.equal(built.liveExamCount, 19, 'B1 catalog must have 19 live exams (synced 2026-07-27)');
assert.equal(readAvailabilityExamCount('de', 'B1', ROOT), 19);
assert.ok(built.reservedPartIds.length > 0, 'reservedPartIds must not be empty');
assert.deepEqual(
  built.reservedPartIds,
  [...built.reservedPartIds].sort(),
  'reservedPartIds must be sorted',
);
assert.equal(built.buildMeta.missingManifests.length, 0, 'all 19 live manifests must exist locally');

const summary = summarizeIndex(built);
assert.ok(summary.byModule.lesen >= 60, `expected ~80 lesen reserved, got ${summary.byModule.lesen}`);
assert.ok(summary.byModule.horen >= 60, `expected horen reserved parts, got ${summary.byModule.horen}`);

// Known part from official-de-B1-e2 manifest
assert.ok(
  built.byPartId['lesen-t1-gemini-155'],
  'lesen-t1-gemini-155 must be reserved (e2 lesen_1)',
);
assert.deepEqual(built.byPartId['lesen-t1-gemini-155'].exams, ['official-de-B1-e2']);
assert.ok(built.byPartId['lesen-t1-gemini-155'].cells.includes('lesen_1'));

// e17–e19 must contribute parts (post-sync guard)
for (const examId of ['official-de-B1-e17', 'official-de-B1-e18', 'official-de-B1-e19']) {
  const found = Object.values(built.byPartId).some((m) => m.exams.includes(examId));
  assert.ok(found, `${examId} must appear in index after catalog sync`);
}

// ── Row flags + filterRows integration ──────────────────────────────────────
const rows = [
  {
    id: 'lesen-t1-gemini-155',
    teil: 1,
    complete: true,
    verified: true,
    disabled: false,
    part: {},
  },
  {
    id: 'lesen-t2-gemini-999-free',
    teil: 2,
    complete: true,
    verified: true,
    disabled: false,
    part: {},
  },
];
applyOfficialReservedFlags(rows, built);
assert.equal(rows[0].officialReserved, true);
assert.deepEqual(rows[0].officialExamIds, ['official-de-B1-e2']);
assert.equal(rows[1].officialReserved, false);
assert.deepEqual(rows[1].officialExamIds, []);

const textosEligible = filterRows(rows, { excludeOfficialReserved: true });
assert.equal(textosEligible.length, 1);
assert.equal(textosEligible[0].id, 'lesen-t2-gemini-999-free');

const practiceEligible = filterRows(rows, { excludeOfficialReserved: false });
assert.equal(practiceEligible.length, 2, 'custom exam practice keeps official-reserved parts');

// ── Committed index file smoke (if present) ─────────────────────────────────
const indexPath = localOfficialIndexPath('de', 'B1', ROOT);
if (fs.existsSync(indexPath)) {
  const loaded = loadOfficialReservedIndex({ lang: 'de', level: 'B1', root: ROOT, refresh: true });
  assert.equal(loaded.liveExamCount, 19);
  assert.equal(loaded.reservedPartIds.length, built.reservedPartIds.length);
  assert.equal(
    officialReservedIndexBlobKey('de', 'B1'),
    'official_reserved_parts:de:B1',
  );
  assert.deepEqual(
    reservedPartIdSet(loaded),
    reservedPartIdSet(built),
  );
}

console.log('PASS: official-reserved-index', JSON.stringify({
  liveExamCount: built.liveExamCount,
  reservedPartCount: built.reservedPartIds.length,
  byModule: summary.byModule,
  catalogVersion: built.catalogVersion,
}));
