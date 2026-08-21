/**
 * servedExams.published-source.test.mjs
 *
 * Regression: scripts/pregenerate-tts.mjs read data/exams/<lang>_<level>.json unconditionally,
 * but index.html sets LEXICOIL_EXAM_SOURCE='published', so de/* is served from
 * library/published-exams/ through PublishedExamAdapter. The legacy de/B1 file lists 16 exams
 * and the published catalog has 19 (e17–e19 added in 4bb9d28), so those three never got their
 * Hören pregenerated — silence in prod for whoever opens them.
 *
 * Guards three things:
 *   a) the source is resolved the way the browser resolves it (published for de, legacy for en);
 *   b) every live catalog entry reaches the resolver — no exam silently dropped;
 *   c) for the exams that exist in BOTH sources the Hören text is identical, i.e. switching the
 *      source does not change a single cache hash for e1–e16 (no wasted credits, no re-record).
 *
 * Run:  node scripts/lib/__tests__/servedExams.published-source.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveServedExams,
  readExamSourceMode,
  publishedCatalogPath,
  legacyExamsPath,
} from '../servedExams.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let passed = 0;
let failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  OK   ${desc}`); passed++; }
  else { console.error(`  FAIL ${desc}`); failed++; }
}

/** Every Hören text a level would send to TTS, keyed by exam id. */
function horenTextsById(exams) {
  const byId = new Map();
  for (const exam of exams) {
    const texts = [];
    for (const part of exam.horenParts || []) {
      if (Array.isArray(part.segments) && part.segments.length) {
        part.segments.forEach((seg) => texts.push(String(seg.transcript || '')));
      } else {
        texts.push(String(part.transcript || ''));
      }
    }
    if (exam.horen?.transcript) texts.push(String(exam.horen.transcript));
    byId.set(String(exam.examId || exam.id || exam.topic), texts);
  }
  return byId;
}

// ── a) source resolution mirrors the browser ───────────────────────────────
assert("index.html still declares LEXICOIL_EXAM_SOURCE='published'", readExamSourceMode(ROOT) === 'published');

const deB1 = await resolveServedExams('de', 'B1', { root: ROOT });
assert('de/B1 resolves to the published catalog', deB1.source === 'published');

const deA2 = await resolveServedExams('de', 'A2', { root: ROOT });
assert('de/A2 resolves to the published catalog', deA2.source === 'published');

// English is not in PublishedExamAdapter.SUPPORTED, so it must stay on the legacy file.
// That file only lives on the English branch; on main the resolver must still route English
// to legacy and fail loudly on the missing file, never fall back to a published catalog.
const enFile = legacyExamsPath('en', 'B1', ROOT);
if (fs.existsSync(enFile)) {
  const enB1 = await resolveServedExams('en', 'B1', { root: ROOT });
  assert('en/B1 stays on data/exams/en_B1.json', enB1.source === 'legacy');
  assert('en/B1 serves its 3 curated exams', enB1.exams.length === 3);
} else {
  let message = '';
  try {
    await resolveServedExams('en', 'B1', { root: ROOT });
  } catch (err) {
    message = err.message;
  }
  assert('en/B1 routed to legacy (file absent on this branch)', message.includes('Missing served exams'));
}

// ── b) no live exam is dropped ─────────────────────────────────────────────
const catalog = JSON.parse(fs.readFileSync(publishedCatalogPath('de', 'B1', ROOT), 'utf8'));
const live = (catalog.exams || []).filter((e) => e.status === 'live').map((e) => e.examId);
const resolvedIds = deB1.exams.map((e) => String(e.examId || e.id));
assert(
  `de/B1 serves all ${live.length} live catalog exams`,
  live.length === resolvedIds.length && live.every((id) => resolvedIds.includes(id)),
);

const legacyB1 = await resolveServedExams('de', 'B1', { root: ROOT, source: 'legacy' });
const legacyIds = legacyB1.exams.map((e) => String(e.examId || e.id));
const missedByLegacy = live.filter((id) => !legacyIds.includes(id));
// This is the bug itself: it must stay visible, or the test is measuring nothing.
assert(
  `the legacy file still misses ${missedByLegacy.length} live exam(s) — the regression this guards`,
  missedByLegacy.length > 0 && missedByLegacy.every((id) => resolvedIds.includes(id)),
);

// ── c) shared exams are byte-identical, so no hash churn ───────────────────
const pub = horenTextsById(deB1.exams);
const leg = horenTextsById(legacyB1.exams);
const shared = [...leg.keys()].filter((id) => pub.has(id));
assert(`e1–e16 present in both sources (${shared.length} exams)`, shared.length === legacyIds.length);

const drifted = shared.filter((id) => {
  const a = pub.get(id);
  const b = leg.get(id);
  return a.length !== b.length || a.some((t, i) => t !== b[i]);
});
assert(
  'Hören text identical in both sources for every shared exam (no cache-hash churn)',
  drifted.length === 0,
);
if (drifted.length) console.error('       drifted:', drifted.join(', '));

// The published-only exams must actually carry Hören, or generating them is pointless.
const extraWithHoren = missedByLegacy.filter((id) => (pub.get(id) || []).some((t) => t.trim()));
assert(
  `published-only exams carry Hören transcripts (${extraWithHoren.length}/${missedByLegacy.length})`,
  extraWithHoren.length === missedByLegacy.length,
);

console.log(`\nserved exam source: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
