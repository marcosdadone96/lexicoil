#!/usr/bin/env node
/**
 * Sprechen voice pilot — gate + UI visibility + transcript eval shape.
 * Run: node scripts/test-speaking-voice-pilot-e2e.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const pilot = require(path.join(ROOT, 'netlify/functions/lib/speakingVoicePilot.js'));
const { formatCandidateTranscript, toProductionEvalSprechenTask } = require(
  path.join(ROOT, 'netlify/functions/lib/speakingLiveExam.js'),
);

const liveClientCtx = { console, window: {} };
vm.createContext(liveClientCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/speakingLiveClient.js'), 'utf8'), liveClientCtx);
const SpeakingLiveClient = liveClientCtx.SpeakingLiveClient || liveClientCtx.window.SpeakingLiveClient;

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${desc}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('\n── speakingVoicePilot gate ──');

const envBackup = {
  emails: process.env.SPEAKING_VOICE_PILOT_EMAILS,
  pct: process.env.SPEAKING_VOICE_PILOT_PERCENT,
};

test('default: all Pro / Pro Max eligible when no restriction env', () => {
  delete process.env.SPEAKING_VOICE_PILOT_EMAILS;
  delete process.env.SPEAKING_VOICE_PILOT_PERCENT;
  assert.equal(pilot.isSpeakingVoicePilotEligible('any@pro.com', 'pro'), true);
  assert.equal(pilot.isSpeakingVoicePilotEligible('any@pro.com', 'pro_max'), true);
  assert.equal(pilot.isSpeakingVoicePilotEligible('alice@example.com', 'free'), false);
});

test('allowlist grants Pro user on list only when restriction active', () => {
  process.env.SPEAKING_VOICE_PILOT_EMAILS = 'pilot@lexicoil.com, ops@test.de';
  delete process.env.SPEAKING_VOICE_PILOT_PERCENT;
  assert.equal(pilot.isSpeakingVoicePilotEligible('pilot@lexicoil.com', 'pro'), true);
  assert.equal(pilot.isSpeakingVoicePilotEligible('other@example.com', 'pro'), false);
});

test('percent bucket when SPEAKING_VOICE_PILOT_PERCENT > 0', () => {
  delete process.env.SPEAKING_VOICE_PILOT_EMAILS;
  process.env.SPEAKING_VOICE_PILOT_PERCENT = '100';
  assert.equal(pilot.isSpeakingVoicePilotEligible('any@pro.com', 'pro'), true);
  process.env.SPEAKING_VOICE_PILOT_PERCENT = '0';
  // percent=0 with no allowlist → restriction off → all Pro again
  assert.equal(pilot.isSpeakingVoicePilotEligible('any@pro.com', 'pro'), true);
});

process.env.SPEAKING_VOICE_PILOT_EMAILS = envBackup.emails;
process.env.SPEAKING_VOICE_PILOT_PERCENT = envBackup.pct;

console.log('\n── transcript → productionEval ──');

test('voice turns map to eval task with session teil', () => {
  const session = {
    fieldId: 'speak_bp_1',
    teil: 1,
    situation: 'Plan a weekend.',
    turns: [
      { role: 'partner', text: 'Hallo!' },
      { role: 'user', text: 'Hallo Kim!' },
    ],
  };
  const task = toProductionEvalSprechenTask(session);
  assert.match(task.transcript, /Partner: Hallo!/);
  assert.match(task.transcript, /Kandidat: Hallo Kim!/);
  assert.equal(task.teil, 1);
});

test('client eval formatter uses Ich/Partner (DE)', () => {
  const txt = SpeakingLiveClient.formatTranscriptForEval(
    [
      { role: 'user', text: 'Guten Tag' },
      { role: 'partner', text: 'Hallo' },
    ],
    true,
  );
  assert.match(txt, /Ich: Guten Tag/);
  assert.match(txt, /Partner: Hallo/);
});

console.log('\n── UI: non-pilot hides voice tabs ──');

const convCtx = {
  SpeakingModes: {
    INPUT_MODES: { PARTNER: 'partner', VOICE_LIVE: 'voice_live' },
    REALTIME_PERSONALITIES: [
      {
        id: 'balanced',
        label: 'Alex',
        labelDe: 'Alex',
        desc: 'Balanced',
        descDe: 'Normal',
      },
    ],
    personalityById: () => ({ displayName: 'Alex', desc: 'Balanced', descDe: 'Normal' }),
  },
  SpeakingLiveVoice: { renderPanel: () => '<div class="speak-live-voice"></div>' },
  esc: (s) => String(s ?? ''),
  S: { subject: 'de' },
  console,
  window: {},
};
vm.createContext(convCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/exam/speakingConversation.js'), 'utf8'), convCtx);
const SpeakingConversation = convCtx.SpeakingConversation || convCtx.window.SpeakingConversation;

test('renderPartShell includes hidden voice tabs by default (T1 partner)', () => {
  const html = SpeakingConversation.renderPartShell(
    { teil: 1, fieldId: 'speak_bp_1', situation: 'Plan together' },
    { lang: 'de', speakFmt: 'fmt' },
  );
  assert.match(html, /speakModeTabs_speak_bp_1/);
  assert.match(html, /hidden/);
  assert.match(html, /Stimme/);
  assert.match(html, /speak-live-voice/);
});

test('speaking-realtime-session exports pilot gate on start (static)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'netlify/functions/speaking-realtime-session.js'),
    'utf8',
  );
  assert.match(src, /pilot_not_eligible/);
  assert.match(src, /isSpeakingVoicePilotEligible/);
  assert.match(src, /appendSpeakingLiveCostLog/);
});

console.log('\n── CSP allows Gemini Live WebSocket ──');

test('netlify.toml connect-src includes generativelanguage.googleapis.com', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /wss:\/\/generativelanguage\.googleapis\.com/);
  assert.match(toml, /https:\/\/generativelanguage\.googleapis\.com/);
});

test('speakingLiveClient exposes telemetry getter', () => {
  const client = SpeakingLiveClient.create({
    session: { durationMs: 60000, whoStarts: 'user' },
    ephemeral: { token: 'x', websocketUrl: 'wss://example.test' },
  });
  assert.equal(typeof client.getTelemetry, 'function');
  const tel = client.getTelemetry();
  assert.equal(tel.pcmBytesIn, 0);
  assert.equal(tel.pcmBytesOut, 0);
  assert.equal(tel.geminiLiveConnected, false);
  assert.equal(tel.usageMetadata, null);
});

console.log('\n── text chat TTS guard ──');

test('submitExamConfig uses per-module credit gate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examConfig.js'), 'utf8');
  assert.match(src, /canUsePersonalModuleGen/);
  assert.match(src, /personalGenCreditAction/);
  assert.match(src, /poolModule/);
});

test('zero-cost personal actions resolve on server', () => {
  const { resolveAiCost } = require(path.join(ROOT, 'netlify/functions/lib/aiCredits.js'));
  assert.equal(resolveAiCost('personal_lesen'), 0);
  assert.equal(resolveAiCost('personal_horen'), 0);
  assert.equal(resolveAiCost('not_an_action'), null);
});

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed) process.exit(1);

console.log('\nNote: live WS + mic E2E requires GEMINI_API_KEY and pilot allowlist in deployed env.');
console.log('Run: node scripts/lab-speaking-live-e2e-2026-07-12.mjs for full Gemini Live pipeline.');
