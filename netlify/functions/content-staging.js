'use strict';

/**
 * Runtime ingest of AI-generated exam parts into Netlify Blobs staging queue.
 * Offline mirror: run scripts/export-remote-staging.mjs to pull into staging/.
 *
 * POST { lang, level, exam, autoApprove?: boolean, verified?: boolean }
 *
 * Each part passes validateStagingRecord (structural + optional semantic verify)
 * before save. Auto-approve requires verified:true when EXAM_ANSWER_KEY_VERIFY=1.
 */
const { randomUUID } = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { validateGeneratedExam } = require('./lib/examQualityGate.js');
const { examPartsToStagingRecords } = require('./lib/stagingFromExam.js');
const { validateStagingRecord } = require('./lib/partQualityGate.js');
const {
  stagingCandidateKey,
  loadStagingIndex,
  saveStagingIndex,
} = require('./lib/stagingStore.js');
const { approvePartToReusable, isAutoApprovable } = require('./lib/autoApprovePartToReusable.js');
const { maybePromote, loadBlueprint } = require('./lib/promoteFromApproved.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'method_not_allowed' });
  }

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) {
    return jsonResponse(401, cors, { error: 'login_required' });
  }

  let body;
  try {
    body = parseJsonBody(event);
  } catch (_) {
    return jsonResponse(400, cors, { error: 'invalid_json' });
  }

  const lang = String(body.lang || '').trim().toLowerCase();
  const level = String(body.level || '').trim().toUpperCase();
  const exam = body.exam;
  if (!lang || !level || !exam) {
    return jsonResponse(400, cors, { error: 'invalid_fields' });
  }

  if (exam.vocabPersonal || (Array.isArray(exam.vocabWords) && exam.vocabWords.length)) {
    return jsonResponse(400, cors, { error: 'personal_exam_not_allowed' });
  }

  let blueprint = null;
  try {
    blueprint = loadBlueprint(lang, level);
  } catch (err) {
    console.warn('[content-staging] blueprint unavailable:', err.message);
  }

  const isComplete = body.complete === true || exam.blueprintComplete === true;
  if (isComplete) {
    const gate = validateGeneratedExam(exam, {
      blueprint,
      strict: true,
      cefrGate: true,
      curation: true,
    });
    if (!gate.valid) {
      return jsonResponse(400, cors, { error: 'invalid_exam', validationErrors: gate.errors });
    }
  }

  const store = getStoreForEvent(event);
  const records = examPartsToStagingRecords(exam, {
    lang,
    level,
    source: `runtime/ai:${auth.email}`,
    batchId: `remote-${Date.now()}`,
  });

  if (!records.length) {
    return jsonResponse(400, cors, { error: 'no_parts_extracted' });
  }

  const apiKey = String(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_DIRECT || '').trim() || null;
  const callerVerified = body.verified === true;
  const verifyRequired = process.env.EXAM_ANSWER_KEY_VERIFY === '1';

  let index = await loadStagingIndex(store, lang, level);

  const saved = [];
  const autoApprovedIds = [];
  let rejected = 0;

  for (const rec of records) {
    const gate = await validateStagingRecord(rec, { blueprint, apiKey });
    rec.questions = gate.questions;
    rec.validation = {
      valid: gate.valid,
      errors: gate.errors,
      itemCount: gate.itemCount,
      minItems: gate.minItems,
      targetCount: gate.targetCount,
      complete: gate.complete,
    };
    rec.complete = gate.complete;

    if (!gate.valid) {
      rejected += 1;
      continue;
    }

    const id = rec.id || randomUUID();
    rec.id = id;
    rec.contributor = auth.email;
    rec.remote = true;

    const shouldAutoApprove =
      isAutoApprovable(rec, { callerVerified, blueprint }) &&
      (!verifyRequired || callerVerified);

    rec.status = shouldAutoApprove ? 'approved' : 'pending';

    await store.setJSON(stagingCandidateKey(lang, level, id), rec);
    index.push({
      id,
      module: rec.module,
      teil: rec.teil,
      status: rec.status,
      valid: !!rec.validation?.valid,
      createdAt: Date.now(),
    });
    saved.push({
      id,
      module: rec.module,
      teil: rec.teil,
      valid: true,
      complete: !!rec.complete,
      autoApproved: shouldAutoApprove,
      itemCount: gate.itemCount,
    });

    if (shouldAutoApprove) autoApprovedIds.push(id);
  }

  await saveStagingIndex(store, lang, level, index);

  if (autoApprovedIds.length) {
    const approvedRecs = records.filter((r) => autoApprovedIds.includes(r.id));
    const reuseResults = await Promise.allSettled(
      approvedRecs.map((rec) => approvePartToReusable(store, rec, { blueprint, verified: true })),
    );
    const reuseOk = reuseResults.filter((r) => r.status === 'fulfilled' && r.value).length;
    if (reuseOk < approvedRecs.length) {
      console.warn(
        `[content-staging] reusable store: ${reuseOk}/${approvedRecs.length} parts stored`,
      );
    }
    void maybePromote(store, lang, level).catch((e) =>
      console.warn('[content-staging] maybePromote error:', e.message),
    );
  }

  if (isComplete && saved.length) {
    const poolKey = `staging_complete_exam:${lang}:${level}:${randomUUID()}`;
    await store.setJSON(poolKey, {
      lang,
      level,
      exam,
      contributor: auth.email,
      partIds: saved.map((s) => s.id),
      createdAt: Date.now(),
    });
  }

  return jsonResponse(200, cors, {
    saved: saved.length,
    parts: saved,
    autoApproved: autoApprovedIds.length,
    completeExamQueued: isComplete && saved.length > 0,
    rejected,
  });
};
