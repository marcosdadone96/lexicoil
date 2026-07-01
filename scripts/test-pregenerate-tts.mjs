#!/usr/bin/env node
/** TTS cache hash parity — scripts and netlify/functions/tts.js share ttsCacheLib.js */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsTextHash, readCache } from './lib/ttsCache.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = require(path.join(ROOT, 'netlify/functions/lib/ttsCacheLib.js'));

const sample = '  Guten Tag! ■ Wie geht es?  ';
assert.equal(ttsTextHash(sample), lib.textHash(sample), 'hash parity with tts.js');
assert.equal(lib.normalizeText(sample), 'guten tag! wie geht es?');
assert.equal(lib.normalizeTtsInput(sample), 'Guten Tag! Wie geht es?');

const frontNorm = String(sample)
  .replace(/[■●▲►◆]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
assert.equal(frontNorm, lib.normalizeTtsInput(sample), 'front normalizeTtsQueryText parity');

const hit = readCache('de-DE', 'Hallo Welt', 'de');
if (hit) assert.ok(hit.bytes > 0, 'bundled cache readable');

console.log('OK   TTS cache hash parity (ttsCacheLib ↔ pregenerate)');
