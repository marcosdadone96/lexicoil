/**
 * Smoke test for speaking Live mic lab (no real speech required).
 * Starts local server, checks HTML load, mint, WS setupComplete, PTT button presence.
 *
 *   node scripts/lab-speaking-live-mic-smoke.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';

loadEnvFile();

const HOST = '127.0.0.1';
const PORT = Number(process.env.SPEAKING_LIVE_LAB_PORT || 8787);
const BASE = `http://${HOST}:${PORT}`;
const outDir = path.join(ROOT, 'batches', 'ready', 'gate-logs');
fs.mkdirSync(outDir, { recursive: true });

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/lab/api/health`);
      if (res.ok) return res.json();
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error('server health timeout');
}

async function parseWs(data) {
  if (typeof data === 'string') return JSON.parse(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return JSON.parse(await data.text());
  if (Buffer.isBuffer(data)) return JSON.parse(data.toString('utf8'));
  return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8'));
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    lab: true,
    uiWired: false,
    url: `${BASE}/lab/speaking-live-mic.html`,
    checks: {},
    errors: [],
    ok: false,
  };

  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'lab-speaking-live-mic-server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, SPEAKING_LIVE_LAB_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  child.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    serverLog += d.toString();
  });

  try {
    const health = await waitHealth();
    report.checks.health = health;
    if (!health.ok || !health.lab || health.uiWired !== false) {
      throw new Error('health marker failed');
    }
    if (!health.geminiKeyPresent) throw new Error('GEMINI_API_KEY missing');
    if (!health.htmlExists) throw new Error('HTML missing');

    const htmlRes = await fetch(`${BASE}/lab/speaking-live-mic.html`);
    const html = await htmlRes.text();
    report.checks.html = {
      status: htmlRes.status,
      hasLabBanner: /LABORATORIO INTERNO/i.test(html),
      hasPttButton: /Mantener para hablar/i.test(html) && /id="ptt"/.test(html),
      hasTimer: /id="timer"/.test(html),
      hasPersonas: /Kim|Alex|Leo/.test(html),
      notProductionUi: /no es producción/i.test(html),
    };
    if (htmlRes.status !== 200 || !report.checks.html.hasLabBanner || !report.checks.html.hasPttButton) {
      throw new Error('HTML smoke failed');
    }

    const startRes = await fetch(`${BASE}/lab/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personaId: 'balanced',
        mode: 'practice',
        situation: 'Wochenende planen — Lab smoke',
        durationMs: 60_000,
      }),
    });
    const start = await startRes.json();
    report.checks.mint = {
      status: startRes.status,
      ok: !!start.ok,
      lab: start.lab,
      implementationStatus: start.implementationStatus,
      tokenPrefix: start.ephemeral?.token ? String(start.ephemeral.token).slice(0, 24) : null,
      ptt: start.session?.live?.ptt,
      activityHandling: start.session?.live?.activityHandling,
      displayName: start.session?.displayName,
    };
    if (!start.ok || !start.ephemeral?.token) {
      throw new Error('mint failed: ' + (start.message || start.error));
    }

    // WS connect + setupComplete (no mic)
    const wsUrl = `${start.ephemeral.websocketUrl}?access_token=${encodeURIComponent(start.ephemeral.token)}`;
    const setupOk = await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const t = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* */
        }
        reject(new Error('setupComplete timeout'));
      }, 20000);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ setup: {} }));
      });
      ws.addEventListener('message', async (ev) => {
        try {
          const msg = await parseWs(ev.data);
          if (msg.setupComplete) {
            clearTimeout(t);
            report.checks.ws = { setupComplete: true, closeAfterSetup: true };
            ws.close();
            resolve(true);
          }
          if (msg.error) {
            clearTimeout(t);
            reject(new Error(JSON.stringify(msg.error)));
          }
        } catch (e) {
          clearTimeout(t);
          reject(e);
        }
      });
      ws.addEventListener('error', () => {
        clearTimeout(t);
        reject(new Error('ws error'));
      });
    });
    report.checks.ws.ok = !!setupOk;

    report.ok =
      report.checks.html.hasLabBanner &&
      report.checks.html.hasPttButton &&
      report.checks.mint.ok &&
      report.checks.mint.activityHandling === 'NO_INTERRUPTION' &&
      report.checks.ws.ok === true;

    report.operatorUrl = report.url;
    report.howToRun = 'node scripts/lab-speaking-live-mic-server.mjs';
  } catch (e) {
    report.errors.push(String(e.message || e));
    report.serverLogTail = serverLog.slice(-800);
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    try {
      child.kill('SIGKILL');
    } catch {
      /* */
    }
  }

  const out = path.join(outDir, 'speaking-live-mic-lab-smoke-2026-07-12.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, url: report.url, checks: report.checks, errors: report.errors }, null, 2));
  console.log('Wrote', out);
  process.exit(report.ok ? 0 : 2);
}

await main();
