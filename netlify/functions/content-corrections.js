'use strict';

/**
 * Content corrections API (admin only).
 *
 * REST-ish (also via redirects /admin/content-corrections):
 *   POST   /.netlify/functions/content-corrections          — create (pending) / reuse / ignore
 *   GET    /.netlify/functions/content-corrections?status=  — list
 *   GET    /.netlify/functions/content-corrections?id=      — get one
 *   PATCH  /.netlify/functions/content-corrections?id=      — update status/fields
 *   DELETE /.netlify/functions/content-corrections?id=      — reject (or ?hard=1)
 *   POST   body.action=dry_run_apply | apply_correction | apply_approved — PASO 5
 *
 * Auth: JWT Bearer or lc_token cookie + lc_admin_roles (same as admin-api).
 */

const { getJwtSecret, verifyAuthToken } = require('./lib/authLib.js');
const { corsHeaders, getBearer, parseJsonBody, jsonResponse } = require('./lib/http.js');
const { getStoreForEvent } = require('./lib/blobStore.js');
const {
  createCorrection,
  listCorrections,
  loadCorrection,
  updateCorrection,
  deleteCorrection,
  panelSummary,
} = require('./lib/contentCorrectionsStore.js');
const {
  applyCorrection,
  applyApprovedCorrections,
} = require('./lib/applyContentCorrections.js');
const {
  listFeedback,
  updateFeedback,
  approveFeedback,
  activateFeedback,
  deprecateFeedback,
  feedbackMetrics,
} = require('./lib/generationFeedbackStore.js');
const sb = require('./lib/supabaseAdmin.js');
const {
  canAccessContentCorrections,
  canManageAssemblyCorrections,
  canApproveContentCorrections,
  isFullAdminRole,
} = require('./lib/adminRoles.js');
const { normalizeOrigin: normalizeCorrectionOrigin } = require('./lib/contentCorrectionSchema.js');

const ERROR_MESSAGES = {
  auth_not_configured: 'La autenticación no está configurada.',
  supabase_not_configured: 'Supabase no está configurado.',
  unauthorized: 'No autorizado.',
  forbidden: 'Se requiere rol de administrador o content_corrector.',
  assembly_forbidden: 'Las correcciones de assembly requieren rol admin.',
  blobs_unavailable: 'Almacenamiento no disponible.',
  method_not_allowed: 'Método no permitido.',
  not_found: 'Corrección no encontrada.',
  missing_id: 'Falta el id de la corrección.',
  validation_failed: 'La corrección no es válida.',
  sourceFile_not_found: 'No se encontró el archivo fuente.',
  targetId_not_in_source: 'El targetId no existe en el archivo fuente.',
  invalid_status: 'Estado no válido.',
  applied_not_allowed: 'El estado applied solo lo escribe el motor de apply.',
  status_reserved: 'Ese estado solo lo escribe el motor de apply.',
  confirm_required: 'Aplicar requiere confirm:true tras un dry-run exitoso.',
  server_error: 'Error interno del servidor.',
};

function uiError(code, extras = {}) {
  const details = extras.details || extras.errors || [];
  return {
    error: code,
    message: extras.message || ERROR_MESSAGES[code] || code,
    details: Array.isArray(details) ? details : [String(details)],
    // PASO 2 compat
    errors: extras.errors != null ? extras.errors : details,
    ...(extras.warnings ? { warnings: extras.warnings } : {}),
  };
}

function parseId(event) {
  const params = event.queryStringParameters || {};
  if (params.id) return String(params.id).trim();
  const path = String(event.path || event.rawUrl || '');
  const m = path.match(/content-corrections\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
}

async function requireContentCorrectorOrAdmin(event, cors) {
  if (!getJwtSecret()) return { error: jsonResponse(503, cors, uiError('auth_not_configured')) };
  if (!sb.isConfigured()) return { error: jsonResponse(503, cors, uiError('supabase_not_configured')) };

  const auth = verifyAuthToken(getBearer(event));
  if (!auth.ok) return { error: jsonResponse(401, cors, uiError('unauthorized')) };

  const role = await sb.getAdminRole(auth.userId, auth.email);
  if (!canAccessContentCorrections(role)) {
    return { error: jsonResponse(403, cors, uiError('forbidden')) };
  }

  return {
    auth,
    role,
    isFullAdmin: isFullAdminRole(role),
    canApprove: canApproveContentCorrections(role),
    canManageAssembly: canManageAssemblyCorrections(role),
  };
}

async function auditCorrectionAction(correctionId, auth, role, action, detail = {}) {
  try {
    await sb.insertContentCorrectionAudit({
      correctionId,
      actorEmail: auth.email,
      actorRole: role || 'unknown',
      action,
      detail,
    });
  } catch (err) {
    console.error('[content-corrections] audit:', err.message);
  }
}

function correctionPayload(correction, extra = {}) {
  return {
    correction,
    correctionId: correction && correction.id,
    summary: panelSummary(correction),
    ...extra,
  };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

  try {
    const gate = await requireContentCorrectorOrAdmin(event, cors);
    if (gate.error) return gate.error;
    const { auth, role, isFullAdmin, canApprove, canManageAssembly } = gate;

    const store = getStoreForEvent(event);
    if (!store) return jsonResponse(503, cors, uiError('blobs_unavailable'));

    const method = event.httpMethod;
    const params = event.queryStringParameters || {};
    const id = parseId(event);

    if (method === 'GET') {
      if (id) {
        const rec = await loadCorrection(store, id);
        if (!rec) return jsonResponse(404, cors, uiError('not_found'));
        return jsonResponse(200, cors, correctionPayload(rec));
      }
      const result = await listCorrections(store, {
        status: params.status || 'pending',
        limit: params.limit,
        module: params.module,
        sourceFile: params.sourceFile,
      });
      if (!result.ok) {
        return jsonResponse(400, cors, uiError(result.error || 'validation_failed'));
      }
      return jsonResponse(200, cors, {
        corrections: result.corrections,
        count: result.count,
        counts: result.counts,
        status: result.status,
        summaries: (result.corrections || []).map((c) => panelSummary(c)),
      });
    }

    if (method === 'POST') {
      const body = parseJsonBody(event);
      const applyAction = String(body.action || '').trim();

      // PASO 5 — dry-run / apply (filesystem; works on netlify dev / CI with repo checkout)
      if (applyAction === 'dry_run_apply' || applyAction === 'apply_approved' || applyAction === 'apply_correction') {
        const ctx = {
          email: auth.email,
          skipLearning: !!body.skipLearning,
        };
        if (applyAction === 'apply_correction') {
          const cid = String(body.id || body.correctionId || id || '').trim();
          if (!cid) return jsonResponse(400, cors, uiError('missing_id'));
          const result = await applyCorrection(store, cid, {
            ...ctx,
            dryRun: body.confirm !== true,
            role,
          });
          if (result.ok && result.applied) {
            await auditCorrectionAction(cid, auth, role, 'apply', { sourceFile: result.sourceFile });
          } else if (result.ok && result.dryRun) {
            await auditCorrectionAction(cid, auth, role, 'dry_run', { wouldApply: true });
          }
          return jsonResponse(result.ok || result.dryRun ? 200 : 409, cors, result);
        }
        if (applyAction === 'dry_run_apply' || (applyAction === 'apply_approved' && body.confirm !== true)) {
          const result = await applyApprovedCorrections(store, {
            ...ctx,
            dryRun: true,
            confirm: false,
            sourceFile: body.sourceFile,
            module: body.module,
            ids: body.ids,
            limit: body.limit,
          });
          return jsonResponse(200, cors, result);
        }
        // apply_approved with confirm
        const result = await applyApprovedCorrections(store, {
          ...ctx,
          dryRun: false,
          confirm: true,
          sourceFile: body.sourceFile,
          module: body.module,
          ids: body.ids,
          limit: body.limit,
        });
        return jsonResponse(result.ok ? 200 : 409, cors, result);
      }

      if (applyAction === 'list_generation_feedback') {
        if (!isFullAdmin) return jsonResponse(403, cors, uiError('forbidden'));
        const result = await listFeedback(store, {
          status: body.status || 'candidate',
          type: body.type,
          category: body.category,
          module: body.module,
          limit: body.limit,
        });
        if (!result.ok) return jsonResponse(400, cors, uiError(result.error || 'validation_failed'));
        return jsonResponse(200, cors, { ...result, metrics: feedbackMetrics(result.counts) });
      }

      if (applyAction === 'approve_generation_feedback') {
        if (!isFullAdmin) return jsonResponse(403, cors, uiError('forbidden'));
        const fid = String(body.id || '').trim();
        if (!fid) return jsonResponse(400, cors, uiError('missing_id'));
        const result = await approveFeedback(store, fid, { email: auth.email });
        if (!result.ok) return jsonResponse(result.error === 'not_found' ? 404 : 400, cors, uiError(result.error));
        return jsonResponse(200, cors, result);
      }

      if (applyAction === 'activate_generation_feedback') {
        if (!isFullAdmin) return jsonResponse(403, cors, uiError('forbidden'));
        const fid = String(body.id || '').trim();
        if (!fid) return jsonResponse(400, cors, uiError('missing_id'));
        const { id: _i, action: _a, status: _s, ...patch } = body;
        const result = await activateFeedback(store, fid, { email: auth.email, patch });
        if (!result.ok) {
          return jsonResponse(result.error === 'not_found' ? 404 : 400, cors, {
            ...uiError(result.error),
            reasons: result.reasons,
            warnings: result.warnings,
          });
        }
        return jsonResponse(200, cors, result);
      }

      if (applyAction === 'deprecate_generation_feedback') {
        if (!isFullAdmin) return jsonResponse(403, cors, uiError('forbidden'));
        const fid = String(body.id || '').trim();
        if (!fid) return jsonResponse(400, cors, uiError('missing_id'));
        const result = await deprecateFeedback(store, fid, { email: auth.email, note: body.note });
        if (!result.ok) return jsonResponse(result.error === 'not_found' ? 404 : 400, cors, uiError(result.error));
        return jsonResponse(200, cors, result);
      }

      if (applyAction === 'update_generation_feedback') {
        if (!isFullAdmin) return jsonResponse(403, cors, uiError('forbidden'));
        const fid = String(body.id || '').trim();
        if (!fid) return jsonResponse(400, cors, uiError('missing_id'));
        const { id: _i, action: _a, status: _s, ...patch } = body;
        const result = await updateFeedback(store, fid, patch, { email: auth.email });
        if (!result.ok) return jsonResponse(result.error === 'not_found' ? 404 : 400, cors, uiError(result.error, { message: result.message }));
        return jsonResponse(200, cors, result);
      }

      const origin = normalizeCorrectionOrigin(body.origin);
      if (origin === 'assembly' && !canManageAssembly) {
        return jsonResponse(403, cors, uiError('assembly_forbidden'));
      }

      const result = await createCorrection(store, body, {
        email: auth.email,
        isAdmin: isFullAdmin,
        canApprove,
        canManageAssembly,
      });
      if (!result.ok) {
        return jsonResponse(
          400,
          cors,
          uiError(result.error || 'validation_failed', {
            errors: result.errors || [],
            details: result.errors || [],
            warnings: result.warnings,
          }),
        );
      }

      if (result.ignored) {
        return jsonResponse(200, cors, {
          ignored: true,
          reason: result.reason || 'no_changes',
          message: result.message || 'No hay cambios entre oldValue y newValue.',
          summary: result.summary || null,
          warnings: result.warnings || [],
        });
      }

      if (result.reused) {
        return jsonResponse(
          200,
          cors,
          correctionPayload(result.correction, {
            reused: true,
            message: result.message || 'Ya existe una corrección pendiente para este cambio.',
            warnings: result.warnings || [],
            // Explicit UI hint for exam review mode
            uiState: 'pending_exists',
          }),
        );
      }

      const autoApproved = result.correction?.status === 'approved';
      if (result.correction?.id && !result.reused && !result.ignored) {
        await auditCorrectionAction(result.correction.id, auth, role, autoApproved ? 'create_approved' : 'create', {
          origin: result.correction.origin,
          module: result.correction.module,
          teil: result.correction.teil,
        });
      }
      return jsonResponse(
        201,
        cors,
        correctionPayload(result.correction, {
          reused: false,
          warnings: result.warnings || [],
          uiState: autoApproved ? 'approved' : 'pending_exists',
          message: autoApproved
            ? 'Corrección creada y auto-aprobada.'
            : 'Corrección pendiente creada.',
          autoApproved,
        }),
      );
    }

    if (method === 'PATCH') {
      if (!id) return jsonResponse(400, cors, uiError('missing_id'));
      const body = parseJsonBody(event);
      const result = await updateCorrection(store, id, body, { email: auth.email, canApprove });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(
          code,
          cors,
          uiError(result.error || 'validation_failed', {
            errors: result.errors || [],
            details: result.errors || [],
          }),
        );
      }
      if (result.correction?.status === 'approved') {
        await auditCorrectionAction(id, auth, role, 'approve', { module: result.correction.module });
      }
      return jsonResponse(200, cors, correctionPayload(result.correction));
    }

    if (method === 'DELETE') {
      if (!id) return jsonResponse(400, cors, uiError('missing_id'));
      const hard = String(params.hard || '') === '1' || String(params.hard || '') === 'true';
      const result = await deleteCorrection(store, id, { email: auth.email, hard, comment: params.comment || params.note });
      if (!result.ok) {
        const code = result.error === 'not_found' ? 404 : 400;
        return jsonResponse(code, cors, uiError(result.error || 'validation_failed'));
      }
      if (result.deleted) return jsonResponse(200, cors, result);
      return jsonResponse(200, cors, correctionPayload(result.correction, { rejected: true }));
    }

    return jsonResponse(405, cors, uiError('method_not_allowed'));
  } catch (err) {
    console.error('[content-corrections]', err);
    return jsonResponse(500, cors, uiError('server_error', { message: err.message || ERROR_MESSAGES.server_error }));
  }
};
