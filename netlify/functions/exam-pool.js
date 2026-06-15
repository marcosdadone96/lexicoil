'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { verifyAuthToken } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { validateGeneratedExam } = require('./lib/examQualityGate.js');
const {
  publishPoolExam,
  pickPoolExam,
  listPoolIndexEntries,
} = require('./lib/poolIndex.js');

function isValidExam(exam) {
  if (!exam || typeof exam !== 'object') return false;
  try {
    return validateGeneratedExam(exam).valid;
  } catch (err) {
    console.warn('[exam-pool] validate error:', err.message);
    return false;
  }
}

function parseExcludeSet(params) {
  const raw = String(params.exclude || '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40),
  );
}

function seedPoolPath(lang, level) {
  const name = `${lang}_${level}.json`;
  const candidates = [
    path.join(__dirname, 'library', 'pool-seed', name),
    path.join(__dirname, '..', '..', 'library', 'pool-seed', name),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function loadSeedPool(lang, level) {
  const file = seedPoolPath(lang, level);
  if (!file) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function isCuratedPoolEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.curated !== true) return false;
  if (!entry.provenance?.validatedBy) return false;
  if (entry.provenance?.cefrGate && entry.provenance.cefrGate.withinRange === false) return false;
  return true;
}

function strategyBEnabled() {
  return process.env.STRATEGY_B === '1';
}

function isValidPoolEntry(entry) {
  if (!entry?.exam || !isValidExam(entry.exam)) return false;
  if (strategyBEnabled() && !isCuratedPoolEntry(entry)) return false;
  return true;
}

function pickSeedEntry(lang, level, exclude) {
  const pool = loadSeedPool(lang, level).filter(
    (entry) => entry?.id && !exclude.has(entry.id) && isValidPoolEntry(entry),
  );
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function seedPoolResponse(entry, headers) {
  return jsonResponse(200, headers, {
    found: true,
    id: entry.id,
    exam: entry.exam,
    topic: entry.topic,
    source: 'pool',
  });
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  const store = getStoreForEvent(event);

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const lang = String(params.lang || '').trim().toLowerCase();
    const level = String(params.level || '').trim().toUpperCase();
    const exclude = parseExcludeSet(params);
    const getHeaders = { ...cors, 'Cache-Control': 'no-store' };
    if (!lang || !level) {
      return jsonResponse(400, getHeaders, { error: 'lang and level required' });
    }

    const chosen = await pickPoolExam(store, lang, level, exclude, {
      isValidEntry: isValidPoolEntry,
    });
    if (!chosen) {
      const seeded = pickSeedEntry(lang, level, exclude);
      if (seeded) return seedPoolResponse(seeded, getHeaders);
      return jsonResponse(200, getHeaders, { found: false });
    }

    return jsonResponse(200, getHeaders, {
      found: true,
      id: chosen.id,
      exam: chosen.entry.exam,
      topic: chosen.entry.topic,
      source: 'pool',
    });
  }

  if (event.httpMethod === 'POST') {
    const auth = verifyAuthToken(getBearer(event));
    if (!auth.ok) {
      return jsonResponse(401, cors, { error: 'login_required' });
    }
    const contributor = auth.email;

    let body;
    try {
      body = parseJsonBody(event);
    } catch (_) {
      return jsonResponse(400, cors, { error: 'invalid_json' });
    }

    const lang = String(body.lang || '').trim().toLowerCase();
    const level = String(body.level || '').trim().toUpperCase();
    const topic = String(body.topic || '').trim().slice(0, 120);
    const exam = body.exam;
    const gate = validateGeneratedExam(exam, {
      strict: strategyBEnabled(),
      cefrGate: strategyBEnabled(),
      curation: strategyBEnabled(),
    });
    if (!lang || !level || !gate.valid) {
      if (exam && !gate.valid) {
        console.warn('[exam-pool] rejected exam:', gate.errors);
      }
      return jsonResponse(400, cors, {
        error: 'invalid_fields',
        validationErrors: gate.valid ? undefined : gate.errors,
      });
    }
    if (/personal\s*vocabulary|^personal:/i.test(topic)) {
      return jsonResponse(400, cors, { error: 'invalid_topic' });
    }
    if (exam.vocabPersonal || (Array.isArray(exam.vocabWords) && exam.vocabWords.length)) {
      return jsonResponse(400, cors, { error: 'personal_exam_not_allowed' });
    }
    if (strategyBEnabled() && !body.curated && !body.provenance?.validatedBy) {
      return jsonResponse(400, cors, { error: 'curated_provenance_required' });
    }

    const id = randomUUID();
    const entry = {
      lang,
      level,
      topic,
      exam,
      servedCount: 0,
      createdAt: Date.now(),
      contributedBy: contributor,
    };
    const { examKey } = await publishPoolExam(store, { lang, level, id, entry });

    return jsonResponse(200, cors, { saved: true, key: examKey });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
