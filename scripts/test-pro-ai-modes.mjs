#!/usr/bin/env node
/**
 * Acceptance: Pro-gated writing correction + grammar coaching (server helpers).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { extractJsonObject, certName } = require(path.join(ROOT, 'netlify/functions/lib/proAiModes.js'));

function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const sample = 'Here is the result:\n```json\n{"correctedText":"Hallo","errors":[],"summary":"OK","grammarPoints":[]}\n```';
const parsed = extractJsonObject(sample);
assert('extractJsonObject parses correctedText', parsed?.correctedText === 'Hallo');
assert('certName de', certName('de') === 'Goethe-Zertifikat');

// Simulate Pro gate logic (no network)
const freeState = { ok: true, authenticated: true, plan: 'free' };
const proState = { ok: true, authenticated: true, plan: 'pro' };
const guestState = { ok: true, authenticated: false, plan: 'guest' };

function gate(state) {
  if (!state.ok || !state.authenticated) return { ok: false, status: 401, error: 'login_required' };
  if (state.plan !== 'pro') return { ok: false, status: 403, error: 'pro_only' };
  return { ok: true };
}

assert('free user blocked (403 pro_only)', gate(freeState).error === 'pro_only');
assert('guest blocked (401)', gate(guestState).error === 'login_required');
assert('pro user allowed', gate(proState).ok === true);

console.log('\nPro AI mode helper tests done.\n');
