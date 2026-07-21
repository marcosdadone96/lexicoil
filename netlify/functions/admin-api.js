'use strict';

/**
 * Admin API — requires admin role in lc_admin_roles table.
 *
 * Routes (all require Authorization: Bearer <jwt>):
 *   GET  /admin-api?action=stats               — content + user counts
 *   GET  /admin-api?action=users[&limit][&offset] — list users
 *   GET  /admin-api?action=user_exams&email=<email>[&limit] — saved exams + history
 *   GET  /admin-api?action=generations[&email][&lang][&level][&from][&to][&limit][&offset]
 *   GET  /admin-api?action=generation&id=<uuid> — single generation with exam_data
 *   GET  /admin-api?action=pool[&lang][&level] — list served pool (Netlify Blobs)
 *   GET  /admin-api?action=pool_exam&lang&level&id — full pool entry for preview
 *   POST /admin-api  { action: 'disable_pool', lang, level, id }
 *   POST /admin-api  { action: 'enable_pool', lang, level, id }
 *   POST /admin-api  { action: 'delete_pool', lang, level, id } — permanent delete (Blobs)
 *   POST /admin-api  { action: 'scan_pool_blobs', lang, level }  — dry-run legacy scan (Blobs)
 *   POST /admin-api  { action: 'purge_pool_blobs', lang, level }  — purge legacy entries (Blobs)
 *   POST /admin-api  { action: 'set_plan', email, plan } — change user plan
 *   POST /admin-api  { action: 'add_admin', email }      — add admin role
 *   GET  /admin-api?action=staging_pending[&lang][&level][&limit] — pending staging candidates
 *   GET  /admin-api?action=staging_list[&lang][&level][&status=pending|approved|rejected|all][&limit]
 *   GET  /admin-api?action=staging_stats[&lang][&level] — counts by status
 *   GET  /admin-api?action=candidate_detail&lang&level&id — full candidate (passage+questions+keys)
 *   POST /admin-api  { action: 'approve_candidate', id }  — approve staging → pool + reusable-parts
 *   POST /admin-api  { action: 'reject_candidate', id }   — reject staging candidate
 *   POST /admin-api  { action: 'reset_quota', email }   — reset monthly exam count
 *   GET  /admin-api?action=list_reusable_parts[&lang][&level][&module] — list reusable parts
 *   GET  /admin-api?action=reusable_part_detail&lang&level&module&id   — full reusable part
 *   POST /admin-api  { action: 'disable_reusable_part', lang, level, module, id }
 *   POST /admin-api  { action: 'enable_reusable_part',  lang, level, module, id }
 *   POST /admin-api  { action: 'delete_reusable_part',  lang, level, module, id }
 *   GET  /admin-api?action=content_corrections[&status=pending][&limit] — list content corrections (Blobs)
 *   GET  /admin-api?action=content_correction&id= — one correction
 *   GET  /admin-api?action=generation_feedback[&status=candidate][&limit] — list learning rules (P0-2)
 *   GET  /admin-api?action=generation_feedback_one&id= — one feedback rule
 *   POST /admin-api  { action: 'create_content_correction', ...fields }
 *   POST /admin-api  { action: 'update_content_correction', id, status?, newValue?, ... }
 *   POST /admin-api  { action: 'reject_content_correction', id }
 *   POST /admin-api  { action: 'dry_run_apply_corrections', sourceFile?, module?, ids? }
 *   POST /admin-api  { action: 'apply_content_correction', id, confirm? }
 *   POST /admin-api  { action: 'apply_approved_corrections', confirm?, sourceFile?, module?, ids? }
 *   POST /admin-api  { action: 'update_generation_feedback', id, rule?, severity?, ... } — edit fields (no status)
 *   POST /admin-api  { action: 'approve_generation_feedback', id }
 *   POST /admin-api  { action: 'activate_generation_feedback', id, rule?, ... }
 *   POST /admin-api  { action: 'deprecate_generation_feedback', id, note? }
 *   POST /admin-api  { action: 'run_quality_on_candidate', id, lang, level, persist? }
 *   POST /admin-api  { action: 'approve_candidate', id, forceApprove?, manualReviewed? }
 *
 * Prefer REST: /.netlify/functions/content-corrections (or /api/admin/content-corrections).
 */

const { getJwtSecret, verifyAuthToken, normalizeEmail, emailToUserId } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const { scanPool, purgePool } = require('./lib/poolPurge.js');
const { getMonthKey, maxForPlan, resolvePlan } = require('./lib/quotaLib.js');
const { syncPlanToBlob, loadBlobUser } = require('./lib/planSync.js');
const {
  loadStagingIndex,
  loadStagingCandidate,
  candidateSummary,
  updateCandidateStatus,
  saveStagingCandidate,
} = require('./lib/stagingStore.js');
const { maybePromote, loadBlueprint } = require('./lib/promoteFromApproved.js');
const {
  listPoolExamsAdmin,
  getPoolExamAdmin,
  setPoolExamDisabled,
  removePoolExam,
} = require('./lib/poolIndex.js');
const {
  listReusablePartsAdmin,
  setReusablePartDisabled,
  removeReusablePart,
  getReusablePart,
} = require('./lib/reusablePartsStore.js');
const { approvePartToReusable } = require('./lib/autoApprovePartToReusable.js');
const {
  createCorrection,
  listCorrections,
  loadCorrection,
  updateCorrection,
  deleteCorrection,
} = require('./lib/contentCorrectionsStore.js');
const {
  applyCorrection,
  applyApprovedCorrections,
  buildAdminApplyOptions,
} = require('./lib/applyContentCorrections.js');
const {
  listFeedback,
  loadFeedback,
  updateFeedback,
  approveFeedback,
  activateFeedback,
  deprecateFeedback,
  feedbackMetrics,
} = require('./lib/generationFeedbackStore.js');
const {
  canPromotePart,
  partFromStagingCandidate,
  loadQualityGatePolicy,
  buildQualityMetadata,
} = require('./lib/qualityGatePolicy.js');
const { runQualityGates } = require('./lib/qualityGateRunner.js');
const sb = require('./lib/supabaseAdmin.js');

const POOL_LANGS = ['de', 'en', 'es'];
const POOL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

async function listPoolExamsAllCombos(store, lang, level) {
  const langs = lang ? [lang] : POOL_LANGS;
  const levels = level ? [level] : POOL_LEVELS;
  const all = [];
  for (const l of langs) {
    for (const lv of levels) {
      const rows = await listPoolExamsAdmin(store, l, lv);
      all.push(...rows);
    }
  }
  all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return all;
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  try {
  if (!getJwtSecret()) return jsonResponse(503, cors, { error: 'auth_not_configured' });
  if (!sb.isConfigured()) return jsonResponse(503, cors, { error: 'supabase_not_configured' });

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) return jsonResponse(401, cors, { error: 'unauthorized' });

  // Verify full admin (content_corrector uses content-corrections API only)
  const adminOk =
    (await sb.isAdminByEmail(auth.email)) ||
    (await sb.isAdmin(auth.userId));
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
      const lang = params.lang ? String(params.lang).trim().toLowerCase() : '';
      const level = params.level ? String(params.level).trim().toUpperCase() : '';
      const store = getStoreForEvent(event);
      const exams = await listPoolExamsAllCombos(store, lang || null, level || null);
      return jsonResponse(200, cors, { exams, count: exams.length });
    }

    if (action === 'pool_exam') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const id = String(params.id || '').trim();
      if (!lang || !level || !id) return jsonResponse(400, cors, { error: 'missing_lang_level_id' });
      const store = getStoreForEvent(event);
      const entry = await getPoolExamAdmin(store, lang, level, id);
      if (!entry) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { entry, id, lang, level });
    }

    if (action === 'user_exams') {
      const email = normalizeEmail(params.email || '');
      if (!email) return jsonResponse(400, cors, { error: 'missing_email' });
      const limit = Math.min(Number(params.limit) || 50, 200);
      const profile = await sb.getUserProfileByEmail(email);
      const userId = profile?.id || emailToUserId(email);
      const saved = await sb.getSavedExams(userId, limit);
      const history = await sb.getHistory(userId, limit);
      return jsonResponse(200, cors, { email, userId, saved, history });
    }

    if (action === 'generations') {
      const email = params.email ? normalizeEmail(params.email) : null;
      const lang = params.lang ? String(params.lang).trim().toLowerCase() : null;
      const level = params.level ? String(params.level).trim().toUpperCase() : null;
      const from = params.from ? `${String(params.from).trim()}T00:00:00.000Z` : null;
      const to = params.to ? `${String(params.to).trim()}T23:59:59.999Z` : null;
      const limit = Math.min(Number(params.limit) || 50, 200);
      const offset = Number(params.offset) || 0;
      const result = await sb.listGenerations({ email, lang, level, from, to, limit, offset });
      return jsonResponse(200, cors, { generations: result.rows, total: result.total });
    }

    if (action === 'generation') {
      const id = String(params.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const row = await sb.getGeneration(id);
      if (!row) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { generation: row });
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

    if (action === 'staging_stats') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      if (!lang || !level) {
        return jsonResponse(400, cors, { error: 'missing_lang_level' });
      }
      const store = getStoreForEvent(event);
      const index = await loadStagingIndex(store, lang, level);
      const counts = { pending: 0, approved: 0, rejected: 0, all: index.length };
      for (const row of index) {
        if (counts[row.status] != null) counts[row.status]++;
      }
      const parts = await listReusablePartsAdmin(store, lang, level, null);
      return jsonResponse(200, cors, { counts, reusableParts: parts.length });
    }

    if (action === 'staging_list') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const status = String(params.status || 'pending').trim().toLowerCase();
      const limit = Math.min(Number(params.limit) || 100, 200);
      if (!lang || !level) {
        return jsonResponse(400, cors, { error: 'missing_lang_level' });
      }
      const store = getStoreForEvent(event);
      const index = await loadStagingIndex(store, lang, level);
      const counts = { pending: 0, approved: 0, rejected: 0, all: index.length };
      for (const row of index) {
        if (counts[row.status] != null) counts[row.status]++;
      }
      const rows =
        status === 'all' ? index.slice(-limit) : index.filter((row) => row.status === status).slice(-limit);
      const candidates = [];
      for (const row of rows) {
        const candidate = await loadStagingCandidate(store, lang, level, row.id);
        if (!candidate) continue;
        if (status !== 'all' && candidate.status !== status) continue;
        candidates.push(candidateSummary(candidate));
      }
      candidates.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return jsonResponse(200, cors, { candidates, count: candidates.length, counts, status });
    }

    // Full candidate detail (passage + all questions + correct answers)
    if (action === 'candidate_detail') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const id = String(params.id || '').trim();
      if (!lang || !level || !id) return jsonResponse(400, cors, { error: 'missing_lang_level_id' });
      const store = getStoreForEvent(event);
      const candidate = await loadStagingCandidate(store, lang, level, id);
      if (!candidate) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { candidate, id, lang, level });
    }

    // Reusable parts list with optional lang/level/module filter
    if (action === 'list_reusable_parts') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const module = String(params.module || '').trim().toLowerCase();
      const store = getStoreForEvent(event);
      const parts = await listReusablePartsAdmin(store, lang || null, level || null, module || null);
      return jsonResponse(200, cors, { parts, count: parts.length });
    }

    // Full reusable part detail
    if (action === 'reusable_part_detail') {
      const lang = String(params.lang || '').trim().toLowerCase();
      const level = String(params.level || '').trim().toUpperCase();
      const module = String(params.module || '').trim().toLowerCase();
      const id = String(params.id || '').trim();
      if (!lang || !level || !module || !id) return jsonResponse(400, cors, { error: 'missing_params' });
      const store = getStoreForEvent(event);
      const part = await getReusablePart(store, lang, level, module, id);
      if (!part) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { part, id, lang, level, module });
    }

    if (action === 'content_corrections') {
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await listCorrections(store, {
        status: params.status || 'pending',
        limit: params.limit,
        module: params.module,
        sourceFile: params.sourceFile,
      });
      if (!result.ok) return jsonResponse(400, cors, { error: result.error });
      return jsonResponse(200, cors, {
        corrections: result.corrections,
        count: result.count,
        counts: result.counts,
        status: result.status,
      });
    }

    if (action === 'content_correction') {
      const id = String(params.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const correction = await loadCorrection(store, id);
      if (!correction) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { correction });
    }

    if (action === 'generation_feedback') {
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await listFeedback(store, {
        status: params.status || 'candidate',
        type: params.type,
        category: params.category,
        module: params.module,
        limit: params.limit,
      });
      if (!result.ok) return jsonResponse(400, cors, { error: result.error });
      return jsonResponse(200, cors, {
        feedback: result.feedback,
        count: result.count,
        counts: result.counts,
        metrics: feedbackMetrics(result.counts),
        status: result.status,
      });
    }

    if (action === 'generation_feedback_one') {
      const id = String(params.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const feedback = await loadFeedback(store, id);
      if (!feedback) return jsonResponse(404, cors, { error: 'not_found' });
      return jsonResponse(200, cors, { feedback });
    }

    return jsonResponse(400, cors, { error: 'unknown_action' });
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = parseJsonBody(event); } catch (_) { return jsonResponse(400, cors, { error: 'invalid_json' }); }

    const { action } = body;

    if (action === 'disable_pool') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!body.id || !lang || !level) return jsonResponse(400, cors, { error: 'missing_fields' });
      const store = getStoreForEvent(event);
      const ok = await setPoolExamDisabled(store, lang, level, body.id, true);
      return jsonResponse(ok ? 200 : 404, cors, { ok });
    }

    if (action === 'enable_pool') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!body.id || !lang || !level) return jsonResponse(400, cors, { error: 'missing_fields' });
      const store = getStoreForEvent(event);
      const ok = await setPoolExamDisabled(store, lang, level, body.id, false);
      return jsonResponse(ok ? 200 : 404, cors, { ok });
    }

    if (action === 'delete_pool') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!body.id || !lang || !level) return jsonResponse(400, cors, { error: 'missing_fields' });
      const store = getStoreForEvent(event);
      const ok = await removePoolExam(store, lang, level, body.id);
      return jsonResponse(ok ? 200 : 404, cors, { ok });
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
      const allowedRoles = new Set(['admin', 'superadmin', 'content_corrector']);
      const role = String(body.role || 'admin').trim().toLowerCase();
      if (!allowedRoles.has(role)) return jsonResponse(400, cors, { error: 'invalid_role' });
      const client = sb.getClient();
      if (!client) return jsonResponse(503, cors, { error: 'supabase_not_configured' });
      const profile = await sb.getUserProfileByEmail(body.email);
      if (!profile) return jsonResponse(404, cors, { error: 'user_not_found' });
      const { error } = await client
        .from('lc_admin_roles')
        .upsert({ user_id: profile.id, email: body.email, role }, { onConflict: 'user_id' });
      return jsonResponse(error ? 500 : 200, cors, { ok: !error, error: error?.message, role });
    }

    if (action === 'approve_candidate') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!lang || !level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const candidate = await loadStagingCandidate(store, lang, level, body.id);
      if (!candidate) return jsonResponse(404, cors, { error: 'not_found' });
      const retryReusable = body.retryReusable === true;
      if (candidate.status !== 'pending' && !(retryReusable && candidate.status === 'approved')) {
        return jsonResponse(400, cors, { error: 'not_pending', status: candidate.status });
      }

      // PASO 10 — quality promotion guard (advisory by default → always allowed)
      let qualityAdvisory = null;
      try {
        const policy = loadQualityGatePolicy({ mode: body.policyMode });
        const part = partFromStagingCandidate(candidate);
        const report = await runQualityGates({
          part,
          source: `staging:${candidate.id}`,
          level,
          lang,
          teil: candidate.teil,
          policyMode: policy.mode,
          checkedBy: auth.email || 'admin',
        });
        const promotion = canPromotePart(report, {
          mode: policy.mode,
          manualReviewed: body.manualReviewed === true,
          forceApprove: body.forceApprove === true,
        });
        qualityAdvisory = {
          status: report.status,
          policyMode: policy.mode,
          promotion,
          qualityMetadata: report.qualityMetadata,
          gates: (report.gates || []).map((g) => ({ name: g.name, status: g.status })),
        };
        // Persist qualityMetadata on candidate (does not change staging status)
        candidate.qualityMetadata = report.qualityMetadata;
        await saveStagingCandidate(store, lang, level, candidate);

        if (!promotion.allowed) {
          return jsonResponse(403, cors, {
            error: 'quality_blocks_promotion',
            message: 'Quality policy blocks promotion. Use forceApprove after human review, or switch policy to advisory.',
            qualityAdvisory,
          });
        }
      } catch (qgErr) {
        console.warn('[admin-api] quality gate advisory failed (continuing):', qgErr.message);
        qualityAdvisory = { error: qgErr.message, policyMode: 'advisory', skipped: true };
      }

      // Save to reusable store first — promotion must not block this.
      let partResult = null;
      let blueprint = null;
      try {
        blueprint = loadBlueprint(lang, level);
      } catch (bpErr) {
        console.warn('[admin-api] blueprint unavailable:', bpErr.message);
      }
      try {
        partResult = await approvePartToReusable(store, candidate, { blueprint, verified: true });
      } catch (reuseErr) {
        console.error('[admin-api] approvePartToReusable failed:', reuseErr);
        return jsonResponse(500, cors, {
          error: 'reusable_save_failed',
          message: reuseErr?.message || 'Could not save to reusable store',
        });
      }
      if (!partResult) {
        return jsonResponse(500, cors, { error: 'reusable_save_failed' });
      }

      if (candidate.status === 'pending') {
        await updateCandidateStatus(store, lang, level, body.id, 'approved');
      }

      let promoted = 0;
      try {
        const promoteResult = await maybePromote(store, lang, level);
        promoted = Number(promoteResult?.promoted ?? promoteResult?.count ?? promoteResult) || 0;
      } catch (promoteErr) {
        console.warn('[admin-api] maybePromote failed (part still saved):', promoteErr?.message || promoteErr);
      }

      return jsonResponse(200, cors, {
        approved: true,
        promoted,
        savedToReusable: true,
        reusableId: partResult?.id || partResult?.partKey || null,
        qualityAdvisory,
      });
    }

    if (action === 'run_quality_on_candidate') {
      if (!body.id) return jsonResponse(400, cors, { error: 'missing_id' });
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      if (!lang || !level) return jsonResponse(400, cors, { error: 'missing_lang_level' });
      const store = getStoreForEvent(event);
      const candidate = await loadStagingCandidate(store, lang, level, body.id);
      if (!candidate) return jsonResponse(404, cors, { error: 'not_found' });
      const policy = loadQualityGatePolicy({ mode: body.policyMode });
      const part = partFromStagingCandidate(candidate);
      const report = await runQualityGates({
        part,
        source: `staging:${candidate.id}`,
        level,
        lang,
        teil: candidate.teil,
        policyMode: policy.mode,
        checkedBy: auth.email || 'admin',
      });
      const promotion = canPromotePart(report, { mode: policy.mode });
      if (body.persist !== false) {
        candidate.qualityMetadata = report.qualityMetadata || buildQualityMetadata(report, { policyMode: policy.mode });
        await saveStagingCandidate(store, lang, level, candidate);
      }
      return jsonResponse(200, cors, {
        ok: true,
        report,
        promotion,
        qualityMetadata: candidate.qualityMetadata,
        suggestedStatus: report.stagingStatus,
      });
    }

    if (action === 'disable_reusable_part') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      const module = String(body.module || '').trim().toLowerCase();
      const id = String(body.id || '').trim();
      if (!lang || !level || !module || !id) return jsonResponse(400, cors, { error: 'missing_params' });
      const store = getStoreForEvent(event);
      await setReusablePartDisabled(store, lang, level, module, id, true);
      return jsonResponse(200, cors, { ok: true, disabled: true });
    }

    if (action === 'enable_reusable_part') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      const module = String(body.module || '').trim().toLowerCase();
      const id = String(body.id || '').trim();
      if (!lang || !level || !module || !id) return jsonResponse(400, cors, { error: 'missing_params' });
      const store = getStoreForEvent(event);
      await setReusablePartDisabled(store, lang, level, module, id, false);
      return jsonResponse(200, cors, { ok: true, disabled: false });
    }

    if (action === 'delete_reusable_part') {
      const lang = String(body.lang || '').trim().toLowerCase();
      const level = String(body.level || '').trim().toUpperCase();
      const module = String(body.module || '').trim().toLowerCase();
      const id = String(body.id || '').trim();
      if (!lang || !level || !module || !id) return jsonResponse(400, cors, { error: 'missing_params' });
      const store = getStoreForEvent(event);
      await removeReusablePart(store, lang, level, module, id);
      return jsonResponse(200, cors, { ok: true, deleted: true });
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

    if (action === 'create_content_correction') {
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await createCorrection(store, body, { email: auth.email, isAdmin: true });
      if (!result.ok) {
        return jsonResponse(400, cors, {
          error: result.error,
          errors: result.errors || [],
          warnings: result.warnings || [],
        });
      }
      return jsonResponse(201, cors, { correction: result.correction, warnings: result.warnings || [] });
    }

    if (action === 'update_content_correction') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const { id: _omit, action: _a, ...patch } = body;
      const result = await updateCorrection(store, id, patch, { email: auth.email });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, { error: result.error, errors: result.errors || [] });
      }
      return jsonResponse(200, cors, { correction: result.correction });
    }

    if (action === 'update_generation_feedback') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const { id: _omit, action: _a, status: _s, ...patch } = body;
      const result = await updateFeedback(store, id, patch, { email: auth.email });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, {
          error: result.error,
          errors: result.errors || [],
          message: result.message,
        });
      }
      return jsonResponse(200, cors, { feedback: result.feedback });
    }

    if (action === 'approve_generation_feedback') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await approveFeedback(store, id, { email: auth.email });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, { error: result.error, from: result.from, to: result.to });
      }
      return jsonResponse(200, cors, { feedback: result.feedback });
    }

    if (action === 'activate_generation_feedback') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const { id: _omit, action: _a, status: _s, ...patch } = body;
      const result = await activateFeedback(store, id, { email: auth.email, patch });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, {
          error: result.error,
          reasons: result.reasons || [],
          warnings: result.warnings || [],
          from: result.from,
          to: result.to,
        });
      }
      return jsonResponse(200, cors, { feedback: result.feedback, gate: result.gate });
    }

    if (action === 'deprecate_generation_feedback') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await deprecateFeedback(store, id, { email: auth.email, note: body.note });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, { error: result.error, from: result.from, to: result.to });
      }
      return jsonResponse(200, cors, { feedback: result.feedback });
    }

    if (action === 'reject_content_correction') {
      const id = String(body.id || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const result = await deleteCorrection(store, id, {
        email: auth.email,
        hard: !!body.hard,
        comment: body.comment != null ? body.comment : body.note,
      });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, { error: result.error });
      }
      return jsonResponse(200, cors, result);
    }

    if (action === 'dry_run_apply_corrections') {
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const adminOpts = buildAdminApplyOptions({ ...body, confirm: false }, auth.email);
      const result = await applyApprovedCorrections(store, {
        ...adminOpts,
        dryRun: true,
        confirm: false,
        sourceFile: body.sourceFile,
        module: body.module,
        ids: body.ids,
        limit: body.limit,
      });
      return jsonResponse(200, cors, result);
    }

    if (action === 'apply_content_correction') {
      const id = String(body.id || body.correctionId || '').trim();
      if (!id) return jsonResponse(400, cors, { error: 'missing_id' });
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      const adminOpts = buildAdminApplyOptions(body, auth.email);
      const result = await applyCorrection(store, id, adminOpts);
      return jsonResponse(result.ok || result.dryRun ? 200 : 409, cors, result);
    }

    if (action === 'apply_approved_corrections') {
      const store = getStoreForEvent(event);
      if (!store) return jsonResponse(503, cors, { error: 'blobs_unavailable' });
      if (body.confirm !== true) {
        const adminOpts = buildAdminApplyOptions({ ...body, confirm: false }, auth.email);
        const result = await applyApprovedCorrections(store, {
          ...adminOpts,
          dryRun: true,
          confirm: false,
          sourceFile: body.sourceFile,
          module: body.module,
          ids: body.ids,
          limit: body.limit,
        });
        return jsonResponse(200, cors, {
          ...result,
          message: result.message || 'Dry run — pasa confirm:true para aplicar.',
        });
      }
      const adminOpts = buildAdminApplyOptions(body, auth.email);
      const result = await applyApprovedCorrections(store, {
        ...adminOpts,
        dryRun: false,
        confirm: true,
        sourceFile: body.sourceFile,
        module: body.module,
        ids: body.ids,
        limit: body.limit,
      });
      return jsonResponse(result.ok ? 200 : 409, cors, result);
    }

    if (action === 'reset_quota') {
      if (!body.email) return jsonResponse(400, cors, { error: 'missing_email' });
      const email = normalizeEmail(body.email);
      const profile = await sb.getUserProfileByEmail(email);
      if (!profile) return jsonResponse(404, cors, { error: 'user_not_found' });
      const month = getMonthKey();
      const ok = await sb.resetQuota(profile.id, month);
      if (!ok) return jsonResponse(500, cors, { error: 'reset_failed' });
      const store = getStoreForEvent(event);
      const user = await loadBlobUser(store, email);
      const plan = resolvePlan(user) || profile.plan || 'free';
      await store.setJSON(`quota:${email}`, { used: 0, month, max: maxForPlan(plan) });
      return jsonResponse(200, cors, { ok: true, email, used: 0, month });
    }

    return jsonResponse(400, cors, { error: 'unknown_action' });
  }

  return jsonResponse(405, cors, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[admin-api]', err);
    return jsonResponse(500, cors, { error: 'internal_error', message: err.message || String(err) });
  }
};
