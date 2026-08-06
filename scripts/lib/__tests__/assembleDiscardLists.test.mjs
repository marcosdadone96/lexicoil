/**
 * Smoke test: discard lists load and block known Lena/schreiben ids.
 */
import assert from 'node:assert/strict';
import {
  loadAssembleDiscardLists,
  isAssembleBlocked,
} from '../assembleDiscardLists.mjs';

const { blockedIds, lists } = loadAssembleDiscardLists();
assert.ok(lists.some((l) => /LENA-CLUSTER-DISCARD/i.test(l.file)), 'loads Q2 Lena discard');
assert.ok(lists.some((l) => /PENDING-CONTENT-FIXES/i.test(l.file)), 'loads pending fixes');
assert.ok(isAssembleBlocked('lesen-t3-auto-toixf8', blockedIds), 'blocks toixf8');
assert.ok(isAssembleBlocked('lesen-t3-auto-toixf8.json', blockedIds), 'blocks toixf8.json');
assert.ok(isAssembleBlocked('schreiben-gemini-003', blockedIds), 'blocks schreiben-003');
assert.ok(isAssembleBlocked('schreiben-gemini-003-t1', blockedIds), 'blocks schreiben-003-t1');
assert.equal(isAssembleBlocked('lesen-t3-auto-ma7vt8', blockedIds), false, 'allows clean T3');
console.log('assembleDiscardLists tests passed.', { blocked: blockedIds.size, lists: lists.length });
