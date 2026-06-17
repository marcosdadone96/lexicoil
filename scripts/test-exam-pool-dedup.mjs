/**
 * Unit checks for exam-pool per-user dedup (GET exclude + id in response).
 */
import assert from 'node:assert/strict';

function poolKeyId(key) {
  return String(key || '').split(':').pop();
}

function parseExcludeSet(excludeRaw) {
  const raw = String(excludeRaw || '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40),
  );
}

function pickCandidates(keys, exclude) {
  return keys.filter((key) => !exclude.has(poolKeyId(key)));
}

assert.equal(poolKeyId('pool:de:B1:abc-123'), 'abc-123');

const keys = ['pool:de:B1:a', 'pool:de:B1:b', 'pool:de:B1:c'];
const ex = parseExcludeSet('a,c');
assert.deepEqual(pickCandidates(keys, ex), ['pool:de:B1:b']);

const allSeen = parseExcludeSet('a,b,c');
assert.deepEqual(pickCandidates(keys, allSeen), []);

console.log('OK   exam-pool dedup helpers');
