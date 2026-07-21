/**
 * Auto-publish exams — unit + integration (e4 republication + simulated 5th slot).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';
import {
  planAutoPublishSlots,
  listLivePublishedSlots,
} from './lib/verifiedExamPublishLib.mjs';
import { maybeAutoPublishExams } from './lib/autoPublishExamsLib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(ROOT, 'library/published-exams/de/B1/_catalog.json');
const E4_DOC = path.join(ROOT, 'library/published-exams/de/B1/official-de-B1-e4.json');
const SERVED = path.join(ROOT, 'data/exams/de_B1.json');

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const bak = `${file}.bak-auto-publish-test`;
  fs.copyFileSync(file, bak);
  return bak;
}

function restore(file, bak) {
  if (bak && fs.existsSync(bak)) {
    fs.copyFileSync(bak, file);
    fs.unlinkSync(bak);
  }
}

// ── unit: planner ──
assert.deepEqual(
  planAutoPublishSlots({ capacity: 4, liveSlots: [1, 2, 3], assembledSlots: [1, 2, 3, 4] }),
  [4],
  'plan slot 4 when capacity=4 and 3 live',
);
assert.deepEqual(
  planAutoPublishSlots({ capacity: 5, liveSlots: [1, 2, 3, 4], assembledSlots: [1, 2, 3, 4, 5] }),
  [5],
  'plan slot 5 when capacity=5 and 4 live (simulated stock)',
);
assert.deepEqual(
  planAutoPublishSlots({ capacity: 4, liveSlots: [1, 2, 3, 4], assembledSlots: [1, 2, 3, 4] }),
  [],
  'nothing to publish when catalog matches capacity',
);

// ── integration: auto-publish e4 from catalog-with-3 state ──
const catalogBak = backup(CATALOG);
const e4Bak = backup(E4_DOC);
const servedBak = backup(SERVED);

try {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  catalog.exams = (catalog.exams || []).filter((e) => e.examId !== 'official-de-B1-e4');
  catalog.version = new Date().toISOString();
  fs.writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
  if (fs.existsSync(E4_DOC)) fs.unlinkSync(E4_DOC);

  const before = listLivePublishedSlots('de', 'B1');
  assert.equal(before.length, 3, 'test setup: 3 live exams');

  const result = await maybeAutoPublishExams({
    lang: 'de',
    level: 'B1',
    trigger: 'test-auto-publish',
    skipAssemble: true,
  });

  assert.ok(result.published?.includes(4), `auto-publish should publish slot 4: ${JSON.stringify(result)}`);
  assert.equal(result.liveCount, 4, 'catalog should have 4 live exams');

  const after = listLivePublishedSlots('de', 'B1');
  assert.deepEqual(after, [1, 2, 3, 4], 'live slots 1-4');
  assert.ok(fs.existsSync(E4_DOC), 'official-de-B1-e4.json written');

  const served = JSON.parse(fs.readFileSync(SERVED, 'utf8'));
  assert.equal(served.length, 4, 'served file has 4 exams');
  assert.ok(served.some((e) => e.examId === 'official-de-B1-e4'), 'served includes e4');

  // ── simulated 5th exam: capacity override + planner (no assembled e5 yet) ──
  process.env.AUTO_PUBLISH_TEST_CAPACITY = '5';
  const sim = await maybeAutoPublishExams({
    lang: 'de',
    level: 'B1',
    trigger: 'test-simulate-capacity-5',
    dryRun: true,
    skipAssemble: true,
  });
  delete process.env.AUTO_PUBLISH_TEST_CAPACITY;
  assert.equal(sim.capacity, 5, 'test capacity override');
  assert.deepEqual(sim.slotsToPublish, [], 'no slot 5 until assembled file exists');
  assert.deepEqual(
    planAutoPublishSlots({ capacity: 5, liveSlots: [1, 2, 3, 4], assembledSlots: [1, 2, 3, 4, 5] }),
    [5],
    'planner would publish slot 5 once stock + assembly exist',
  );

  console.log('All auto-publish tests passed.');
} finally {
  restore(CATALOG, catalogBak);
  restore(E4_DOC, e4Bak);
  restore(SERVED, servedBak);
}
