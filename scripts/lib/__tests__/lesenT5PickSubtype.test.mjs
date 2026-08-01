import assert from 'node:assert/strict';
import { pickNextT5Subtype } from '../lesenSubtypeRotation.mjs';

const moldKeys = ['park', 'freizeitzentrum', 'sportverein', 'bibliothek'];
const sessionExclude = [
  'bibliothek',
  'bibliothek:standard',
  'freizeitzentrum',
  'sportverein',
];

const pick = pickNextT5Subtype(sessionExclude, 9, 'Freizeit', moldKeys);
assert.notEqual(pick.id, 'freizeitzentrum', 'fallback must not revive session-excluded subtype');
assert.notEqual(pick.id, 'bibliothek', 'fallback must not revive session-excluded subtype');
if (pick.id === null) {
  assert.equal(pick.tier, 'exhausted');
} else {
  assert.ok(!sessionExclude.includes(pick.id));
}

console.log('OK lesenT5PickSubtype.test.mjs');
