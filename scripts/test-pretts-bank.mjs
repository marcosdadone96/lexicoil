#!/usr/bin/env node
/**
 * Sprint 3 — pretts-bank + ElevenLabs voice registry smoke tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cacheDir, manifestPath, readCache, horenPassagesFromBank, loadBank } from './lib/ttsCache.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { synthesize, isProviderConfigured } = require(path.join(ROOT, 'netlify/functions/lib/ttsProvider.js'));
const { resolveVoiceId, defaultVoiceForLang, assignSpeakerVoices } = require(path.join(
  ROOT,
  'netlify/functions/lib/ttsVoices.js',
));
const ListeningScript = require(path.join(ROOT, 'js/bootstrap/listeningScript.js'));

function ok(msg) {
  console.log('OK  ', msg);
}

const deVoice = resolveVoiceId('de-DE', 'de');
assert.ok(deVoice && deVoice.length >= 16, 'resolve de-DE alias');
ok('voice alias de-DE → ElevenLabs id');

const legacy = resolveVoiceId('de-DE-KatjaNeural', 'de');
assert.notEqual(legacy, resolveVoiceId('de-DE-ConradNeural', 'de'));
ok('legacy Azure names map to distinct voices');

const dialogue = 'Moderatorin: Guten Tag.\nExpertin: Hallo.\nModeratorin: Danke.';
const prepped = ListeningScript.prepare(dialogue, 'de');
assert.equal(prepped.length, 3);
assert.ok(prepped.every((s) => /^[A-Za-z0-9]{16,24}$/.test(s.voice)));
ok('ListeningScript uses ElevenLabs voice ids');

const assigned = assignSpeakerVoices(ListeningScript.parseSegments(dialogue), 'de');
assert.equal(new Set(assigned.map((s) => s.voice)).size, 2);
ok('assignSpeakerVoices distinct per speaker');

const prev = process.env.TTS_PROVIDER;
process.env.TTS_PROVIDER = 'none';
assert.equal(await synthesize('Hallo', deVoice, 'de'), null);
process.env.TTS_PROVIDER = 'stub';
assert.equal(isProviderConfigured(), true);
const stub = await synthesize('Test', deVoice, 'de');
assert.ok(stub && stub.length > 32);
process.env.TTS_PROVIDER = prev;
ok('stub provider returns audio buffer');

const bank = loadBank('de', 'B1');
const horen = horenPassagesFromBank(bank);
assert.ok(horen.length >= 2, `de/B1 has hören passages (${horen.length})`);
ok(`de/B1 bank: ${horen.length} hören passages`);

const manifestBackup = fs.existsSync(manifestPath('de', 'B1'))
  ? fs.readFileSync(manifestPath('de', 'B1'))
  : null;
const cacheBackup = fs.existsSync(cacheDir()) ? fs.readdirSync(cacheDir()) : [];

const { execSync } = await import('node:child_process');
execSync('node scripts/pretts-bank.mjs --lang de --level B1', {
  cwd: ROOT,
  env: { ...process.env, TTS_PROVIDER: 'stub' },
  stdio: 'pipe',
});

assert.ok(fs.existsSync(manifestPath('de', 'B1')), 'manifest written');
const manifest = JSON.parse(fs.readFileSync(manifestPath('de', 'B1'), 'utf8'));
assert.ok(manifest.passages.length >= 2);
assert.ok(manifest.passages.some((p) => p.multiVoice));
ok(`pretts manifest: ${manifest.passages.length} passages`);

const multi = manifest.passages.find((p) => p.multiVoice);
assert.ok(multi.segments.length >= 2);
const hit = readCache(multi.segments[0].voice, multi.segments[0].preview);
assert.ok(hit || fs.existsSync(path.join(cacheDir(), `${multi.segments[0].voice}_${multi.segments[0].hash}.mp3`)));
ok('pretts wrote segment cache files');

if (manifestBackup) fs.writeFileSync(manifestPath('de', 'B1'), manifestBackup);
else fs.rmSync(manifestPath('de', 'B1'), { force: true });

console.log('\nSprint 3 TTS / pretts-bank tests passed.');
