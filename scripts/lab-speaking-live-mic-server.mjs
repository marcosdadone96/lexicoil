/**
 * Local-only lab server for Sprechen Live mic testing.
 * Binds 127.0.0.1 — not exposed to real users / production UI.
 *
 * Reuses: mintEphemeralLiveToken, buildExamBlueprint, decideWhoStarts
 *
 *   node scripts/lab-speaking-live-mic-server.mjs
 *   → http://127.0.0.1:8787/lab/speaking-live-mic.html
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { appendSpeakingLiveCostLog } from './lib/speakingLiveCostLog.mjs';

loadEnvFile();
const require = createRequire(import.meta.url);

const { decideWhoStarts } = require(path.join(ROOT, 'netlify/functions/lib/speakingPersonas.js'));
const {
  buildExamBlueprint,
  toProductionEvalSprechenTask,
  SOFT_CLOSE_GRACE_MS,
} = require(path.join(ROOT, 'netlify/functions/lib/speakingLiveExam.js'));
const { mintEphemeralLiveToken, readGeminiKey } = require(
  path.join(ROOT, 'netlify/functions/lib/geminiLiveAuth.js'),
);

const HOST = '127.0.0.1';
const PORT = Number(process.env.SPEAKING_LIVE_LAB_PORT || 8787);
const HTML_PATH = path.join(ROOT, 'lab', 'speaking-live-mic.html');
const LOG_DIR = path.join(ROOT, 'batches', 'ready', 'gate-logs');

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  // Lab marker header on all responses
  res.setHeader('X-Lexicoil-Lab', 'speaking-live-internal');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/lab')) {
    res.writeHead(302, { Location: '/lab/speaking-live-mic.html' });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/lab/speaking-live-mic.html') {
    if (!fs.existsSync(HTML_PATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('lab html missing');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(fs.readFileSync(HTML_PATH));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/lab/api/health') {
    json(res, 200, {
      ok: true,
      lab: true,
      uiWired: false,
      implementationStatus: 'lab_internal',
      geminiKeyPresent: !!readGeminiKey(),
      htmlExists: fs.existsSync(HTML_PATH),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/lab/api/start') {
    try {
      if (!readGeminiKey()) {
        return json(res, 503, { ok: false, error: 'gemini_key_missing' });
      }
      const body = await readBody(req);
      const personaId = String(body.personaId || 'balanced');
      const mode = body.mode === 'exam' ? 'exam' : 'practice';
      const whoStarts = decideWhoStarts();
      const durationMs =
        mode === 'exam'
          ? 3 * 60 * 1000
          : Math.min(8 * 60 * 1000, Number(body.durationMs) || 8 * 60 * 1000);

      const blueprint = buildExamBlueprint({
        personaId,
        situation: body.situation || body.task || '',
        whoStarts,
        mode,
        durationMs,
        fieldId: 'lab-mic-t2',
        examId: 'lab-speaking-live-mic',
      });

      const minted = await mintEphemeralLiveToken({
        liveConfig: blueprint.liveConfig,
        model: blueprint.model,
        expireMinutes: Math.ceil((durationMs + SOFT_CLOSE_GRACE_MS) / 60000) + 5,
        newSessionExpireSeconds: 180,
      });

      const now = Date.now();
      const sessionId = `labmic-${now.toString(36)}`;
      const session = {
        sessionId,
        implementationStatus: 'lab_internal',
        personaId: blueprint.personaId,
        displayName: blueprint.displayName,
        whoStarts: blueprint.whoStarts,
        mode: blueprint.mode,
        situation: blueprint.situation,
        durationMs: blueprint.durationMs,
        softCloseGraceMs: blueprint.softCloseGraceMs,
        softClosePrompt: blueprint.softClosePrompt,
        startedAt: now,
        endsAt: now + blueprint.durationMs,
        status: 'active',
        live: {
          model: blueprint.model,
          ptt: true,
          automaticActivityDetectionDisabled: true,
          activityHandling: 'NO_INTERRUPTION',
        },
      };

      return json(res, 200, {
        ok: true,
        lab: true,
        uiWired: false,
        implementationStatus: 'lab_internal',
        session,
        ephemeral: {
          token: minted.token,
          expireTime: minted.expireTime,
          newSessionExpireTime: minted.newSessionExpireTime,
          apiVersion: minted.apiVersion,
          websocketUrl: minted.websocketUrl,
          model: minted.model,
        },
        clientSetup: {
          automaticActivityDetection: { disabled: true },
          activityHandling: 'NO_INTERRUPTION',
          responseModalities: ['AUDIO'],
        },
      });
    } catch (e) {
      console.error('[lab-mic] start', e.message);
      return json(res, 503, {
        ok: false,
        error: e.code || 'start_failed',
        message: e.message,
        details: e.details || null,
      });
    }
  }

  if (req.method === 'POST' && url.pathname === '/lab/api/finalize') {
    try {
      const body = await readBody(req);
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const turns = body.turns || [];
      const stamp = Date.now();
      const outRel = `batches/ready/gate-logs/speaking-live-mic-session-${stamp}.json`;
      const out = path.join(ROOT, outRel);
      const costEntry = appendSpeakingLiveCostLog({
        source: 'lab-mic',
        sessionId: body.sessionId || null,
        closeReason: body.closeReason || 'client',
        model: body.model || null,
        durationMs: body.durationMs ?? null,
        turnCount: turns.length,
        pcmBytesIn: body.pcmBytesIn ?? null,
        pcmBytesOut: body.pcmBytesOut ?? null,
        usageMetadata: body.usageMetadata || null,
        sessionLogFile: outRel.replace(/\\/g, '/'),
      });
      const record = {
        generatedAt: new Date().toISOString(),
        lab: true,
        uiWired: false,
        sessionId: body.sessionId || null,
        closeReason: body.closeReason || 'client',
        turns,
        durationMs: body.durationMs ?? null,
        pcmBytesIn: body.pcmBytesIn ?? null,
        pcmBytesOut: body.pcmBytesOut ?? null,
        usageMetadata: body.usageMetadata || null,
        cost: {
          usageCaptured: costEntry.usageCaptured,
          promptTokens: costEntry.promptTokens,
          responseTokens: costEntry.responseTokens,
          totalTokens: costEntry.totalTokens,
          chargedThisCallUsd: costEntry.chargedThisCallUsd,
          paidEquivalentUsd: costEntry.paidEquivalentUsd,
          priceInputPerM: costEntry.priceInputPerM,
          priceOutputPerM: costEntry.priceOutputPerM,
          costLogId: costEntry.id,
        },
        evalTask: toProductionEvalSprechenTask({
          sessionId: body.sessionId,
          fieldId: 'lab-mic-t2',
          situation: body.situation || '',
          turns,
        }),
      };
      fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
      return json(res, 200, {
        ok: true,
        saved: outRel.replace(/\\/g, '/'),
        cost: record.cost,
      });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  json(res, 404, { error: 'not_found', lab: true });
});

server.listen(PORT, HOST, () => {
  const page = `http://${HOST}:${PORT}/lab/speaking-live-mic.html`;
  console.log(`[lab-internal] Sprechen Live mic lab`);
  console.log(`[lab-internal] ${page}`);
  console.log(`[lab-internal] bind ${HOST}:${PORT} only — not for production users`);
  if (!readGeminiKey()) console.warn('[lab-internal] WARNING: GEMINI_API_KEY missing');
});
