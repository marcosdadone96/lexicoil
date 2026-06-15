#!/usr/bin/env node
/**
 * Unit checks for vocab-cache key normalization.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function textHash(text) {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 16);
}

function cacheKey(from, to, text) {
  return `xlat:${from}:${to}:${textHash(text)}`;
}

assert.equal(textHash('  Hello '), textHash('hello'));
assert.equal(cacheKey('de', 'en', 'Haus'), cacheKey('de', 'en', '  haus '));
assert.notEqual(cacheKey('de', 'en', 'Haus'), cacheKey('de', 'es', 'Haus'));

console.log('OK   vocab-cache key helpers');
