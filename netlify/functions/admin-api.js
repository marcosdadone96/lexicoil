'use strict';

/**
 * Admin API — requires admin role in lc_admin_roles table.
 *
 * Routes (all require Authorization: Bearer <jwt>):
 *   GET  /admin-api?action=stats               — content + user counts
 *   GET  /admin-api?action=users[&limit][&offset] — list users
 *   GET  /admin-api?action=pool[&lang][&level][&limit] — list pool exams
 *   POST /admin-api  { action: 'invalidate_pool', id }  — mark pool exam invalid
 *   POST /admin-api  { action: 'delete_pool', id }      — delete pool exam
 *   POST /admin-api  { action: 'scan_pool_blobs', lang, level }  — dry-run legacy scan (Blobs)
 *   POST /admin-api  { action: 'purge_pool_blobs', lang, level }  — purge legacy entries (Blobs)
 *   POST /admin-api  { action: 'set_plan', email, plan } — change user plan
 *   GET  /admin-api?action=staging_pending[&lang][&level][&limit] — pending staging candidates
 *   POST /admin-api  { action: 'approve_candidate', id }  — approve + maybe promote to pool
 *   POST /admin-api  { action: 'reject_candidate', id }   — reject staging candidate

const { getJwtSecret, verifyAuthToken } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { scanPool, purgePool } = require('./lib/poolPurge.js');
const { syncPlanToBlob } = require('./lib/planSync.js');
const {
  loadStagingIndex,
  loadStagingCandidate,
  candidateSummary,
  updateCandidateStatus,
} = require('./lib/stagingStore.js');
const { maybePromote } = require('./lib/promoteFromApproved.js');
const { normalizeEmail } = require('./lib/authLib.js');
const sb = require('./lib/supabaseAdmin.js');

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  try {
  if (!getJwtSecret()) return jsonResponse(503, cors, { error: 'auth_not_configured' });
  if (!sb.isConfigured()) return jsonResponse(503, cors, { error: 'supabase_not_configured' });

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) return jsonResponse(401, cors, { error: 'unauthorized' });

  // Verify admin
  const adminOk = await sb.isAdminByEmail(auth.email);
  if (!adminOk) return jsonResponse(403, cors, { error: 'forbidden' });

  // ── GET ───────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const action = params.action || 'stats';

    if (action === 'stats') {
      const stats = await sb.getContentStats();
      return jsonResponse(200, cors, { stats });
    }

    if (action === 'users') {
      const limit  = Math.min(Number(params.limit) || 50, 200);
      const offset = Number(params.offset) || 0;
      const users  = await sb.listUsers(limit, offset);
      return jsonResponse(200, cors, { users });
    }

    if (action === 'pool') {
      const limit = Math.min(Number(params.limit) || 50, 200);
      const exams = await sb.listPoolExams(params.lang || null, params.level || null, limit);
      return jsonResponse(200, cors, { exams });
    }

    if (action === 'staging_pending') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const limit = Math.min(Number(params.limit) || 50, 200);
      if (!lang || !level) {
        return jsonResponse(400, cors, { error: 'missing_lang_level' });
      }
      const store = getStoreForEvent(event);
      const index = await loadStagingIndex(store, lang, level);
      const pendingRows = index.filter((row) => row.status === 'pending').slice(-limit);
      const candidates = [];
      for (const row of pendingRows) {
        const candidate = await loadStagingCandidate(store, lang, level, row.id);
        if (candidate && candidate.status === 'pending') {
          candidates.push(candidateSummary(candidate));
        }
      }
      candidates.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return jsonResponse(200, cors, { candidates, count: candidates.length });
    }

    return jsonResponse(400, cors, { error: 'unknown_action' });
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = parseJsonBody(event); } catch (_) { return jsonResponse(400, cors, { error: 'invalid_json' }); }

    const { action } = body;

    if (action === 'invalidate_pool') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const ok = await sb.invalidatePoolExam(body.id);
      return jsonResponse(ok ? 200 : 500, cors, { ok });
    }

    if (action === 'delete_pool') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const ok = await sb.deletePoolExam(body.id);
      return jsonResponse(ok ? 200 : 500, cors, { ok });
    }

    if (action === 'scan_pool_blobs') {
      if (!body.lang || !body.level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const scan = await scanPool(store, String(body.lang).toLowerCase(), String(body.level).toUpperCase(), {
        needsCuration: body.needsCuration !== false,
        invalid: body.invalid !== false,
        idPrefixes: body.idPrefixes,
        ids: body.ids,
      });
      return jsonResponse(200, cors, {
        report: {
          lang: scan.lang,
          level: scan.level,
          total: scan.total,
          candidates: scan.flagged.length,
          items: scan.flagged.map((it) => ({ id: it.id, topic: it.topic, reasons: it.reasons })),
        },
      });
    }

    if (action === 'purge_pool_blobs') {
      if (!body.lang || !body.level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const report = await purgePool(store, String(body.lang).toLowerCase(), String(body.level).toUpperCase(), {
        dryRun: false,
        needsCuration: body.needsCuration !== false,
        invalid: body.invalid !== false,
        idPrefixes: body.idPrefixes,
        ids: body.ids,
      });
      return jsonResponse(200, cors, { report });
    }

    if (action === 'set_plan') {
      if (!body.email || !body.plan) return jsonResponse(400, cors, { error: 'missing_fields' });
      if (!['free', 'pro', 'guest'].includes(body.plan)) return jsonResponse(400, cors, { error: 'invalid_plan' });
      const email = normalizeEmail(body.email);
      const profile = await sb.getUserProfileByEmail(email);
      if (!profile) return jsonResponse(404, cors, { error: 'user_not_found' });
      const ok = await sb.setPlan(profile.id, body.plan);
      if (!ok) return jsonResponse(500, cors, { error: 'upgrade_failed' });
      const store = getStoreForEvent(event);
      await syncPlanToBlob(store, email, body.plan);
      return jsonResponse(200, cors, { ok: true, email, plan: body.plan });
    }

    if (action === 'add_admin') {
      if (!body.email) return jsonResponse(400, cors, { error: 'missing_email' });
      const client = sb.getClient();
      if (!client) return jsonResponse(503, cors, { error: 'supabase_not_configured' });
      const profile = await sb.getUserProfileByEmail(body.email);
      if (!profile) return jsonResponse(404, cors, { error: 'user_not_found' });
      const { error } = await client
        .from('lc_admin_roles')
        .upsert({ user_id: profile.id, email: body.email, role: body.role || 'admin' }, { onConflict: 'user_id' });
      return jsonResponse(error ? 500 : 200, cors, { ok: !error, error: error?.message });
    }

    if (action === 'approve_candidate') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!lang || !level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const candidate = await loadStagingCandidate(store, lang, level, body.id);
      if (!candidate) return jsonResponse(404, cors, { error: 'not_found' });
      if (candidate.status !== 'pending') {
        return jsonResponse(400, cors, { error: 'not_pending', status: candidate.status });
      }
      await updateCandidateStatus(store, lang, level, body.id, 'approved');
      const promoted = await maybePromote(store, lang, level);
      return jsonResponse(200, cors, { approved: true, promoted });
    }

    if (action === 'reject_candidate') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!lang || !level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const candidate = await loadStagingCandidate(store, lang, level, body.id);
      if (!candidate) return jsonResponse(404, cors, { error: 'not_found' });
      if (candidate.status !== 'pending') {
        return jsonResponse(400, cors, { error: 'not_pending', status: candidate.status });
      }
      await updateCandidateStatus(store, lang, level, body.id, 'rejected');
      return jsonResponse(200, cors, { rejected: true });
    }

    return jsonResponse(400, cors, { error: 'unknown_action' });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[admin-api]', err);
    return jsonResponse(500, cors, { error: 'internal_error', message: err.message || String(err) });
  }
};
