#!/usr/bin/env node
/**
 * M15 plan against live Netlify Blobs (same pool as production exam-part).
 * Does not hit HTTP; requires NETLIFY_* in .env.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();
process.env.NETLIFY = 'true';
process.env.POOL_SOURCE = 'blobs';

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { planPersonalModuleAssembly } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalModuleVocabPlan.js',
));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { clearAllPoolCaches } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));

const M15_SURFACES = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error('Missing NETLIFY_SITE_ID or token');
  process.exit(1);
}

const store = getStore({ name: 'lexicoil-data', siteID, token });
clearAllPoolCaches();

const lemmas = lemmatizeWords(M15_SURFACES, 'de');
const bp = loadBlueprintFileSync('goethe_B1');

const plan = await planPersonalModuleAssembly(store, 'de', 'B1', 'horen', {
  words: lemmas,
  userWords: M15_SURFACES,
  topicTag: 'Bildung',
  excludeIds: [],
  blueprint: bp,
  verifyText: true,
});

console.log(JSON.stringify({
  check: 'm15-live-blobs',
  goldenPart: 'horen-t3-gemini-027',
  plan: {
    ok: plan.ok,
    decision: plan.decision,
    reason: plan.reason,
    coveredCount: plan.coveredCount,
    textCoveredCount: plan.textCoveredCount,
    textVerified: plan.textVerified,
    picks: (plan.picks || []).map((p) => ({
      teil: p.teil,
      id: p.id,
      textMatches: p.textMatches,
      textWords: p.textWords,
    })),
  },
}, null, 2));

const pass =
  plan.ok &&
  plan.decision === 'serve_now' &&
  plan.textVerified === true &&
  (plan.picks || []).some((p) => p.id === 'horen-t3-gemini-027');
process.exit(pass ? 0 : 1);
