#!/usr/bin/env node
import assert from 'node:assert';
import { shouldSkipLemma } from '../genderLexiconBatchFilters.mjs';

const goethe = new Map([['montag', { gender: 'm' }]]);

assert.strictEqual(shouldSkipLemma('Laura', goethe).skip, true);
assert.strictEqual(shouldSkipLemma('Montag', goethe).skip, false);
assert.strictEqual(shouldSkipLemma('Vorteile', goethe).skip, true);
assert.strictEqual(shouldSkipLemma('Supermarkt', goethe).skip, false);
assert.strictEqual(shouldSkipLemma('Parks', goethe).skip, true);
assert.strictEqual(shouldSkipLemma('Aufgabe', new Map([['aufgabe', {}]])).skip, false);

console.log('OK genderLexiconBatchFilters');
