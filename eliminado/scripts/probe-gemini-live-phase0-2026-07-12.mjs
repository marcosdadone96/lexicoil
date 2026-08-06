/**
 * Phase 0 probe: Gemini Live API with existing GEMINI_API_KEY.
 * PTT mode: automaticActivityDetection.disabled + activityStart/End.
 * Run: node scripts/probe-gemini-live-phase0-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
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

/** ~1s of near-silence 16kHz mono PCM16 (tiny noise so it isn't pure zeros). */
function synthPcm16k(ms = 900) {
  const n = Math.floor(16000 * (ms / 1000));
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    // quiet 220Hz tone + tiny noise — enough for a "spoken" activity window
    const t = i / 16000;
    const sample = Math.sin(2 * Math.PI * 220 * t) * 800 + ((Math.random() - 0.5) * 40);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, sample | 0)), i * 2);
  }
  return buf;
}

async function restSmoke() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Antworte mit einem Wort: ok' }] }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - t0,
    error: body?.error?.message || null,
    text: body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || null,
  };
}

function waitFor(ws, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${label} (${timeoutMs}ms)`));
    }, timeoutMs);
    function onMsg(ev) {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      } catch {
        return;
      }
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    }
    function onErr(e) {
      cleanup();
      reject(e?.error || e || new Error('ws error'));
    }
    function onClose(ev) {
      cleanup();
      reject(new Error(`ws closed before ${label}: ${ev.code} ${ev.reason || ''}`));
    }
    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener('message', onMsg);
      ws.removeEventListener('error', onErr);
      ws.removeEventListener('close', onClose);
    }
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', onErr);
    ws.addEventListener('close', onClose);
  });
}

async function liveProbe() {
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 0,
    provider: 'gemini_live',
    model: MODEL,
    persona: 'Alex',
    mode: 'PTT_manual_activityStart_activityEnd',
    access: {},
    measurements: {},
    events: [],
    rawUsage: null,
    errors: [],
  };

  report.access.restSmoke = await restSmoke();
  console.log('REST smoke:', report.access.restSmoke);

  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`;
  const tConnect = Date.now();
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws open timeout')), 20000);
    ws.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(t);
      reject(e?.error || e);
    });
  });
  report.access.wsOpenMs = Date.now() - tConnect;
  report.access.wsConnected = true;
  console.log('WS open in', report.access.wsOpenMs, 'ms');

  const allMsgs = [];
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      allMsgs.push({ t: Date.now(), msg });
    } catch {
      /* ignore */
    }
  });

  // Setup: AUDIO out, PTT = auto VAD disabled, NO_INTERRUPTION for operator priority
  ws.send(
    JSON.stringify({
      setup: {
        model: `models/${MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
        },
        systemInstruction: {
          parts: [{ text: ALEX }],
        },
        realtimeInputConfig: {
          automaticActivityDetection: { disabled: true },
          activityHandling: 'NO_INTERRUPTION',
        },
      },
    }),
  );

  let setupMsg;
  try {
    setupMsg = await waitFor(ws, (m) => m.setupComplete != null || m.error != null, 25000, 'setupComplete');
  } catch (e) {
    report.errors.push(String(e.message || e));
    report.access.setupOk = false;
    try {
      ws.close();
    } catch {
      /* */
    }
    return finalize(report, allMsgs);
  }

  if (setupMsg.error) {
    report.access.setupOk = false;
    report.errors.push(setupMsg.error);
    report.access.setupError = setupMsg.error;
    ws.close();
    return finalize(report, allMsgs);
  }
  report.access.setupOk = true;
  report.access.setupComplete = setupMsg.setupComplete || true;
  console.log('setupComplete OK');

  // PTT turn: start → PCM (~0.9s) → end. Also send a short German text cue via realtime text if supported.
  const pcm = synthPcm16k(900);
  const tPttStart = Date.now();
  ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
  ws.send(
    JSON.stringify({
      realtimeInput: {
        audio: {
          data: pcm.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    }),
  );
  // Text cue so the model has clear content even if tone is meaningless
  ws.send(
    JSON.stringify({
      realtimeInput: {
        text: 'Hallo Alex, ich bin der Prüfungskandidat. Das Thema ist Freizeit. Was machst du gerne am Wochenende?',
      },
    }),
  );
  const tActivityEnd = Date.now();
  ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
  report.measurements.pttAudioMs = 900;
  report.measurements.activityEndAt = tActivityEnd;

  let firstAudioAt = null;
  let firstTextAt = null;
  let turnCompleteAt = null;
  let usage = null;
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline && !turnCompleteAt) {
    await new Promise((r) => setTimeout(r, 50));
    while (allMsgs.length) {
      const { t, msg } = allMsgs.shift();
      if (msg.error) {
        report.errors.push(msg.error);
      }
      if (msg.usageMetadata) usage = msg.usageMetadata;
      const sc = msg.serverContent;
      if (!sc) continue;
      if (sc.modelTurn?.parts) {
        for (const p of sc.modelTurn.parts) {
          if (p.inlineData?.data && !firstAudioAt) {
            firstAudioAt = t;
            report.measurements.firstAudioBytes = Buffer.from(p.inlineData.data, 'base64').length;
          }
          if (p.text && !firstTextAt) {
            firstTextAt = t;
            report.measurements.firstTextSnippet = String(p.text).slice(0, 200);
          }
        }
      }
      if (sc.outputTranscription?.text) {
        report.measurements.outputTranscript = (
          (report.measurements.outputTranscript || '') + sc.outputTranscription.text
        ).slice(0, 500);
      }
      if (sc.inputTranscription?.text) {
        report.measurements.inputTranscript = (
          (report.measurements.inputTranscript || '') + sc.inputTranscription.text
        ).slice(0, 500);
      }
      if (sc.turnComplete) {
        turnCompleteAt = t;
      }
    }
  }

  report.measurements.latencyActivityEndToFirstAudioMs =
    firstAudioAt != null ? firstAudioAt - tActivityEnd : null;
  report.measurements.latencyActivityEndToFirstTextMs =
    firstTextAt != null ? firstTextAt - tActivityEnd : null;
  report.measurements.latencyActivityEndToTurnCompleteMs =
    turnCompleteAt != null ? turnCompleteAt : null;
  report.measurements.turnCompleteAt = turnCompleteAt;
  report.measurements.gotAudio = firstAudioAt != null;
  report.measurements.gotText = firstTextAt != null;
  report.rawUsage = usage;
  report.measurements.usageMetadata = usage;

  // Cost estimate from usage if present (paid rates; free tier → $0)
  if (usage) {
    const audioIn = usage.promptTokensDetails?.find?.((d) => d.modality === 'AUDIO')?.tokenCount
      ?? usage.promptTokenCount
      ?? 0;
    // Heuristic: prefer explicit fields when present
    report.measurements.tokenFields = usage;
    report.measurements.estimatedCostUsdIfPaid = {
      audioInRatePer1M: 3.0,
      audioOutRatePer1M: 12.0,
      note: 'Free tier for gemini-3.1-flash-live-preview is $0; paid rates from ai.google.dev pricing',
    };
  }

  try {
    ws.close();
  } catch {
    /* */
  }

  report.ok = report.access.setupOk && (report.measurements.gotAudio || report.measurements.gotText);
  return finalize(report, []);
}

function finalize(report, leftover) {
  report.leftoverMsgCount = leftover.length;
  const out = path.join(outDir, 'gemini-live-phase0-probe-2026-07-12.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('Wrote', out);
  return report;
}

const report = await liveProbe();
process.exit(report.ok ? 0 : 2);
