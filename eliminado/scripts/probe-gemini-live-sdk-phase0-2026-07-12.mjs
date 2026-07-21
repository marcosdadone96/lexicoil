/**
 * Phase 0 probe via official @google/genai Live SDK.
 * PTT: automaticActivityDetection.disabled + activityStart/End.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';

loadEnvFile();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY missing');
  process.exit(1);
}

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
const ALEX =
  'Du bist Alex, ein ausgewogener Prüfungspartner im Goethe-Zertifikat B1 Sprechen. Antworte natürlich (2–4 Sätze). Stelle Fragen und reagiere fair. Bleibe auf B1-Niveau. Antworte nur auf Deutsch.';

const outDir = path.join(ROOT, 'batches', 'ready', 'gate-logs');
fs.mkdirSync(outDir, { recursive: true });

function synthPcm16k(ms = 900) {
  const n = Math.floor(16000 * (ms / 1000));
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / 16000;
    const sample = Math.sin(2 * Math.PI * 220 * t) * 1200;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, sample | 0)), i * 2);
  }
  return buf;
}

function summarizeMsg(msg) {
  try {
    return JSON.parse(
      JSON.stringify(msg, (k, v) => {
        if (typeof v === 'string' && v.length > 120) return v.slice(0, 40) + `…(${v.length})`;
        if (v && typeof v === 'object' && v.type === 'Buffer') return `[Buffer ${v.data?.length || '?'}]`;
        return v;
      }),
    );
  } catch {
    return String(msg);
  }
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 0,
    provider: 'gemini_live',
    sdk: '@google/genai',
    model: MODEL,
    persona: 'Alex',
    mode: 'PTT_manual_VAD_disabled',
    access: { keyPrefix: key.slice(0, 7), restOk: null },
    measurements: {},
    errors: [],
    sampleMessages: [],
  };

  // REST confirm
  const rest = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok?' }] }] }),
    },
  );
  report.access.restOk = rest.ok;
  report.access.restStatus = rest.status;

  const ai = new GoogleGenAI({ apiKey: key });
  const responseQueue = [];
  let openedAt = null;
  let firstAudioAt = null;
  let firstTextAt = null;
  let turnCompleteAt = null;
  let usage = null;

  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: ALEX,
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
    },
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
      activityHandling: 'NO_INTERRUPTION',
    },
  };

  let session;
  try {
    session = await ai.live.connect({
      model: MODEL,
      config,
      callbacks: {
        onopen: () => {
          openedAt = Date.now();
          console.log('opened');
        },
        onmessage: (message) => {
          responseQueue.push({ t: Date.now(), message });
          if (report.sampleMessages.length < 12) {
            report.sampleMessages.push({ t: Date.now(), message: summarizeMsg(message) });
          }
          if (message.usageMetadata) usage = message.usageMetadata;
          const sc = message.serverContent;
          if (!sc) return;
          if (sc.modelTurn?.parts) {
            for (const p of sc.modelTurn.parts) {
              if ((p.inlineData?.data || p.inlineData) && !firstAudioAt) firstAudioAt = Date.now();
              if (p.text && !firstTextAt) {
                firstTextAt = Date.now();
                report.measurements.firstTextSnippet = String(p.text).slice(0, 240);
              }
            }
          }
          // SDK may put audio on message.data
          if (message.data && !firstAudioAt) firstAudioAt = Date.now();
          if (message.text && !firstTextAt) {
            firstTextAt = Date.now();
            report.measurements.firstTextSnippet = String(message.text).slice(0, 240);
          }
          if (sc.outputTranscription?.text) {
            report.measurements.outputTranscript = (
              (report.measurements.outputTranscript || '') + sc.outputTranscription.text
            ).slice(0, 600);
          }
          if (sc.turnComplete) turnCompleteAt = Date.now();
        },
        onerror: (e) => {
          console.error('onerror', e?.message || e);
          report.errors.push(String(e?.message || e));
        },
        onclose: (e) => {
          console.log('onclose', e?.code, e?.reason);
          report.access.closeCode = e?.code;
          report.access.closeReason = e?.reason;
        },
      },
    });
  } catch (e) {
    report.errors.push('connect: ' + (e?.message || e));
    report.ok = false;
    write(report);
    process.exit(2);
  }

  report.access.connected = true;
  report.access.openedAt = openedAt;

  // Wait briefly for setup
  await new Promise((r) => setTimeout(r, 800));

  const pcm = synthPcm16k(900);
  const tActivityEndRef = { t: null };

  try {
    session.sendRealtimeInput({ activityStart: {} });
    session.sendRealtimeInput({
      audio: {
        data: pcm.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    });
    session.sendRealtimeInput({
      text: 'Hallo Alex, ich bin der Prüfungskandidat. Das Thema ist Freizeit. Was machst du gerne am Wochenende?',
    });
    tActivityEndRef.t = Date.now();
    session.sendRealtimeInput({ activityEnd: {} });
  } catch (e) {
    report.errors.push('send: ' + (e?.message || e));
  }

  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && !turnCompleteAt) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Fallback turn via client content if PTT audio path produced nothing
  if (!firstAudioAt && !firstTextAt && !turnCompleteAt) {
    console.log('No response via PTT audio/text — trying clientContent turnComplete');
    try {
      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: 'Hallo Alex, ich bin der Prüfungskandidat. Das Thema ist Freizeit. Was machst du gerne am Wochenende?',
              },
            ],
          },
        ],
        turnComplete: true,
      });
      const d2 = Date.now() + 35000;
      const t2 = Date.now();
      while (Date.now() < d2 && !turnCompleteAt) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (firstAudioAt) {
        report.measurements.fallbackClientContentLatencyMs = firstAudioAt - t2;
      }
    } catch (e) {
      report.errors.push('clientContent: ' + (e?.message || e));
    }
  }

  report.measurements.activityEndAt = tActivityEndRef.t;
  report.measurements.latencyActivityEndToFirstAudioMs =
    firstAudioAt && tActivityEndRef.t ? firstAudioAt - tActivityEndRef.t : null;
  report.measurements.latencyActivityEndToFirstTextMs =
    firstTextAt && tActivityEndRef.t ? firstTextAt - tActivityEndRef.t : null;
  report.measurements.latencyActivityEndToTurnCompleteMs =
    turnCompleteAt && tActivityEndRef.t ? turnCompleteAt - tActivityEndRef.t : null;
  report.measurements.gotAudio = !!firstAudioAt;
  report.measurements.gotText = !!firstTextAt;
  report.measurements.turnComplete = !!turnCompleteAt;
  report.rawUsage = usage;
  report.measurements.usageMetadata = usage;

  // Pricing (official): free tier $0; paid audio $3/$12 per 1M tokens
  if (usage) {
    const prompt = usage.promptTokenCount || 0;
    const response = usage.responseTokenCount || 0;
    const total = usage.totalTokenCount || prompt + response;
    report.measurements.tokens = { prompt, response, total, raw: usage };
    report.measurements.costUsd = {
      freeTierListed: true,
      chargedThisCallUsd: 0,
      note: 'gemini-3.1-flash-live-preview Free Tier = Free of charge per ai.google.dev/gemini-api/docs/pricing',
      paidEquivalentEstimateUsd:
        (prompt / 1e6) * 3 + (response / 1e6) * 12,
    };
  }

  try {
    session.close();
  } catch {
    /* */
  }

  report.ok = !!(firstAudioAt || firstTextAt || turnCompleteAt);
  write(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

function write(report) {
  const out = path.join(outDir, 'gemini-live-phase0-probe-2026-07-12.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log('Wrote', out);
}

await main();
