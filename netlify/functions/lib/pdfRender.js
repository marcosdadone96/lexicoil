'use strict';

/**
 * Single PDF render path: HTML string → PDF buffer.
 * Uses puppeteer-core page.pdf() when installed; otherwise raw CDP Page.printToPDF
 * with displayHeaderFooter:false (same contract as generate-pdf.js).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', right: '12mm', bottom: '20mm', left: '12mm' },
  displayHeaderFooter: false,
};

const A4_INCHES = { width: 8.27, height: 11.69 };

function mmToInches(mm) {
  return Number(String(mm).replace('mm', '')) / 25.4;
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (_) {
    return null;
  }
}

function loadWs() {
  try {
    return require('ws');
  } catch (_) {
    return null;
  }
}

function waitForDevtools(port, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - started > timeoutMs) reject(new Error('devtools_timeout'));
        else setTimeout(tick, 120);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('devtools_timeout'));
        else setTimeout(tick, 120);
      });
    };
    tick();
  });
}

function openDevtoolsTarget(port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function renderPdfViaCdp(html, executablePath) {
  const WebSocket = loadWs();
  if (!WebSocket) throw new Error('ws package required for CDP PDF render');
  if (!executablePath) throw new Error('executablePath required for CDP PDF render');

  const tmpHtml = path.join(os.tmpdir(), `lexicoil-pdf-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');
  const fileUrl = `file:///${tmpHtml.replace(/\\/g, '/')}`;

  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(
    executablePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );

  let ws;
  try {
    await waitForDevtools(port);
    const target = await openDevtoolsTarget(port);
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    let msgId = 0;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++msgId;
        const onMessage = (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.id !== id) return;
          ws.off('message', onMessage);
          if (msg.error) {
            reject(new Error(`${method}: ${msg.error.message || JSON.stringify(msg.error)}`));
          } else resolve(msg.result);
        };
        ws.on('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
      });

    await send('Page.enable');
    await send('Page.navigate', { url: fileUrl });
    await send('Runtime.enable');
    await new Promise((r) => setTimeout(r, 800));

    const printed = await send('Page.printToPDF', {
      printBackground: PDF_OPTIONS.printBackground,
      paperWidth: A4_INCHES.width,
      paperHeight: A4_INCHES.height,
      marginTop: mmToInches(PDF_OPTIONS.margin.top),
      marginBottom: mmToInches(PDF_OPTIONS.margin.bottom),
      marginLeft: mmToInches(PDF_OPTIONS.margin.left),
      marginRight: mmToInches(PDF_OPTIONS.margin.right),
      displayHeaderFooter: PDF_OPTIONS.displayHeaderFooter,
    });

    return Buffer.from(printed.data, 'base64');
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    chrome.kill('SIGKILL');
    try {
      fs.unlinkSync(tmpHtml);
    } catch (_) {}
  }
}

async function resolveLaunchConfig(opts = {}) {
  if (opts.executablePath) {
    return {
      executablePath: opts.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      headless: true,
    };
  }
  const chromium = require('@sparticuz/chromium');
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  };
}

async function renderPdfViaPuppeteer(html, opts = {}) {
  const puppeteer = loadPuppeteer();
  if (!puppeteer) return null;
  const launch = await resolveLaunchConfig(opts);
  const browser = await puppeteer.launch({
    executablePath: launch.executablePath,
    args: launch.args,
    headless: launch.headless,
    defaultViewport: launch.defaultViewport,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf(PDF_OPTIONS);
  } finally {
    await browser.close();
  }
}

/** @param {string} html @param {object} [opts] @param {string} [opts.executablePath] */
async function renderPdfFromHtml(html, opts = {}) {
  const viaPuppeteer = await renderPdfViaPuppeteer(html, opts);
  if (viaPuppeteer) return viaPuppeteer;

  const chromePath =
    opts.executablePath ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome');

  return renderPdfViaCdp(html, chromePath);
}

module.exports = {
  PDF_OPTIONS,
  renderPdfFromHtml,
};
