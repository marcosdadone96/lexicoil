/**
 * Client-side admin / content-editor capabilities (mirror netlify/functions/lib/adminRoles.js).
 */
const AdminAccess = (() => {
  const FULL_ADMIN_ROLES = new Set(['admin', 'superadmin']);
  const CONTENT_CORRECTOR_ROLE = 'content_corrector';

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
  }

  function isFullAdminRole(role) {
    return FULL_ADMIN_ROLES.has(normalizeRole(role));
  }

  function canEditContentRole(role) {
    const r = normalizeRole(role);
    return isFullAdminRole(r) || r === CONTENT_CORRECTOR_ROLE;
  }

  /** @param {object|null|undefined} user — S.user or auth-me payload */
  function canEditContentFromUser(user) {
    if (!user || user.guest) return false;
    if (user.canEditContent === true) return true;
    if (user.canEditContent === false) return false;
    if (user.adminRole) return canEditContentRole(user.adminRole);
    return user.isAdmin === true && isFullAdminRole('admin');
  }

  function isFullAdminFromUser(user) {
    if (!user || user.guest) return false;
    if (user.isAdmin === false) return false;
    if (user.adminRole) return isFullAdminRole(user.adminRole);
    return user.isAdmin === true;
  }

  function roleLabel(user) {
    if (!canEditContentFromUser(user)) return '';
    if (isFullAdminFromUser(user)) return 'Admin';
    if (normalizeRole(user.adminRole) === CONTENT_CORRECTOR_ROLE) return 'Editor de contenido';
    return 'Editor';
  }

  /** Tab ids on admin.html visible per role */
  function adminTabsForUser(user) {
    if (isFullAdminFromUser(user)) {
      return [
        'overview',
        'users',
        'pool',
        'staging',
        'corrections',
        'cap-proposals',
        'feedback',
        'parts',
        'generations',
        'tools',
      ];
    }
    if (canEditContentFromUser(user)) return ['corrections', 'cap-proposals'];
    return [];
  }

  return {
    CONTENT_CORRECTOR_ROLE,
    FULL_ADMIN_ROLES,
    normalizeRole,
    isFullAdminRole,
    canEditContentRole,
    canEditContentFromUser,
    isFullAdminFromUser,
    roleLabel,
    adminTabsForUser,
  };
})();

if (typeof window !== 'undefined') window.AdminAccess = AdminAccess;
if (typeof module !== 'undefined') module.exports = AdminAccess;
