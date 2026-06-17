#!/usr/bin/env node
/**
 * TTS provider + cache key smoke tests.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { synthesize, isProviderConfigured } = require(path.join(ROOT, 'netlify/functions/lib/ttsProvider.js'));
const { resolveVoiceId, defaultVoiceForLang } = require(path.join(ROOT, 'netlify/functions/lib/ttsVoices.js'));

function ttsTextHash(text) {
  return crypto.createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

const prev = process.env.TTS_PROVIDER;
process.env.TTS_PROVIDER = 'none';
assert.equal(await synthesize('Hallo Welt', 'de-DE', 'de'), null);
assert.equal(isProviderConfigured(), false);

process.env.TTS_PROVIDER = 'stub';
assert.equal(isProviderConfigured(), true);
const stub = await synthesize('Test passage', 'en-GB', 'en');
assert.ok(stub && stub.length > 32, 'stub provider returns audio buffer');

process.env.TTS_PROVIDER = prev;

const h1 = ttsTextHash('  Hello ');
const h2 = ttsTextHash('hello');
assert.equal(h1, h2);

assert.ok(resolveVoiceId('de-DE', 'de'));
assert.ok(defaultVoiceForLang('de'));
console.log('OK   voice registry resolves de-DE');

console.log('OK   TTS provider + hash helpers');
