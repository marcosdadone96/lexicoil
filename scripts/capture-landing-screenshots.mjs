#!/usr/bin/env node
/**
 * Renders landing/public/capture/*.html (post-refactor UI reference) to PNG screenshots.
 * Run: npx playwright install chromium && node scripts/capture-landing-screenshots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureDir = path.join(root, 'landing/public/capture');
const outDir = path.join(root, 'landing/public/screenshots');

if (!fs.existsSync(captureDir)) {
  console.error('Missing capture dir:', captureDir);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Install playwright: npx playwright install chromium');
  process.exit(1);
}

const shots = [
  {
    file: 'dashboard.html',
    out: 'dashboard.png',
    viewport: { width: 1280, height: 860 },
    clip: { x: 0, y: 0, width: 1280, height: 720 },
  },
  {
    file: 'workspace.html',
    out: 'workspace.png',
    viewport: { width: 1120, height: 900 },
    clip: { x: 0, y: 0, width: 1120, height: 780 },
  },
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: shot.viewport });
  const url = 'file:///' + path.join(captureDir, shot.file).replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, shot.out),
    clip: shot.clip,
    type: 'png',
  });
  console.log('OK:', shot.out);
}
await browser.close();
console.log('Screenshots saved to landing/public/screenshots/');
