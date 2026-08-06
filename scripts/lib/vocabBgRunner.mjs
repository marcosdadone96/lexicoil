/**
 * vocabBgRunner.mjs — full background vocab generation cycle.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';
import { planVocabBgGeneration } from './planVocabBgGeneration.mjs';
import { generatePoolPart } from './poolFillTeilLib.mjs';
import { publishExamBatchToPool, defaultPoolFile } from './publishToPool.mjs';
import { recordGenerationOutcome } from './coverageRegistry.mjs';
import { attachVocabFeedback } from './generationFeedback.mjs';
import {
  verifyBgAnchorIntegration,
  MIN_BG_ANCHOR_INTEGRATED,
} from './vocabBgAnchorGate.mjs';

const require = createRequire(import.meta.url);
const { isPartPoolReady } = require(path.join(ROOT, 'scripts/audit-pass-2.mjs'));
const { addReusablePart } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { clearLocalSeedCache } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));
const { clearPoolSearchCache } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

function loadBatch(relFile) {
  const fs = require('node:fs');
  const abs = path.isAbsolute(relFile) ? relFile : path.join(ROOT, relFile);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

async function runGenerationAttempt(plan, opts, strictAnchor = false) {
  const anchorWords = plan.userAnchor?.length
    ? plan.userAnchor
    : (plan.words || []).slice(0, MIN_BG_ANCHOR_INTEGRATED);
  const genWords = strictAnchor
    ? [...new Set([...anchorWords, ...(plan.words || [])])].slice(0, 8)
    : plan.words;

  return generatePoolPart({
    module: plan.module,
    teil: plan.teil,
    topic: plan.topic,
    words: genWords,
    lang: opts.lang,
    level: opts.level,
    publish: false,
    fixRetries: opts.fixRetries ?? 2,
    maxApiCalls: opts.maxApiCalls ?? 30,
    maxAttemptsPerFile: opts.maxAttemptsPerFile ?? 3,
    vocabBgStrictAnchor: strictAnchor ? anchorWords : null,
    skipQuality: opts.skipQuality === true,
    testMode: opts.testMode === true,
  });
}

function evaluateAnchorGate(batch, plan) {
  const anchorWords = plan.userAnchor?.length
    ? plan.userAnchor
    : (plan.words || []).slice(0, MIN_BG_ANCHOR_INTEGRATED);
  if (anchorWords.length < MIN_BG_ANCHOR_INTEGRATED) {
    return {
      ok: true,
      skipped: true,
      anchorWords,
      used: [],
      batch,
    };
  }
  const check = verifyBgAnchorIntegration(batch, anchorWords);
  const withFeedback = batch.userVocabFeedback
    ? batch
    : attachVocabFeedback(batch, plan.words || [], { topic: plan.topic, prompted: plan.words });
  return { ...check, anchorWords, batch: withFeedback };
}

/**
 * @param {object} opts
 * @param {object} opts.store — Netlify blob store (optional)
 * @param {object[]} opts.pendingWords
 * @param {string} opts.preferredModule
 * @param {string} opts.email — for logging only, never stored in record
 * @param {string} opts.requestId
 */
export async function runVocabBgGeneration(opts = {}) {
  const lang = opts.lang || 'de';
  const level = opts.level || 'B1';
  const requestId = opts.requestId || crypto.randomUUID();

  const plan = planVocabBgGeneration({
    pendingWords: opts.pendingWords || [],
    preferredModule: opts.preferredModule,
    lang,
    level,
    vocabCursor: opts.vocabCursor || 0,
  });

  const gen = await runGenerationAttempt(plan, {
    lang,
    level,
    fixRetries: opts.fixRetries,
    maxApiCalls: opts.maxApiCalls,
    maxAttemptsPerFile: opts.maxAttemptsPerFile,
    skipQuality: opts.skipQuality,
    testMode: opts.testMode,
  });

  if (!gen.ok || !gen.file) {
    return {
      ok: false,
      stage: gen.stage || 'generate',
      reason: gen.reason || 'generation_failed',
      plan,
      requestId,
    };
  }

  let batch = gen.batch || loadBatch(gen.file);
  let anchorGate = evaluateAnchorGate(batch, plan);

  if (!anchorGate.ok && !anchorGate.skipped) {
    console.warn(
      `[vocab-bg] anchor gate FAIL: ${anchorGate.count}/${anchorGate.minHits} (${anchorGate.notUsed?.join(', ') || 'none'}) — retry strict`,
    );
    const retryGen = await runGenerationAttempt(
      plan,
      {
        lang,
        level,
        fixRetries: opts.fixRetries,
        maxApiCalls: opts.maxApiCalls,
        maxAttemptsPerFile: opts.maxAttemptsPerFile,
        skipQuality: opts.skipQuality,
      },
      true,
    );
    if (retryGen.ok && retryGen.file) {
      batch = retryGen.batch || loadBatch(retryGen.file);
      anchorGate = evaluateAnchorGate(batch, plan);
      if (anchorGate.ok) {
        gen.file = retryGen.file;
      }
    }
  }

  if (!anchorGate.ok && !anchorGate.skipped) {
    return {
      ok: false,
      stage: 'anchor_gate',
      reason: anchorGate.reason || 'anchor_integration_insufficient',
      plan,
      file: gen.file,
      requestId,
      anchorGate: {
        count: anchorGate.count,
        minHits: anchorGate.minHits,
        used: anchorGate.used,
        notUsed: anchorGate.notUsed,
        anchors: anchorGate.anchorWords,
      },
    };
  }

  batch = anchorGate.batch || batch;
  const integratedAnchors =
    anchorGate.used?.length >= MIN_BG_ANCHOR_INTEGRATED
      ? anchorGate.used
      : plan.userAnchor?.length
        ? plan.userAnchor
        : plan.words.slice(0, MIN_BG_ANCHOR_INTEGRATED);

  if (!anchorGate.skipped && anchorGate.ok) {
    console.log(
      `[vocab-bg] anchor gate OK: ${anchorGate.count}/${anchorGate.minHits} — ${integratedAnchors.join(', ')}`,
    );
  }

  const gate = await isPartPoolReady(batch, {
    semantic: opts.skipQuality !== true,
    skipSem2: true,
  });
  if (!gate.ok) {
    return {
      ok: false,
      stage: 'pool2_gate',
      reason: `POOL-2: ${gate.blocking?.length || 0} blocking`,
      plan,
      file: gen.file,
      requestId,
    };
  }

  const poolFile = defaultPoolFile(lang, level);
  const bgAt = new Date().toISOString();

  if (opts.testMode) {
    console.log('[vocab-bg] testMode — omitiendo publicación a pool (solo evidencia local)');
    recordGenerationOutcome({
      lang,
      level,
      module: plan.module,
      teil: plan.teil,
      topic: plan.topic,
      requestedWords: plan.words,
      batch,
      published: false,
    });
    return {
      ok: true,
      requestId,
      plan,
      file: gen.file,
      poolId: null,
      record: null,
      module: plan.module,
      teil: plan.teil,
      words: plan.words,
      userAnchor: integratedAnchors,
      anchorGate: anchorGate.skipped
        ? null
        : { integrated: anchorGate.used, planned: anchorGate.anchorWords },
      testMode: true,
    };
  }

  const pvFile = path.basename(String(gen.file || '').replace(/\\/g, '/'), '.json');
  const pub = await publishExamBatchToPool(batch, {
    lang,
    level,
    module: plan.module,
    teil: plan.teil,
    topicTag: plan.topic,
    poolFile,
    store: opts.store || null,
    sourceFile: gen.file,
    recordId: pvFile,
    contributor: 'vocab-bg-pipeline',
    bgGenerated: true,
    bgVocabLemmas: integratedAnchors,
    bgGenAt: bgAt,
  });

  if (pub?.queued) {
    return {
      ok: false,
      stage: 'publish_queued',
      reason: 'publish_queued_for_lock',
      plan,
      file: gen.file,
      requestId,
      queued: true,
      jobId: pub.jobId,
    };
  }

  if (!pub?.ok) {
    return {
      ok: false,
      stage: 'publish',
      reason: pub?.error || pub?.message || 'publish_failed',
      plan,
      file: gen.file,
      requestId,
      poolDedup: pub?.reason === 'pool_dedup',
    };
  }

  if (opts.store && pub.record) {
    try {
      await addReusablePart(opts.store, pub.record, { deferRotate: false });
    } catch (err) {
      console.warn('[vocab-bg] blob sync failed:', err.message);
    }
  }

  // Safety net: ensure pool-verified id is in seed/blobs (finalizePoolReady hook may have run earlier).
  try {
    const { syncPoolVerifiedBatch } = await import('./autoSyncPersonalPoolLib.mjs');
    await syncPoolVerifiedBatch({
      file: `${pvFile}.json`,
      batch,
      level,
      opts: {
        lang,
        module: plan.module,
        teil: plan.teil,
        topicTag: plan.topic,
        store: opts.store || null,
        contributor: 'vocab-bg-pipeline',
        bgGenerated: true,
        bgVocabLemmas: integratedAnchors,
        bgGenAt: bgAt,
        trigger: `vocab-bg:${pvFile}`,
        skipLock: true,
      },
    });
  } catch (err) {
    console.warn('[vocab-bg] auto-sync safety net failed:', err.message);
  }

  try {
    clearLocalSeedCache();
    clearPoolSearchCache();
  } catch {
    /* optional */
  }

  recordGenerationOutcome({
    lang,
    level,
    module: plan.module,
    teil: plan.teil,
    topic: plan.topic,
    requestedWords: plan.words,
    batch,
    published: true,
  });

  return {
    ok: true,
    requestId,
    plan,
    file: gen.file,
    poolId: pub.id,
    record: pub.record,
    module: plan.module,
    teil: plan.teil,
    words: plan.words,
    userAnchor: integratedAnchors,
    anchorGate: anchorGate.skipped
      ? null
      : { integrated: anchorGate.used, planned: anchorGate.anchorWords },
  };
}
