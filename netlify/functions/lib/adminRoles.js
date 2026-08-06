'use strict';

/** Full admin — staging, plans, add_admin, all admin-api actions. */
const FULL_ADMIN_ROLES = new Set(['admin', 'superadmin']);

/** Granular content corrections only (no assembly, no staging, no plans). */
const CONTENT_CORRECTOR_ROLE = 'content_corrector';

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isFullAdminRole(role) {
  return FULL_ADMIN_ROLES.has(normalizeRole(role));
}

function isContentCorrectorRole(role) {
  return normalizeRole(role) === CONTENT_CORRECTOR_ROLE;
}

/** Any row in lc_admin_roles that may use content-corrections API. */
function canAccessContentCorrections(role) {
  const r = normalizeRole(role);
  return isFullAdminRole(r) || r === CONTENT_CORRECTOR_ROLE;
}

/** Assembly-origin corrections remain full-admin only. */
function canManageAssemblyCorrections(role) {
  return isFullAdminRole(role);
}

/** Auto-approve on create / PATCH → approved. */
function canApproveContentCorrections(role) {
  return canAccessContentCorrections(role);
}

/** add_admin, approve_candidate, set_plan, etc. */
function canUseAdminApi(role) {
  return isFullAdminRole(role);
}

module.exports = {
  FULL_ADMIN_ROLES,
  CONTENT_CORRECTOR_ROLE,
  normalizeRole,
  isFullAdminRole,
  isContentCorrectorRole,
  canAccessContentCorrections,
  canManageAssemblyCorrections,
  canApproveContentCorrections,
  canUseAdminApi,
};
