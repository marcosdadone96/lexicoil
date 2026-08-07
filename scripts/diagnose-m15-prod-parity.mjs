#!/usr/bin/env node
/**
 * M15 root-cause diagnostics — local seed vs production-like blobs-only runtime.
 * Run: node scripts/diagnose-m15-prod-parity.mjs
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  planPersonalModuleAssembly,
  listTeilCandidates,
} = require(path.join(ROOT, 'netlify/functions/lib/personalModuleVocabPlan.js'));
const { lemmatizeWords } = require(path.join(ROOT, 'netlify/functions/lib/passageVocab.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { scorePersonalPartTextMatches } = require(path.join(
  ROOT,
  'netlify/functions/lib/personalPartTextMatches.js',
));
const { loadModuleSearchRows, resolveRowPart } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSearchCache.js',
));
const { useLocalSeedInRuntime } = require(path.join(
  ROOT,
  'netlify/functions/lib/poolSourceMode.js',
));

const M15_SURFACES = ['Prüfung', 'Lernen', 'Urlaub', 'Bahn', 'Digital', 'Passwort', 'Stress'];
const GOLDEN_PART = 'horen-t3-gemini-027';
const SEED_REL = 'library/reusable-seed/de_B1.json';

const emptyStore = {
  async get() {
    return null;
  },
  async setJSON() {},
  async delete() {},
  async list() {
    return { blobs: [] };
  },
};

function seedStats() {
  const abs = path.join(ROOT, SEED_REL);
  const buf = fs.readFileSync(abs);
  const hash = createHash('sha256').update(buf).digest('hex');
  const data = JSON.parse(buf.toString('utf8'));
  const records = Array.isArray(data.records) ? data.records : [];
  const servable = records.filter(
    (r) =>
      r.complete &&
      r.verified &&
      !r.disabled &&
      (r.sem1VerifiedAt || r.sem1Skipped),
  );
  const horen = servable.filter((r) => String(r.module).toLowerCase() === 'horen');
  const golden = records.find((r) => r.id === GOLDEN_PART);
  return {
    path: SEED_REL,
    bytes: buf.length,
    sha256: hash,
    mtime: fs.statSync(abs).mtime.toISOString(),
    recordsTotal: records.length,
    servableTotal: servable.length,
    servableHoren: horen.length,
    goldenPart: golden
      ? {
          id: golden.id,
          teil: golden.teil,
          topicTag: golden.topicTag,
          sourceFile: golden.sourceFile,
          hasPart: !!golden.part || !!golden.questions,
        }
      : null,
  };
}

async function perTeilBreakdown(store, label) {
  const lemmas = lemmatizeWords(M15_SURFACES, 'de');
  const bp = loadBlueprintFileSync('goethe_B1');
  const teils = [1, 2, 3, 4];
  const out = { label, useLocalSeed: useLocalSeedInRuntime(), teils: {} };

  const { rows } = await loadModuleSearchRows(store, 'de', 'B1', 'horen');
  out.moduleRowCount = rows.length;

  for (const teil of teils) {
    const { candidates, topicRelaxedPool } = await listTeilCandidates(store, 'de', 'B1', 'horen', teil, {
      words: lemmas,
      userWords: M15_SURFACES,
      topicTag: 'Bildung',
      excludeIds: [],
      assembleMode: 'practice',
      strictTopic: true,
    });
    const top = [];
    for (const c of candidates.slice(0, 5)) {
      const row = rows.find((r) => r.id === c.id);
      let textMatches = null;
      let textError = null;
      if (row) {
        const part = await resolveRowPart(store, row);
        if (part) {
          const hit = scorePersonalPartTextMatches(part, M15_SURFACES, { lang: 'de', level: 'B1' });
          textMatches = { count: hit.count, words: hit.words };
        } else textError = 'part_load_failed';
      } else textError = 'row_not_found';
      top.push({
        id: c.id,
        indexScore: c.score,
        indexCovered: c.covered,
        topicTag: c.topicTag,
        textMatches,
        textError,
        isGolden: c.id === GOLDEN_PART,
      });
    }
    out.teils[teil] = {
      topicRelaxedPool,
      candidateCount: candidates.length,
      top,
    };
  }

  const plan = await planPersonalModuleAssembly(store, 'de', 'B1', 'horen', {
    words: lemmas,
    userWords: M15_SURFACES,
    topicTag: 'Bildung',
    excludeIds: [],
    blueprint: bp,
    verifyText: true,
  });

  out.plan = {
    ok: plan.ok,
    reason: plan.reason,
    coveredCount: plan.coveredCount,
    textCoveredCount: plan.textCoveredCount,
    decision: plan.decision,
    textVerified: plan.textVerified,
    picks: (plan.picks || []).map((p) => ({
      teil: p.teil,
      id: p.id,
      indexMatches: p.indexMatches ?? p.covered?.length,
      textMatches: p.textMatches,
      textWords: p.textWords,
      textError: p.textError,
    })),
  };
  return out;
}

console.log('=== 1) Local seed file (sim uses this) ===');
console.log(JSON.stringify(seedStats(), null, 2));

console.log('\n=== 2) Runtime pool source flags ===');
console.log(
  JSON.stringify(
    {
      defaultLocalNode: useLocalSeedInRuntime(),
      productionLambda: 'NETLIFY=true → useLocalSeedInRuntime() === false',
      examPartBundleIncludesReusableSeed: false,
      note: 'exam-part netlify.toml included_files has NO library/reusable-seed/**',
      prodPoolSource: 'Netlify Blobs prefix reusable_part_idx:de:B1:horen:* only',
    },
    null,
    2,
  ),
);

console.log('\n=== 3) M15 plan — local dev (seed JSON on disk) ===');
const localBreakdown = await perTeilBreakdown(emptyStore, 'local-node-default');
console.log(JSON.stringify(localBreakdown, null, 2));

console.log('\n=== 4) M15 plan — production-like (blobs only, empty store) ===');
process.env.NETLIFY = 'true';
process.env.POOL_SOURCE = 'blobs';
const { clearAllPoolCaches } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
clearAllPoolCaches();
const prodLike = await perTeilBreakdown(emptyStore, 'lambda-blobs-empty');
console.log(JSON.stringify(prodLike, null, 2));

console.log('\n=== Conclusion ===');
if (prodLike.plan.coveredCount === 0 && localBreakdown.plan.ok) {
  console.log(
    'REPRODUCED: coveredCount:0 when seed is not loaded (prod runtime) while local seed gives serve_now.',
  );
  console.log('Fix infra: sync library/reusable-seed/de_B1.json → Netlify Blobs (push-seed-to-blobs.mjs).');
}
