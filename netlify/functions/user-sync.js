'use strict';

/**
 * user-sync — GET/PUT user data (burned, flashcards, history, quota, preferences).
 *
 * Storage strategy:
 *   • If SUPABASE_SERVICE_ROLE_KEY is set → Supabase primary, Blobs secondary (dual-write)
 *   • Otherwise → Netlify Blobs only (original behaviour)
 *
 * This allows a zero-downtime migration: existing data in Blobs is served until
 * Supabase is populated, after which Supabase becomes the authoritative source.
 */

const { getStoreForEvent }    = require('./lib/blobStore.js');
const { getJwtSecret, requireAuth, syncKey } = require('./lib/authLib.js');
const { corsHeaders, parseJsonBody, jsonResponse } = require('./lib/http.js');
const sb = require('./lib/supabaseAdmin.js');

const MAX_BODY = 900_000;

// ── Sanitise payload (same as before — keeps limits / types safe) ─────────────
function sanitizeSync(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const flashcards  = Array.isArray(src.flashcards)  ? src.flashcards.slice(0, 500)  : [];
  const history     = Array.isArray(src.history)     ? src.history.slice(0, 200)     : [];
  const savedExams  = Array.isArray(src.savedExams)  ? src.savedExams.slice(0, 50)   : [];
  const activityLog = Array.isArray(src.activityLog) ? src.activityLog.slice(0, 100) : [];

  const studyTime = src.studyTime && typeof src.studyTime === 'object'
    ? {
        streak:        Math.max(0, Math.min(Number(src.studyTime.streak) || 0, 9999)),
        lastActiveDay: String(src.studyTime.lastActiveDay || '').slice(0, 10),
        monthKey:      String(src.studyTime.monthKey || '').slice(0, 7),
        monthSec:      Math.max(0, Math.min(Number(src.studyTime.monthSec) || 0, 9999999)),
        totalSec:      Math.max(0, Math.min(Number(src.studyTime.totalSec) || 0, 99999999)),
        byDay: src.studyTime.byDay && typeof src.studyTime.byDay === 'object' ? src.studyTime.byDay : {},
      }
    : { streak: 0, lastActiveDay: '', monthKey: '', monthSec: 0, totalSec: 0, byDay: {} };

  const mastery = src.mastery && typeof src.mastery === 'object' && src.mastery.profiles
    ? {
        profiles: Object.fromEntries(
          Object.entries(src.mastery.profiles).slice(0, 40).map(([key, profile]) => {
            const p = profile && typeof profile === 'object' ? profile : {};
            const trimTags = (map) =>
              Object.fromEntries(
                Object.entries(map || {}).slice(0, 120).map(([tag, stat]) => [
                  String(tag).slice(0, 80),
                  {
                    correct: Math.max(0, Math.min(Number(stat?.correct) || 0, 99999)),
                    total:   Math.max(0, Math.min(Number(stat?.total)   || 0, 99999)),
                    streak:  Math.max(0, Math.min(Number(stat?.streak)  || 0, 999)),
                  },
                ]),
              );
            return [String(key).slice(0, 80), {
              grammarTags:    trimTags(p.grammarTags),
              topicTags:      trimTags(p.topicTags),
              modules:        trimTags(p.modules),
              vocabularyGaps: Object.fromEntries(
                Object.entries(p.vocabularyGaps || {}).slice(0, 200).map(([w, c]) => [
                  String(w).slice(0, 60), Math.max(0, Math.min(Number(c) || 0, 999)),
                ]),
              ),
              examsTaken:  Math.max(0, Math.min(Number(p.examsTaken)  || 0, 9999)),
              lastUpdated: Math.max(0, Math.min(Number(p.lastUpdated) || 0, 9999999999999)),
            }];
          }),
        ),
      }
    : { profiles: {} };

  const trimTsMap = (map, keyMax) => {
    if (!map || typeof map !== 'object') return {};
    return Object.fromEntries(
      Object.entries(map).slice(0, 50000).map(([k, ts]) => [
        String(k).slice(0, keyMax),
        Math.max(0, Math.min(Number(ts) || 0, 9999999999999)),
      ]),
    );
  };
  const burned = src.burned && typeof src.burned === 'object'
    ? {
        v:      2,
        keys:   Array.isArray(src.burned.keys) ? src.burned.keys.slice(0, 50000).map((k) => String(k).slice(0, 32))  : [],
        ids:    Array.isArray(src.burned.ids)  ? src.burned.ids.slice(0, 50000).map((id) => String(id).slice(0, 120)) : [],
        keysTs: trimTsMap(src.burned.keysTs, 32),
        idsTs:  trimTsMap(src.burned.idsTs, 120),
      }
    : { v: 2, keys: [], ids: [], keysTs: {}, idsTs: {} };

  const quota = src.quota && typeof src.quota === 'object'
    ? { month: String(src.quota.month || '').slice(0, 16), used: Math.max(0, Math.min(Number(src.quota.used) || 0, 999)) }
    : { month: '', used: 0 };

  const preferences = src.preferences && typeof src.preferences === 'object'
    ? {
        translationLangs: Array.isArray(src.preferences.translationLangs) ? src.preferences.translationLangs.slice(0, 10).map((l) => String(l).slice(0, 5)) : ['en'],
        ttsVoices: src.preferences.ttsVoices && typeof src.preferences.ttsVoices === 'object' ? src.preferences.ttsVoices : {},
      }
    : { translationLangs: ['en'], ttsVoices: {} };

  const goals = Array.isArray(src.goals)
    ? src.goals.slice(0, 50).filter((g) => g && g.id)
    : [];
  const activeGoalId = src.activeGoalId ? String(src.activeGoalId).slice(0, 80) : null;

  const deletedSavedExams = Array.isArray(src.deletedSavedExams)
    ? src.deletedSavedExams.slice(0, 500).filter((t) => t && t.id).map((t) => ({
        id: String(t.id).slice(0, 120),
        deletedAt: Math.max(0, Math.min(Number(t.deletedAt) || 0, 9999999999999)),
      }))
    : [];

  const deletedFlashcards = Array.isArray(src.deletedFlashcards)
    ? src.deletedFlashcards.slice(0, 1000).filter((t) => t && t.key).map((t) => ({
        key: String(t.key).slice(0, 120),
        deletedAt: Math.max(0, Math.min(Number(t.deletedAt) || 0, 9999999999999)),
      }))
    : [];

  const notebook =
    src.notebook && typeof src.notebook === 'object' && Array.isArray(src.notebook.tabs)
      ? {
          tabs: src.notebook.tabs.slice(0, 100).map((t) => ({
            id: String(t.id || '').slice(0, 80),
            title: String(t.title || 'Notes').slice(0, 80),
            lang: String(t.lang || 'de').slice(0, 5),
            level: String(t.level || 'B1').slice(0, 4),
            examId: t.examId ? String(t.examId).slice(0, 120) : null,
            html: String(t.html || '').slice(0, 100000),
            updatedAt: Math.max(0, Math.min(Number(t.updatedAt) || 0, 9999999999999)),
          })),
        }
      : { tabs: [] };

  return {
    flashcards, history, savedExams, activityLog, studyTime, mastery, burned, quota, preferences,
    goals, activeGoalId, deletedSavedExams, deletedFlashcards, notebook, updatedAt: Date.now(),
  };
}

const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function mergeTombstones(local, server) {
  const map = new Map();
  for (const t of [...(server || []), ...(local || [])]) {
    if (!t) continue;
    const mapKey = t.id != null ? `i:${t.id}` : t.key != null ? `k:${t.key}` : null;
    if (!mapKey) continue;
    const prev = map.get(mapKey);
    const ts = Number(t.deletedAt) || 0;
    const prevTs = Number(prev?.deletedAt) || 0;
    if (!prev || ts >= prevTs) {
      map.set(
        mapKey,
        t.id != null
          ? { id: String(t.id), deletedAt: ts }
          : { key: String(t.key), deletedAt: ts },
      );
    }
  }
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  return [...map.values()].filter((t) => t.deletedAt >= cutoff);
}

function fcKey(fc) {
  const w = String(fc?.word || '').trim().toLowerCase();
  const lang = String(fc?.sourceLang || fc?.lang || '').trim().toLowerCase();
  return `${w}|${lang}`;
}

function isFcTombstoned(fc, tombstones) {
  const key = fcKey(fc);
  const fcTs = Number(fc.savedAt || fc.nextReview || 0);
  for (const t of tombstones || []) {
    if (String(t.key) === key && Number(t.deletedAt) >= fcTs) return true;
  }
  return false;
}

function mergeFlashcardsForGet(blobCards, sbCards, tombstones) {
  const map = new Map();
  for (const fc of [...(sbCards || []), ...(blobCards || [])]) {
    if (!fc || !fc.word) continue;
    const key = fcKey(fc);
    const prev = map.get(key);
    const ts = Number(fc.savedAt || fc.nextReview || 0);
    const prevTs = Number(prev?.savedAt || prev?.nextReview || 0);
    if (!prev || ts >= prevTs) map.set(key, fc);
  }
  return [...map.values()].filter((fc) => !isFcTombstoned(fc, tombstones)).slice(0, 500);
}

function fcTombstonesToDeleteKeys(tombstones) {
  return (tombstones || []).map((t) => {
    const parts = String(t.key || '').split('|');
    return { word: parts[0] || '', lang: parts[1] || '' };
  }).filter((k) => k.word);
}

function savedExamTs(e) {
  return Date.parse(e?.savedAt) || Number(e?.id) || 0;
}

function isSavedExamTombstoned(e, tombstones) {
  const id = e?.id || e?.data?._savedId;
  if (!id) return true;
  const examTs = savedExamTs(e);
  for (const t of tombstones || []) {
    if (String(t.id) === String(id) && Number(t.deletedAt) >= examTs) return true;
  }
  return false;
}

function mergeSavedExamsForGet(blobExams, sbExams, tombstones) {
  const map = new Map();
  for (const e of [...(sbExams || []), ...(blobExams || [])]) {
    if (!e) continue;
    const id = e.id || e.data?._savedId;
    if (!id) continue;
    const sid = String(id);
    const prev = map.get(sid);
    const ts = savedExamTs(e);
    const prevTs = prev ? savedExamTs(prev) : 0;
    if (!prev || ts >= prevTs) map.set(sid, e);
  }
  return [...map.values()].filter((e) => !isSavedExamTombstoned(e, tombstones)).slice(0, 50);
}

// ── Read from Supabase, merge with Blobs data ─────────────────────────────────
async function readFromSupabase(userId) {
  try {
    const [burnedData, flashcards, history, savedExams, quota, prefs] = await Promise.all([
      sb.getBurned(userId),
      sb.getFlashcards(userId),
      sb.getHistory(userId, 200),
      sb.getSavedExams(userId, 50),
      sb.getQuota(userId),
      sb.getPreferences(userId),
    ]);
    return {
      burned: { v: 1, ids: burnedData.ids, keys: [] },
      flashcards: flashcards.map((f) => ({
        word: f.word, translation: f.translation, context: f.context,
        wordType: f.word_type, lang: f.lang, sourceLang: f.lang, level: f.level,
        grammarTags: f.grammar_tags || [], sourceExamId: f.source_exam_id,
        createdAt: f.created_at,
      })),
      savedExams,
      history: history.map((h) => ({
        lang: h.lang, level: h.level, score: h.score,
        totalQuestions: h.total_questions, correctAnswers: h.correct_answers,
        examSource: h.exam_source, completedAt: h.completed_at,
      })),
      quota: { month: quota.month, used: quota.used },
      preferences: {
        translationLangs: prefs?.translation_langs || ['en'],
        ttsVoices: prefs?.tts_voices || {},
      },
    };
  } catch (err) {
    console.error('[user-sync] Supabase read error:', err.message);
    return null;
  }
}

// ── Write to Supabase ─────────────────────────────────────────────────────────
async function writeToSupabase(userId, email, data) {
  try {
    const ops = [];

    // Upsert profile
    ops.push(sb.upsertUserProfile(userId, email));

    // Burned IDs (append-only — we never shrink)
    if (data.burned?.ids?.length) {
      ops.push(sb.addBurned(userId, data.burned.ids));
    }

    // Flashcards
    const fcTombstones = data.deletedFlashcards || [];
    const fcTombstoneKeys = new Set(fcTombstones.map((t) => String(t.key)));
    const cardsToUpsert = (data.flashcards || []).filter(
      (f) => f?.word && !fcTombstoneKeys.has(fcKey(f)),
    );
    if (cardsToUpsert.length) {
      const cards = cardsToUpsert.map((f) => ({
        lang:          f.lang || f.sourceLang || '',
        level:         f.level || '',
        word:          f.word  || '',
        translation:   f.translation  || null,
        context:       f.context      || null,
        word_type:     f.wordType     || null,
        grammar_tags:  f.grammarTags  || [],
        source_exam_id: f.sourceExamId || null,
      }));
      ops.push(sb.upsertFlashcards(userId, cards));
    }
    if (fcTombstones.length) {
      ops.push(sb.deleteFlashcards(userId, fcTombstonesToDeleteKeys(fcTombstones)));
    }

    // Exam history (relational mirror; rich fields stay in Blobs)
    if (data.history?.length) {
      ops.push(sb.upsertHistory(userId, data.history));
    }

    const tombstones = data.deletedSavedExams || [];
    const tombstoneIds = new Set(tombstones.map((t) => String(t.id)));
    const savedToUpsert = (data.savedExams || []).filter((e) => e?.id && !tombstoneIds.has(String(e.id)));
    if (savedToUpsert.length) {
      ops.push(sb.upsertSavedExams(userId, savedToUpsert));
    }
    if (tombstones.length) {
      ops.push(sb.deleteSavedExams(userId, tombstones));
    }

    // Preferences
    if (data.preferences) {
      ops.push(sb.upsertPreferences(userId, {
        translation_langs: data.preferences.translationLangs || ['en'],
        tts_voices:        data.preferences.ttsVoices        || {},
      }));
    }

    await Promise.allSettled(ops);
  } catch (err) {
    console.error('[user-sync] Supabase write error:', err.message);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, PUT, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (!getJwtSecret())  return jsonResponse(503, cors, { error: 'auth_not_configured' });

  const store = getStoreForEvent(event);
  const auth = await requireAuth(event, store);
  if (!auth.ok) return jsonResponse(auth.status || 401, cors, { error: auth.error || 'unauthorized' });

  const key   = syncKey(auth.email);
  const useSupabase = sb.isConfigured();

  if (event.httpMethod === 'GET') {
    let blobData = null;
    try {
      blobData = await store.get(key, { type: 'json' });
    } catch (_) {
      blobData = null;
    }
    const base = sanitizeSync(blobData || {});

    const sbData =
      useSupabase && auth.userId ? await readFromSupabase(auth.userId) : null;

    if (sbData) {
      const deletedSavedExams = mergeTombstones(base.deletedSavedExams, sbData.deletedSavedExams);
      const deletedFlashcards = mergeTombstones(base.deletedFlashcards, sbData.deletedFlashcards);
      const merged = {
        ...base,
        flashcards: mergeFlashcardsForGet(base.flashcards, sbData.flashcards, deletedFlashcards),
        burned: sbData.burned,
        quota: sbData.quota,
        preferences: sbData.preferences,
        history:
          Array.isArray(base.history) && base.history.length
            ? base.history
            : sbData.history,
        savedExams: mergeSavedExamsForGet(base.savedExams, sbData.savedExams, deletedSavedExams),
        deletedSavedExams,
        deletedFlashcards,
      };
      return jsonResponse(200, cors, {
        data: sanitizeSync(merged),
        source: 'supabase+blobs',
      });
    }

    return jsonResponse(200, cors, {
      data: sanitizeSync({
        ...base,
        flashcards: mergeFlashcardsForGet(base.flashcards, [], base.deletedFlashcards),
        savedExams: mergeSavedExamsForGet(base.savedExams, [], base.deletedSavedExams),
      }),
      source: blobData ? 'blobs' : 'empty',
    });
  }

  if (event.httpMethod === 'PUT') {
    let raw = event.body;
    if (event.isBase64Encoded && typeof raw === 'string') {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    if (Buffer.byteLength(raw || '', 'utf8') > MAX_BODY) {
      return jsonResponse(413, cors, { error: 'payload_too_large' });
    }
    let body;
    try { body = parseJsonBody(event); } catch (_) { return jsonResponse(400, cors, { error: 'invalid_json' }); }

    const data = sanitizeSync(body.data || body);

    // Dual-write: Supabase primary + Blobs backup
    const writes = [store.setJSON(key, data)];
    if (useSupabase && auth.userId) {
      writes.push(writeToSupabase(auth.userId, auth.email, data));
    }
    await Promise.allSettled(writes);

    return jsonResponse(200, cors, { ok: true, updatedAt: data.updatedAt });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
};
