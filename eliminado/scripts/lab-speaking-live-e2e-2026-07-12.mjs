/**
 * Internal lab E2E — Gemini Live Sprechen (Phase 2).
 * NOT wired to production UI.
 *
 * 1) Mint ephemeral token (GEMINI_API_KEY stays server-side)
 * 2) Constrained WS session — structured exam turns via clientContent
 * 3) Soft time-limit close
 * 4) Transcript → productionEval (4 Goethe criteria)
 * 5) A/B NO_INTERRUPTION vs START_OF_ACTIVITY_INTERRUPTS (PCM barge)
 *
 * Run: node scripts/lab-speaking-live-e2e-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { GoogleGenAI, Modality } from '@google/genai';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { decideWhoStarts } = require(path.join(ROOT, 'netlify/functions/lib/speakingPersonas.js'));
const {
  buildExamBlueprint,
  formatCandidateTranscript,
  toProductionEvalSprechenTask,
  SOFT_CLOSE_GRACE_MS,
} = require(path.join(ROOT, 'netlify/functions/lib/speakingLiveExam.js'));
const { mintEphemeralLiveToken, readGeminiKey } = require(
  path.join(ROOT, 'netlify/functions/lib/geminiLiveAuth.js'),
);
const { runProductionEval } = require(path.join(ROOT, 'netlify/functions/lib/productionEval.js'));
const { readAnthropicKey } = require(path.join(ROOT, 'netlify/functions/lib/anthropicKey.js'));

const outDir = path.join(ROOT, 'batches', 'ready', 'gate-logs');
fs.mkdirSync(outDir, { recursive: true });

const SITUATION =
  'Ihr plant zusammen ein Wochenende in der Stadt. Sprecht über Aktivitäten, Essen und Transport. Einigt euch auf einen Plan.';

const LAB_DURATION_MS = Number(process.env.SPEAKING_LIVE_LAB_DURATION_MS || 35_000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseWsData(data) {
  if (typeof data === 'string') return JSON.parse(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return JSON.parse(await data.text());
  if (Buffer.isBuffer(data)) return JSON.parse(data.toString('utf8'));
  if (data?.arrayBuffer) return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8'));
  throw new Error('unsupported ws payload');
}

function pcmTone(ms = 900) {
  const n = Math.floor(16000 * (ms / 1000));
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE((Math.sin((2 * Math.PI * 440 * i) / 16000) * 10000) | 0, i * 2);
  }
  return buf;
}

function write(report) {
  const out = path.join(outDir, 'speaking-live-lab-e2e-2026-07-12.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log('Wrote', out);
}

/** Constrained Live session with ephemeral token (client never sees API key). */
async function runConstrainedExamSession({ minted, blueprint, startedAt, endsAt }) {
  const url = `${minted.websocketUrl}?access_token=${encodeURIComponent(minted.token)}`;
  const ws = new WebSocket(url);
  const turns = [];
  let partnerText = '';
  let userText = '';
  let setupOk = false;
  let turnCompletes = 0;
  let lastError = null;

  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws open/setup timeout')), 20000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ setup: {} }));
    });
    ws.addEventListener('message', async (ev) => {
      try {
        const m = await parseWsData(ev.data);
        if (m.error) lastError = m.error;
        if (m.setupComplete) {
          setupOk = true;
          clearTimeout(t);
          resolve();
        }
        if (m.serverContent?.outputTranscription?.text) {
          const chunk = m.serverContent.outputTranscription.text;
          partnerText += chunk;
        }
        if (m.serverContent?.inputTranscription?.text) {
          userText += m.serverContent.inputTranscription.text;
        }
        if (m.serverContent?.turnComplete) turnCompletes += 1;
      } catch (e) {
        lastError = e.message;
      }
    });
    ws.addEventListener('close', (e) => {
      if (!setupOk) {
        clearTimeout(t);
        reject(new Error(`ws closed before setup: ${e.code} ${e.reason || ''}`));
      }
    });
  });

  await ready;

  async function userTurn(text) {
    turns.push({ role: 'user', text, at: Date.now() });
    const before = turnCompletes;
    partnerText = '';
    ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline && turnCompletes <= before) await sleep(100);
    if (partnerText.trim()) {
      turns.push({ role: 'partner', text: partnerText.trim(), at: Date.now() });
    }
  }

  // Structured exam turns (not free chat)
  if (blueprint.whoStarts === 'partner') {
    await userTurn(
      '(Der Kandidat ist bereit.) Bitte begrüße kurz und starte das Gespräch zur Prüfungsaufgabe.',
    );
  }

  await userTurn(
    'Hallo Alex! Am Wochenende möchte ich gern etwas unternehmen. Vielleicht ein Museum und danach essen gehen. Was denkst du?',
  );

  await userTurn(
    'Ja, gut. Am Sonntag können wir spazieren gehen. Wir nehmen Bus oder Bahn. Einverstanden?',
  );

  // Soft time limit
  const remain = endsAt - Date.now();
  if (remain > 0) await sleep(Math.min(remain, 5000));

  const softStarted = Date.now();
  await userTurn(blueprint.softClosePrompt);
  const softGraceMs = Date.now() - softStarted;

  try {
    ws.close();
  } catch {
    /* */
  }

  return {
    turns,
    turnCompletes,
    setupOk,
    lastError,
    softClose: { softStarted, softGraceMs, promptSent: true },
    elapsedMs: Date.now() - startedAt,
  };
}

/** A/B barge probe — proves activityHandling works (server-side API key, lab only). */
async function probeNoInterruption() {
  async function one(mode) {
    const ai = new GoogleGenAI({ apiKey: readGeminiKey() });
    let interrupted = 0;
    let txAfter = '';
    let bargeAt = 0;
    let barged = false;
    let out = '';
    let resolveTurn;
    const turnP = new Promise((r) => {
      resolveTurn = r;
    });
    const session = await ai.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          'Du bist Alex. Antworte auf Deutsch mit vielen Sätzen (mindestens 6), ausführlich.',
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: { disabled: true },
          activityHandling: mode,
        },
      },
      callbacks: {
        onmessage: (m) => {
          const sc = m.serverContent;
          if (!sc) return;
          if (sc.interrupted) interrupted += 1;
          if (sc.outputTranscription?.text) {
            out += sc.outputTranscription.text;
            if (!barged && out.length > 25) {
              barged = true;
              setTimeout(() => {
                bargeAt = Date.now();
                session.sendRealtimeInput({ activityStart: {} });
                session.sendRealtimeInput({
                  audio: {
                    data: pcmTone(900).toString('base64'),
                    mimeType: 'audio/pcm;rate=16000',
                  },
                });
                session.sendRealtimeInput({ activityEnd: {} });
              }, 350);
            } else if (bargeAt && Date.now() > bargeAt) {
              txAfter += sc.outputTranscription.text;
            }
          }
          if (sc.turnComplete) resolveTurn();
        },
      },
    });
    session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            {
              text: 'Beschreibe sehr ausführlich einen kompletten Wochenendplan Tag für Tag mit Uhrzeiten, Orten, Essen und Verkehr.',
            },
          ],
        },
      ],
      turnComplete: true,
    });
    await Promise.race([turnP, sleep(22000)]);
    try {
      session.close();
    } catch {
      /* */
    }
    return {
      mode,
      interrupted,
      barged,
      txAfterChars: txAfter.length,
      outChars: out.length,
      preview: out.slice(0, 140),
    };
  }

  const noInt = await one('NO_INTERRUPTION');
  const doesInt = await one('START_OF_ACTIVITY_INTERRUPTS');
  return {
    noInterruption: noInt,
    startOfActivityInterrupts: doesInt,
    passed:
      noInt.interrupted === 0 &&
      noInt.txAfterChars > 50 &&
      doesInt.interrupted >= 1 &&
      doesInt.txAfterChars < noInt.txAfterChars,
    note:
      'PCM barge during partner speech: NO_INTERRUPTION continues transcript; START_OF_ACTIVITY_INTERRUPTS sets interrupted and stops.',
  };
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    lab: true,
    uiWired: false,
    steps: {},
    noInterruption: null,
    eval: null,
    errors: [],
    ok: false,
  };

  if (!readGeminiKey()) {
    report.errors.push('GEMINI_API_KEY missing');
    write(report);
    process.exit(2);
  }

  const whoStarts = decideWhoStarts(() => 0.1); // partner starts (deterministic)
  const blueprint = buildExamBlueprint({
    personaId: 'balanced',
    situation: SITUATION,
    whoStarts,
    mode: 'practice',
    durationMs: LAB_DURATION_MS,
    fieldId: 'lab-t2',
    examId: 'lab-speaking-live',
  });
  report.steps.blueprint = {
    persona: blueprint.displayName,
    whoStarts: blueprint.whoStarts,
    durationMs: blueprint.durationMs,
    examDurationOfficialMs: 180000,
    model: blueprint.model,
    ptt: true,
    activityHandling: 'NO_INTERRUPTION',
  };

  // 1) Mint
  let minted;
  try {
    minted = await mintEphemeralLiveToken({
      liveConfig: blueprint.liveConfig,
      model: blueprint.model,
      expireMinutes: 25,
      newSessionExpireSeconds: 180,
    });
    report.steps.mint = {
      ok: true,
      tokenPrefix: String(minted.token).slice(0, 28),
      tokenIsNotApiKey: minted.token !== readGeminiKey(),
      websocketUrl: minted.websocketUrl,
    };
  } catch (e) {
    report.steps.mint = { ok: false, error: e.message, details: e.details || null };
    report.errors.push('mint: ' + e.message);
    write(report);
    process.exit(2);
  }
  console.log('minted', report.steps.mint.tokenPrefix);

  // 2) Constrained exam session
  const startedAt = Date.now();
  const endsAt = startedAt + blueprint.durationMs;
  let sessionResult;
  try {
    sessionResult = await runConstrainedExamSession({ minted, blueprint, startedAt, endsAt });
    report.steps.session = {
      ok: sessionResult.setupOk && sessionResult.turns.length >= 2,
      turnCount: sessionResult.turns.length,
      turnCompletes: sessionResult.turnCompletes,
      softClose: sessionResult.softClose,
      elapsedMs: sessionResult.elapsedMs,
      lastError: sessionResult.lastError,
      transcriptPreview: formatCandidateTranscript(sessionResult.turns).slice(0, 500),
    };
  } catch (e) {
    report.steps.session = { ok: false, error: e.message };
    report.errors.push('session: ' + e.message);
    write(report);
    process.exit(2);
  }

  report.steps.timeLimit = {
    labDurationMs: LAB_DURATION_MS,
    elapsedMs: sessionResult.elapsedMs,
    softCloseUsed: true,
    respected: sessionResult.elapsedMs <= LAB_DURATION_MS + SOFT_CLOSE_GRACE_MS + 25000,
  };

  const sessionRecord = {
    sessionId: 'lab-' + Date.now().toString(36),
    fieldId: 'lab-t2',
    situation: SITUATION,
    turns: sessionResult.turns,
    status: 'finalized',
    closeReason: 'time_limit_soft',
  };
  const evalTask = toProductionEvalSprechenTask(sessionRecord);
  report.steps.transcript = {
    evalCompatible: !!(evalTask.transcript && evalTask.situation),
    shape: { id: evalTask.id, teil: evalTask.teil, transcriptChars: evalTask.transcript.length },
  };

  // 3) Eval
  const anthropicKey = readAnthropicKey();
  if (anthropicKey?.startsWith('sk-ant-')) {
    try {
      const result = await runProductionEval(anthropicKey, {
        lang: 'de',
        level: 'B1',
        passPercent: 60,
        schreiben: [],
        sprechen: [evalTask],
        feedbackLevel: 'full',
      });
      report.eval = {
        ok: result.ok,
        sprechen: result.sprechen?.[0]
          ? {
              totalScore: result.sprechen[0].totalScore ?? result.sprechen[0].score,
              passed: result.sprechen[0].passed,
              criteria: result.sprechen[0].criteria,
              overallFeedback: result.sprechen[0].overallFeedback,
              ausspracheNote: result.sprechen[0].ausspracheNote,
            }
          : null,
      };
    } catch (e) {
      report.eval = { ok: false, error: e.message };
      report.errors.push('eval: ' + e.message);
    }
  } else {
    report.eval = { ok: false, error: 'ANTHROPIC_API_KEY missing' };
  }

  // 4) NO_INTERRUPTION A/B
  console.log('NO_INTERRUPTION A/B probe…');
  try {
    report.noInterruption = await probeNoInterruption();
  } catch (e) {
    report.noInterruption = { passed: false, error: e.message };
    report.errors.push('noInt: ' + e.message);
  }
  console.log('NO_INTERRUPTION', {
    passed: report.noInterruption?.passed,
    a: report.noInterruption?.noInterruption,
    b: report.noInterruption?.startOfActivityInterrupts,
  });

  report.ok =
    report.steps.mint?.ok &&
    report.steps.session?.ok &&
    report.steps.timeLimit?.respected &&
    report.steps.transcript?.evalCompatible &&
    report.eval?.ok === true &&
    report.noInterruption?.passed === true;

  write(report);
  console.log(JSON.stringify({ ok: report.ok, evalScore: report.eval?.sprechen?.totalScore, noInt: report.noInterruption?.passed }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

await main();
