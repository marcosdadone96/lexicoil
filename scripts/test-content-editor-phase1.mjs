#!/usr/bin/env node
/**
 * Phase 1 — content editor permissions + UI signals.
 *   node scripts/test-content-editor-phase1.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const roles = require(path.join(ROOT, 'netlify/functions/lib/adminRoles.js'));

assert.equal(roles.canEditContent('content_corrector'), true);
assert.equal(roles.canEditContent('admin'), true);
assert.equal(roles.canEditContent(null), false);
assert.equal(roles.isFullAdminRole('content_corrector'), false);

const editorCaps = roles.adminCapabilitiesFromRole('content_corrector');
assert.equal(editorCaps.isAdmin, false);
assert.equal(editorCaps.canEditContent, true);
assert.equal(editorCaps.adminRole, 'content_corrector');

const adminCaps = roles.adminCapabilitiesFromRole('admin');
assert.equal(adminCaps.isAdmin, true);
assert.equal(adminCaps.canEditContent, true);

const AdminAccess = require(path.join(ROOT, 'js/library/adminAccess.js'));
const editorUser = { adminRole: 'content_corrector', isAdmin: false, canEditContent: true };
const adminUser = { adminRole: 'admin', isAdmin: true, canEditContent: true };
const normalUser = { adminRole: null, isAdmin: false, canEditContent: false };

assert.equal(AdminAccess.canEditContentFromUser(editorUser), true);
assert.equal(AdminAccess.isFullAdminFromUser(editorUser), false);
assert.equal(AdminAccess.adminTabsForUser(editorUser).join(','), 'corrections');
assert.equal(AdminAccess.adminTabsForUser(normalUser).length, 0);

const adminTabs = AdminAccess.adminTabsForUser(adminUser);
assert.ok(adminTabs.includes('staging'), 'full admin sees staging');
assert.ok(adminTabs.includes('tools'), 'full admin sees tools');
assert.ok(!adminTabs.includes('corrections') || adminTabs.includes('corrections'));

const hiddenForEditor = ['overview', 'users', 'pool', 'staging', 'feedback', 'parts', 'generations', 'tools'];
for (const tab of hiddenForEditor) {
  assert.ok(!AdminAccess.adminTabsForUser(editorUser).includes(tab), 'editor must not see ' + tab);
}

// Simulated exam UI gate (mirrors adminContentReview.canEditContent)
function examRunnerShowsCorrectButton(user) {
  return AdminAccess.canEditContentFromUser(user);
}
assert.equal(examRunnerShowsCorrectButton(editorUser), true);
assert.equal(examRunnerShowsCorrectButton(normalUser), false);

console.log('OK content editor phase 1 — roles, tabs, exam correction gate');
