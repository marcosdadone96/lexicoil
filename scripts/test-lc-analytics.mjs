#!/usr/bin/env node
/** GA config singleton + LcAnalytics consent gate (no browser). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const analyticsConfig = require(path.join(ROOT, 'js/ui/consent/analyticsConfig.js'));
assert.equal(analyticsConfig.GA_MEASUREMENT_ID, 'G-RTQJVSZBKC', 'GA id centralized');

const gaSrc = fs.readFileSync(path.join(ROOT, 'js/ui/consent/googleAnalytics.js'), 'utf8');
assert.match(gaSrc, /LC_ANALYTICS/, 'googleAnalytics reads LC_ANALYTICS');

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(indexHtml, /analyticsConfig\.js/, 'app loads analyticsConfig');
assert.match(indexHtml, /lcAnalytics\.js/, 'app loads lcAnalytics');

const landingLayout = fs.readFileSync(path.join(ROOT, 'landing/src/app/layout.tsx'), 'utf8');
assert.match(landingLayout, /analyticsConfig\.js/, 'landing loads analyticsConfig');

function loadLcAnalytics(consentState) {
  const gtagCalls = [];
  const sandbox = {
    window: {
      lcConsent: {
        granted(cat) {
          if (cat === 'analytics') return !!consentState?.analytics;
          return true;
        },
      },
      gtag: (...args) => {
        gtagCalls.push(args);
      },
    },
    SubjectMeta: {
      get(lang) {
        return { board: lang === 'en' ? 'Cambridge English' : 'Goethe-Institut' };
      },
    },
    module: { exports: {} },
  };
  sandbox.window.LcAnalytics = sandbox.window;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/analytics/lcAnalytics.js'), 'utf8'), sandbox);
  return { LcAnalytics: sandbox.window.LcAnalytics, gtagCalls };
}

{
  const { LcAnalytics, gtagCalls } = loadLcAnalytics({ analytics: false });
  LcAnalytics.trackExamStarted('de', 'B1');
  LcAnalytics.trackSignUp();
  assert.equal(gtagCalls.length, 0, 'no gtag when analytics consent denied');
}

{
  const { LcAnalytics, gtagCalls } = loadLcAnalytics({ analytics: true });
  LcAnalytics.trackExamStarted('de', 'B1');
  assert.equal(gtagCalls.length, 1, 'gtag fires with consent');
  assert.equal(gtagCalls[0][0], 'event');
  assert.equal(gtagCalls[0][1], 'exam_started');
  assert.equal(gtagCalls[0][2].level, 'B1');
  assert.equal(gtagCalls[0][2].board, 'Goethe-Institut');
  assert.ok(!('email' in (gtagCalls[0][2] || {})), 'no PII in params');
}

function loadGoogleAnalytics(consentState) {
  const scripts = [];
  const sandbox = {
    window: {
      LC_ANALYTICS: { GA_MEASUREMENT_ID: 'G-RTQJVSZBKC' },
      dataLayer: [],
      lcConsent: {
        granted(cat) {
          if (cat === 'analytics') return !!consentState?.analytics;
          return true;
        },
        whenGranted(cat, fn) {
          if (cat === 'analytics' && consentState?.analytics && typeof fn === 'function') fn();
        },
        onReady(fn) {
          if (typeof fn === 'function') fn(consentState);
        },
      },
      document: {
        readyState: 'complete',
        head: { appendChild(el) { scripts.push(el); } },
        addEventListener() {},
        createElement(tag) {
          return { async: false, src: '', onload: null, tagName: tag };
        },
      },
    },
    document: null,
  };
  sandbox.window.document = sandbox.window.document;
  sandbox.document = sandbox.window.document;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/ui/consent/googleAnalytics.js'), 'utf8'), sandbox);
  return { scripts, window: sandbox.window };
}

{
  const { scripts } = loadGoogleAnalytics({ analytics: false });
  assert.equal(scripts.length, 0, 'gtag.js not injected without analytics consent');
}

{
  const { scripts } = loadGoogleAnalytics({ analytics: true });
  assert.equal(scripts.length, 1, 'gtag.js injected after analytics consent');
  assert.match(String(scripts[0].src), /G-RTQJVSZBKC/, 'loads configured measurement id');
}

console.log('OK   analytics config + consent-gated events');
