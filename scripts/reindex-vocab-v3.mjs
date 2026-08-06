/**
 * reindex-vocab-v3.mjs — PASO 13 P0-5: reindex existing content to vocabIndex v3-quality.
 *
 * Rebuilds vocabIndex / vocabIndexVersion only. Does not regenerate content,
 * touch prompts, quality gates, feedback, corrections, or UI.
 *
 * Layers: pool-verified, seed (reusable-seed), blobs (reusable-parts).
 * Published mocks are NOT written here — refresh via habitual publish/sync.
 *
 * Mandatory mode (exactly one):
 *   --dry-run   report only, no writes
 *   --confirm   write updates (skips parts already on v3-quality)
 *
 *   node scripts/reindex-vocab-v3.mjs --dry-run --lang de --level B1
 *   node scripts/reindex-vocab-v3.mjs --confirm --lang de --level B1
 *   node scripts/reindex-vocab-v3.mjs --confirm --layers seed,pool-verified
 *   NETLIFY_SITE_ID=... NETLIFY_API_TOKEN=... node scripts/reindex-vocab-v3.mjs --confirm --layers blobs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  VOCAB_INDEX_VERSION,
  reindexPartVocab,
  asIndexablePart,
  emptyReport,
  accumulateDiff,
  verifySamplePart,
  pickRandomSamples,
  runMandatoryVerification,
  isAlreadyV3,
} from './lib/reindexVocabV3.mjs';

const require = createRequire(import.meta.url);
loadEnvFile();

const { STORE_NAME } = require(path.join(ROOT, 'netlify/functions/lib/blobStore.js'));
const { listPartsIndex } = require(
  path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'),
);

const MODULES = ['lesen', 'horen', 'schreiben', 'sprechen'];
const WRITE_TIMEOUT_MS = Number(process.env.REUSABLE_WRITE_TIMEOUT_MS || 20000);
const POOL_DIR = path.join(ROOT, 'batches/ready/pool-verified');
const SEED_DIR = path.join(ROOT, 'library/reusable-seed');
const REPORT_PATH = path.join(ROOT, 'batches/generated/vocab-reindex-v3-report.json');

function parseArgs(argv) {
  const o = {
    lang: 'de',
    level: 'B1',
    dryRun: false,
    confirm: false,
    layers: ['pool-verified', 'seed', 'blobs'],
    sample: 5,
    skipBlobsIfNoCreds: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--confirm') o.confirm = true;
    else if (a === '--lang') o.lang = String(argv[++i]).toLowerCase();
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--layers') {
      o.layers = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--sample') o.sample = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function usage() {
  console.log(`Usage:
  node scripts/reindex-vocab-v3.mjs --dry-run [--lang de] [--level B1] [--layers pool-verified,seed,blobs]
  node scripts/reindex-vocab-v3.mjs --confirm [--lang de] [--level B1] [--layers ...]

Exactly one of --dry-run or --confirm is required.
Parts already on ${VOCAB_INDEX_VERSION} are skipped (file not rewritten).
Published is never written by this script.`);
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(file, '.json');
  const dest = path.join(dir, `${base}.pre-v3-reindex.${stamp}.json`);
  fs.copyFileSync(file, dest);
  return dest;
}

function getStoreForCli() {
  const { getStore } = require('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
  return getStore(STORE_NAME);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function recordResult(report, layer, result, write) {
  const L = report.byLayer[layer];
  report.total++;
  L.total++;
  if (result.skipped && result.reason === 'already_v3') {
    report.alreadyV3++;
    L.alreadyV3++;
    return;
  }
  if (result.skipped) {
    report.skipped++;
    L.skipped++;
    return;
  }
  accumulateDiff(report, result.diff);
  if (write) {
    report.updated++;
    L.updated++;
  } else {
    report.wouldUpdate++;
    L.updated++; // dry-run: count intended updates in layer.updated
  }
}

function reindexPoolVerified(opts, report, samplesOut) {
  if (!fs.existsSync(POOL_DIR)) {
    report.errors.push({ layer: 'pool-verified', error: 'directory missing' });
    return;
  }
  const files = fs.readdirSync(POOL_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const full = path.join(POOL_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      const part = asIndexablePart(data, { lang: opts.lang, level: opts.level });
      if (!part) {
        report.skipped++;
        report.byLayer['pool-verified'].skipped++;
        continue;
      }
      if (!opts.confirm && isAlreadyV3(part)) {
        recordResult(report, 'pool-verified', { skipped: true, reason: 'already_v3' }, false);
        samplesOut.push({ layer: 'pool-verified', file, part });
        continue;
      }
      // Work on a clone for dry-run so we don't mutate accidentally before write
      const working = opts.confirm ? part : structuredClone(part);
      const result = reindexPartVocab(working, { lang: opts.lang, level: opts.level });
      recordResult(report, 'pool-verified', result, opts.confirm);

      if (opts.confirm && !result.skipped && result.changed) {
        // Copy vocab fields onto original data root
        data.vocabIndex = working.vocabIndex;
        data.vocabIndexVersion = working.vocabIndexVersion;
        if (working.id && !data.id) data.id = working.id;
        if (working.lang && !data.lang) data.lang = working.lang;
        if (working.level && !data.level) data.level = working.level;
        fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
        samplesOut.push({ layer: 'pool-verified', file, part: data });
      } else if (!result.skipped) {
        samplesOut.push({ layer: 'pool-verified', file, part: working });
      } else {
        samplesOut.push({ layer: 'pool-verified', file, part });
      }
    } catch (err) {
      report.errors.push({ layer: 'pool-verified', file, error: err.message });
      report.byLayer['pool-verified'].errors++;
    }
  }
}

function reindexSeed(opts, report, samplesOut) {
  const files = [
    path.join(SEED_DIR, `${opts.lang}_${opts.level}.json`),
    path.join(SEED_DIR, `${opts.lang}_${opts.level}.bank.json`),
  ].filter((f) => fs.existsSync(f));

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(data.records) ? data.records : [];
      let fileNeedsWrite = false;

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        try {
          if (!opts.confirm && isAlreadyV3(rec)) {
            recordResult(report, 'seed', { skipped: true, reason: 'already_v3' }, false);
            samplesOut.push({ layer: 'seed', file: path.basename(file), part: rec });
            continue;
          }
          const working = opts.confirm ? rec : structuredClone(rec);
          const result = reindexPartVocab(working, { lang: opts.lang, level: opts.level });
          recordResult(report, 'seed', result, opts.confirm);
          if (opts.confirm && !result.skipped && result.changed) {
            fileNeedsWrite = true;
            samplesOut.push({ layer: 'seed', file: path.basename(file), part: rec });
          } else if (!result.skipped) {
            samplesOut.push({ layer: 'seed', file: path.basename(file), part: working });
          } else {
            samplesOut.push({ layer: 'seed', file: path.basename(file), part: rec });
          }
        } catch (err) {
          report.errors.push({
            layer: 'seed',
            file: path.basename(file),
            id: rec?.id,
            error: err.message,
          });
          report.byLayer.seed.errors++;
        }
      }

      if (opts.confirm && fileNeedsWrite) {
        const backup = backupFile(file);
        fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
        console.log(`  ✓ seed wrote ${path.relative(ROOT, file)} (backup: ${backup ? path.relative(ROOT, backup) : 'n/a'})`);
      }
    } catch (err) {
      report.errors.push({ layer: 'seed', file: path.basename(file), error: err.message });
      report.byLayer.seed.errors++;
    }
  }
}

async function reindexBlobs(opts, report, samplesOut) {
  let store;
  try {
    store = getStoreForCli();
  } catch (err) {
    const msg = `blobs store unavailable: ${err.message}`;
    if (opts.skipBlobsIfNoCreds && !opts.confirm) {
      report.byLayer.blobs.note = msg;
      console.warn(`[blobs] ${msg} — skipped`);
      return;
    }
    report.errors.push({ layer: 'blobs', error: msg });
    report.byLayer.blobs.errors++;
    return;
  }

  for (const module of MODULES) {
    let index;
    try {
      index = await listPartsIndex(store, opts.lang, opts.level, module);
    } catch (err) {
      report.errors.push({ layer: 'blobs', module, error: err.message });
      report.byLayer.blobs.errors++;
      continue;
    }
    for (const row of index) {
      try {
        const part = await store.get(row.partKey, { type: 'json' });
        if (!part) {
          report.skipped++;
          report.byLayer.blobs.skipped++;
          continue;
        }
        if (isAlreadyV3(part) && !opts.confirm) {
          // dry-run skip path
        }
        if (isAlreadyV3(part)) {
          recordResult(report, 'blobs', { skipped: true, reason: 'already_v3' }, false);
          samplesOut.push({ layer: 'blobs', id: part.id, part });
          continue;
        }
        const working = opts.confirm ? part : structuredClone(part);
        const result = reindexPartVocab(working, { lang: opts.lang, level: opts.level });
        recordResult(report, 'blobs', result, opts.confirm);
        if (opts.confirm && !result.skipped && result.changed) {
          await withTimeout(store.setJSON(row.partKey, working), WRITE_TIMEOUT_MS, row.id);
          samplesOut.push({ layer: 'blobs', id: working.id, part: working });
        } else if (!result.skipped) {
          samplesOut.push({ layer: 'blobs', id: working.id, part: working });
        }
      } catch (err) {
        report.errors.push({ layer: 'blobs', id: row.id, error: err.message });
        report.byLayer.blobs.errors++;
      }
    }
  }
}

function printReport(report) {
  console.log('\n════════ vocabIndex v3-quality reindex report ════════');
  console.log(`mode:              ${report.mode}`);
  console.log(`targetVersion:     ${report.targetVersion}`);
  console.log(`elapsedMs:         ${report.elapsedMs}`);
  console.log(`total parts:       ${report.total}`);
  console.log(`already v3:        ${report.alreadyV3}`);
  console.log(`updated:           ${report.updated}`);
  console.log(`wouldUpdate:       ${report.wouldUpdate}`);
  console.log(`skipped (other):   ${report.skipped}`);
  console.log(`old versions:      ${JSON.stringify(report.oldVersions)}`);
  console.log(`concepts (sum):    ${report.concepts}`);
  console.log(`aliases (sum):     ${report.aliases}`);
  console.log(`noise removed:     ${report.noiseRemoved}`);
  console.log(`typos removed:     ${report.typosRemoved}`);
  console.log(`concepts merged:   ${report.conceptsMerged}`);
  console.log(`errors:            ${report.errors.length}`);
  for (const [layer, s] of Object.entries(report.byLayer)) {
    console.log(
      `  [${layer}] total=${s.total} updated=${s.updated} alreadyV3=${s.alreadyV3} skipped=${s.skipped} errors=${s.errors}${s.note ? ` — ${s.note}` : ''}`,
    );
  }
  if (report.errors.length) {
    console.log('\n── errors (first 20) ──');
    for (const e of report.errors.slice(0, 20)) {
      console.log(`  ${JSON.stringify(e)}`);
    }
  }
  console.log('\n── verification samples ──');
  for (const v of report.verification) {
    const mark = v.ok ? 'OK' : 'FAIL';
    console.log(`  [${mark}] ${v.label} id=${v.id} version=${v.version} size=${v.indexSize}`);
    for (const c of v.checks) {
      console.log(`      ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    }
  }
  console.log(`\nReport file: ${path.relative(ROOT, REPORT_PATH)}`);
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (opts.dryRun === opts.confirm) {
    console.error('ERROR: specify exactly one of --dry-run or --confirm');
    usage();
    process.exit(2);
  }
  if (opts.layers.includes('published')) {
    console.warn('[published] layer ignored for writes — use habitual publish/sync after reindex.');
  }

  const t0 = Date.now();
  const report = emptyReport();
  report.mode = opts.confirm ? 'confirm' : 'dry-run';
  report.generatedAt = new Date().toISOString();

  console.log(
    `Reindex vocab → ${VOCAB_INDEX_VERSION} — ${report.mode} — ${opts.lang}_${opts.level} — layers: ${opts.layers.join(',')}`,
  );

  const samplesOut = [];

  if (opts.layers.includes('pool-verified')) {
    console.log('\n── pool-verified ──');
    reindexPoolVerified(opts, report, samplesOut);
  }
  if (opts.layers.includes('seed')) {
    console.log('\n── seed ──');
    reindexSeed(opts, report, samplesOut);
  }
  if (opts.layers.includes('blobs')) {
    console.log('\n── blobs ──');
    const hasCreds = !!(process.env.NETLIFY_SITE_ID
      && (process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN));
    if (!hasCreds && opts.confirm) {
      report.errors.push({
        layer: 'blobs',
        error: 'NETLIFY_SITE_ID + NETLIFY_API_TOKEN required for --confirm on blobs',
      });
      report.byLayer.blobs.errors++;
      console.warn('[blobs] missing credentials — not written');
    } else if (!hasCreds) {
      report.byLayer.blobs.note = 'skipped dry-run without NETLIFY credentials';
      console.warn('[blobs] omitido — define NETLIFY_SITE_ID + NETLIFY_API_TOKEN');
    } else {
      await reindexBlobs(opts, report, samplesOut);
    }
  }

  const mandatory = runMandatoryVerification();
  const preferred = samplesOut.filter(({ part }) => {
    const b = JSON.stringify(part || {}).toLowerCase();
    return /verzicht|mitmach|anmeld|wochenend|wochentag/.test(b);
  });
  const pool = preferred.length >= opts.sample ? preferred : samplesOut;
  const picked = pickRandomSamples(pool, opts.sample);
  const randomChecks = picked.map(({ layer, file, id, part }, i) =>
    verifySamplePart(part, `random:${layer}:${file || id || i}`));
  report.verification = [...mandatory, ...randomChecks];

  report.elapsedMs = Date.now() - t0;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  printReport(report);

  const verifyFail = report.verification.some((v) => !v.ok);
  if (report.errors.length || verifyFail) process.exit(1);
})().catch((err) => {
  console.error('ERROR:', err?.stack || err?.message || err);
  process.exit(1);
});
