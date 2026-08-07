/**
 * Auto-publish assembled official exams when pool-verified stock allows more than catalog.
 *
 * Hook points:
 *   - finalizePoolReady.mjs (after each new pool-verified part)
 *   - assemble-from-pool-verified.mjs (after assembly batch)
 *
 * Disable: AUTO_PUBLISH_EXAMS=0
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';
import {
  listAssembledSlots,
  listLivePublishedSlots,
  planAutoPublishSlots,
  publishVerifiedExamSlots,
  refreshAssembleCapacity,
  ensureAssembledExams,
} from './verifiedExamPublishLib.mjs';
import { isAutoPublishLevelSupported } from './examLevelCells.mjs';

const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs');

export function isAutoPublishEnabled() {
  return process.env.AUTO_PUBLISH_EXAMS !== '0';
}

/** Test-only override for capacity simulation. */
export function resolveCapacity(report, level = 'B1') {
  const testCap = Number(process.env.AUTO_PUBLISH_TEST_CAPACITY || 0);
  if (testCap > 0) return testCap;
  return Number(report?.capacity) || 0;
}

/**
 * Check capacity vs catalog and publish any new assembled exam slots.
 * @returns {Promise<object>}
 */
export async function maybeAutoPublishExams({
  lang = 'de',
  level = 'B1',
  mode = 'official',
  trigger = 'manual',
  dryRun = false,
  skipAssemble = false,
} = {}) {
  if (!isAutoPublishEnabled()) {
    return { skipped: true, reason: 'AUTO_PUBLISH_EXAMS=0' };
  }

  if (!isAutoPublishLevelSupported(lang, level)) {
    return { skipped: true, reason: `auto_publish_not_supported:${lang}/${level}` };
  }

  const report = refreshAssembleCapacity(level, mode);
  const capacity = resolveCapacity(report, level);
  const liveSlots = listLivePublishedSlots(lang, level);
  const assembledSlots = listAssembledSlots(level);

  if (!skipAssemble && capacity > assembledSlots.length) {
    ensureAssembledExams(capacity, level, mode);
  }
  const assembledAfter = listAssembledSlots(level);
  const slotsToPublish = planAutoPublishSlots({
    capacity,
    liveSlots,
    assembledSlots: assembledAfter,
  });

  const result = {
    trigger,
    capacity,
    bottleneck: report.bottlenecks?.[0] || null,
    liveSlots,
    assembledSlots: assembledAfter,
    slotsToPublish,
    published: [],
    dryRun,
  };

  if (!slotsToPublish.length) {
    result.skipped = true;
    result.reason = capacity <= liveSlots.length ? 'catalog_up_to_date' : 'no_assembled_slots';
    writeAutoPublishLog(result);
    return result;
  }

  if (dryRun) {
    result.wouldPublish = slotsToPublish;
    writeAutoPublishLog(result);
    return result;
  }

  const pub = await publishVerifiedExamSlots({
    slots: slotsToPublish,
    lang,
    level,
    dryRun: false,
    syncServed: true,
  });
  result.published = pub.published;
  result.liveCount = pub.liveCount;
  result.liveExams = pub.liveExams;
  writeAutoPublishLog(result);
  return result;
}

function writeAutoPublishLog(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, 'auto-publish-exams.jsonl');
    fs.appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch (_) {
    /* non-fatal */
  }
}

/**
 * Fire-and-forget wrapper for generation pipelines (non-blocking).
 */
export function scheduleAutoPublishExams(opts = {}) {
  if (!isAutoPublishEnabled()) return;
  setImmediate(() => {
    maybeAutoPublishExams(opts).catch((err) => {
      console.warn('[auto-publish] failed:', err?.message || err);
      writeAutoPublishLog({
        trigger: opts.trigger || 'scheduled',
        error: err?.message || String(err),
      });
    });
  });
}
