'use strict';

/**
 * Runtime ingest of AI-generated exam parts into Netlify Blobs staging queue.
 * Offline mirror: run scripts/export-remote-staging.mjs to pull into staging/.
 *
 * POST { lang, level, exam, autoApprove?: boolean }
 */
const { randomUUID } = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { validateGeneratedExam } = require('./lib/examQualityGate.js');
const { examPartsToStagingRecords } = require('./lib/stagingFromExam.js');
const {
  stagingCandidateKey,
  stagingIndexKey,
  loadStagingIndex,
  saveStagingIndex,
} = require('./lib/stagingStore.js');

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

  const isComplete = body.complete === true || exam.blueprintComplete === true;
  if (isComplete) {
    const gate = validateGeneratedExam(exam, { strict: false });
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

  let index = await loadStagingIndex(store, lang, level);

  const saved = [];
  for (const rec of records) {
    if (body.onlyCompleteParts !== false && !rec.validation?.valid && !body.allowInvalid) continue;
    const id = rec.id || randomUUID();
    rec.id = id;
    rec.status = body.autoApprove && rec.validation?.valid ? 'approved' : 'pending';
    rec.contributor = auth.email;
    rec.remote = true;
    await store.setJSON(stagingCandidateKey(lang, level, id), rec);
    index.push({
      id,
      module: rec.module,
      teil: rec.teil,
      status: rec.status,
      valid: !!rec.validation?.valid,
      createdAt: Date.now(),
    });
    saved.push({ id, module: rec.module, teil: rec.teil, valid: !!rec.validation?.valid });
  }

  await saveStagingIndex(store, lang, level, index);

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
    completeExamQueued: isComplete,
  });
};
