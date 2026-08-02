#!/usr/bin/env node
/**
 * Verify foldTopicKey / B1_TOPICS collision impact in browser after b1Topics + a2Topics load.
 * Run: npm start (or server already on :5173) && node scripts/verify-a2topics-browser-collision.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.LC_E2E_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(ROOT, 'batches/ready/gate-logs/a2topics-browser-collision-verify-2026-08-02.json');

async function serverUp() {
  try {
    const r = await fetch(BASE, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function main() {
  if (!(await serverUp())) {
    console.error('Server not running at', BASE, '— run: npm start');
    process.exit(2);
  }

  const puppeteer = (await import('puppeteer-core')).default;
  const executablePath = chromePath();
  if (!executablePath) {
    console.error('Chrome not found');
    process.exit(2);
  }

  const pageErrors = [];
  const consoleErrors = [];

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });

  const afterFirstLoad = await page.evaluate(() => {
    const b1Fold = typeof foldTopicKey === 'function' ? foldTopicKey('Freizeit') : null;
    const b1List = typeof B1_TOPICS !== 'undefined' ? B1_TOPICS : null;
    const b1NormFreizeit =
      typeof normalizeB1Topic === 'function' ? normalizeB1Topic('Freizeit') : null;
    const b1NormA2Axis =
      typeof normalizeB1Topic === 'function' ? normalizeB1Topic('Stadtleben') : null;

    return {
      hasGlobalFoldTopicKey: typeof foldTopicKey === 'function',
      hasGlobalB1Topics: typeof B1_TOPICS !== 'undefined',
      hasGlobalNormalizeB1Topic: typeof normalizeB1Topic === 'function',
      hasWindowB1Topics: typeof window.B1Topics !== 'undefined',
      hasWindowA2Topics: typeof window.A2Topics !== 'undefined',
      b1TopicsExportKeys: window.B1Topics ? Object.keys(window.B1Topics) : [],
      a2TopicsExportKeys: window.A2Topics ? Object.keys(window.A2Topics) : [],
      a2OfficialList: window.A2Topics?.A2_OFFICIAL_TOPICS || null,
      globalB1TopicsLength: Array.isArray(b1List) ? b1List.length : null,
      globalB1TopicsSample: Array.isArray(b1List) ? b1List.slice(0, 5) : null,
      foldFreizeit: b1Fold,
      normalizeB1Freizeit: b1NormFreizeit,
      normalizeB1Stadtleben: b1NormA2Axis,
      normalizeA2Freizeit:
        typeof window.A2Topics?.normalizeA2Topic === 'function'
          ? window.A2Topics.normalizeA2Topic('Freizeit')
          : '__A2Topics_MISSING__',
      normalizeA2Stadtleben:
        typeof window.A2Topics?.normalizeA2Topic === 'function'
          ? window.A2Topics.normalizeA2Topic('Stadtleben')
          : '__A2Topics_MISSING__',
      normalizeA2Technik:
        typeof window.A2Topics?.normalizeA2Topic === 'function'
          ? window.A2Topics.normalizeA2Topic('Technik')
          : '__A2Topics_MISSING__',
      personalStockA2:
        typeof PersonalTopicStock !== 'undefined' && PersonalTopicStock.buildFallbackManifest
          ? PersonalTopicStock.buildFallbackManifest('de', 'A2', 'lesen').topics.map((t) => t.topic)
          : '__PersonalTopicStock_MISSING__',
      personalStockB1:
        typeof PersonalTopicStock !== 'undefined' && PersonalTopicStock.buildFallbackManifest
          ? PersonalTopicStock.buildFallbackManifest('de', 'B1', 'lesen').topics.map((t) => t.topic)
          : null,
    };
  });

  // Explicit probe after scripts — also try loading a2Topics in isolation via fetch+eval order
  const scriptProbe = await page.evaluate(async () => {
    const res = await fetch('/js/data/a2Topics.js?v=1');
    const src = await res.text();
    const hasDestructuringLine = /const\s*\{\s*foldTopicKey/.test(src);
    let evalError = null;
    try {
      // eslint-disable-next-line no-eval
      eval(src);
    } catch (e) {
      evalError = String(e.message || e);
    }
    return {
      a2ScriptFetchOk: res.ok,
      hasDestructuringLine,
      evalError,
      a2TopicsAfterEval: typeof window.A2Topics !== 'undefined',
    };
  });

  const verdict = {
    generatedAt: new Date().toISOString(),
    pageErrors,
    consoleErrors: consoleErrors.slice(0, 10),
    afterFirstLoad,
    scriptProbe,
    analysis: {},
  };

  const a2Missing = !afterFirstLoad.hasWindowA2Topics;
  const a2PickerIsOfficialOnly =
    Array.isArray(afterFirstLoad.personalStockA2) &&
    afterFirstLoad.personalStockA2.length === 5 &&
    Array.isArray(afterFirstLoad.a2OfficialList) &&
    afterFirstLoad.personalStockA2.every((t) => afterFirstLoad.a2OfficialList.includes(t));
  const freizeitInA2PickerList =
    Array.isArray(afterFirstLoad.personalStockA2) &&
    afterFirstLoad.personalStockA2.includes('Freizeit');
  const a2ListIsB1Sized =
    afterFirstLoad.personalStockA2 &&
    Array.isArray(afterFirstLoad.personalStockA2) &&
    afterFirstLoad.personalStockB1 &&
    afterFirstLoad.personalStockA2.length === afterFirstLoad.personalStockB1.length;

  verdict.analysis = {
    a2TopicsScriptLikelyAborted: a2Missing,
    personalStockA2UsesB1List: a2Missing && a2ListIsB1Sized,
    a2PickerShowsFiveOfficialTopics: a2PickerIsOfficialOnly,
    b1TopicFreizeitInA2PickerList: freizeitInA2PickerList,
    normalizeA2FreizeitPassthrough:
      afterFirstLoad.normalizeA2Freizeit === 'Freizeit'
        ? 'expected for pool-seed B1 slugs (not picker leak)'
        : afterFirstLoad.normalizeA2Freizeit,
    globalFoldTopicKeyIsB1Version:
      afterFirstLoad.hasGlobalFoldTopicKey &&
      afterFirstLoad.foldFreizeit === 'freizeit' &&
      afterFirstLoad.normalizeB1Freizeit === 'Freizeit',
  };

  if (a2Missing) {
    verdict.analysis.functionalImpact =
      'CRITICAL: a2Topics.js no ejecuta → window.A2Topics ausente. Consumidores con fallback pueden ver lista B1 o sin filtro A2.';
  } else if (freizeitInA2PickerList || !a2PickerIsOfficialOnly) {
    verdict.analysis.functionalImpact =
      'HIGH: personal stock / picker A2 no acota a 5 ejes oficiales.';
  } else {
    verdict.analysis.functionalImpact =
      'RESOLVED: A2Topics registrado; picker A2 = 5 ejes oficiales; B1 globals intactos.';
  }

  verdict.analysis.recommendedPriority =
    a2Missing || freizeitInA2PickerList || !a2PickerIsOfficialOnly
      ? 'HIGH (same class as server A2/B1 fix)'
      : 'LOW (fixed)';

  fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  console.log('\nWrote', OUT);

  await browser.close();
  process.exit(a2Missing || freizeitInA2PickerList || !a2PickerIsOfficialOnly ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
