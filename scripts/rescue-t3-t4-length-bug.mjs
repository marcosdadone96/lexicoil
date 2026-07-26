#!/usr/bin/env node
/**
 * Rescata batches Lesen T3/T4 rechazados por bug de wordCount concatenado (CefrGate fix).
 * Re-valida ingest + poolReady gates; promueve a pool-verified/B1/ los que pasan.
 *
 *   node scripts/rescue-t3-t4-length-bug.mjs --dry-run
 *   node scripts/rescue-t3-t4-length-bug.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { validateLesenBatch } from './lib/pasteLesenBatchLib.mjs';
import { poolReadyCheckWithRepair, resetPoolReadyCaches } from './lib/poolReadyCheck.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { writePoolVerified, stripPoolRejectMeta } from './lib/finalizePoolReady.mjs';
import { poolVerifiedDir, needsRegenerationDir } from './lib/batchPaths.mjs';
import { inferTeilFromBatch } from './lib/extractJson.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));
const { batchToCandidates, miniExamFromCandidate } = await import('./pipeline/lib/candidateBuilder.mjs');
const { resolveBlueprint, validateCandidate } = await import('./pipeline/lib/validateCandidate.mjs');

const bp = resolveBlueprint('de', 'B1');
const LEVEL = 'B1';
const SCAN_DIRS = [
  path.join(ROOT, 'batches/rejected'),
  path.join(ROOT, 'batches/needs-regeneration/B1'),
  path.join(ROOT, 'batches/ready/pool-verified/B1'),
  path.join(ROOT, 'batches/generated/B1'),
];

function parseArgs(argv) {
  const opts = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

function listLesenT3T4Files() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      if (!/^lesen-t[34]/i.test(f) && !/(lesen-t3|lesen-t4)/i.test(f)) continue;
      out.push(path.join(dir, f));
    }
  }
  return [...new Set(out)].sort();
}

function hadOldLengthBug(batch) {
  try {
    const teil = batch.questions?.[0]?.teil ?? inferTeilFromBatch(batch);
    if (teil !== 3 && teil !== 4) return false;
    const c = batchToCandidates(batch, {
      lang: 'de',
      level: LEVEL,
      blueprint: bp,
      batchId: 'scan',
    })[0];
    if (!c) return false;
    const part = miniExamFromCandidate(c).lesenParts?.[0];
    if (!part) return false;
    if (teil === 3 && part.ads?.length) {
      return CefrGate.wordCount(part.ads.map((a) => a.text).join(' ')) > 60;
    }
    if (teil === 4) {
      const blob = [part.text, ...(part.items || []).map((i) => i.signText)].filter(Boolean).join(' ');
      return CefrGate.wordCount(blob) > 90;
    }
  } catch {
    return false;
  }
  return false;
}

function canonicalBasename(absPath, batch) {
  const base = path.basename(absPath);
  const m = base.match(/(lesen-t[34]-[a-z0-9-]+\.json)$/i);
  if (m) return m[1];
  const teil = batch.questions?.[0]?.teil ?? inferTeilFromBatch(batch);
  return `lesen-t${teil}-rescued-${Date.now()}.json`;
}

async function assessFile(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    return { rel, absPath, ok: false, stage: 'parse', reasons: [err.message] };
  }

  if (!hadOldLengthBug(batch)) {
    return { rel, absPath, ok: false, stage: 'not_length_candidate', reasons: ['no_old_concat_length_pattern'] };
  }

  const teil = inferTeilFromBatch(batch) ?? batch.questions?.[0]?.teil;
  const validateArgs = {
    lang: 'de',
    level: LEVEL,
    skipQuality: false,
    skipIngest: false,
    allowBankDup: true,
  };

  const fmt = validateLesenBatch(batch, validateArgs, {
    teil,
    label: path.basename(absPath),
  });
  if (!fmt.ok) {
    return {
      rel,
      absPath,
      teil,
      ok: false,
      stage: 'validateLesenBatch',
      reasons: fmt.errors || ['validateLesenBatch failed'],
    };
  }

  const enriched = enrichBatchMetadata(batch).batch;
  const pool = await poolReadyCheckWithRepair(enriched, {
    file: path.basename(absPath),
    level: LEVEL,
    q2Llm: false,
  });

  if (pool.verdict !== 'READY') {
    return {
      rel,
      absPath,
      teil,
      ok: false,
      stage: 'poolReady',
      reasons: pool.rejectReasons || pool.reasons || [pool.verdict],
    };
  }

  return {
    rel,
    absPath,
    teil,
    ok: true,
    stage: 'READY',
    batch: stripPoolRejectMeta(pool.batch || enriched),
    basename: canonicalBasename(absPath, batch),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  resetPoolReadyCaches();

  const files = listLesenT3T4Files();
  const candidates = [];
  for (const f of files) {
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    if (hadOldLengthBug(batch)) candidates.push(f);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    scannedFiles: files.length,
    lengthBugCandidates: candidates.length,
    rescued: [],
    genuineBad: [],
    alreadyVerified: [],
  };

  const promotedBasenames = new Set();

  for (const absPath of candidates) {
    const result = await assessFile(absPath);
    if (!result.ok) {
      report.genuineBad.push({
        file: result.rel,
        teil: result.teil,
        stage: result.stage,
        reasons: (result.reasons || []).slice(0, 5),
      });
      continue;
    }

    const destName = result.basename;
    const destPath = path.join(poolVerifiedDir(LEVEL), destName);
    const alreadyThere =
      absPath.replace(/\\/g, '/').includes('pool-verified/B1/') &&
      path.basename(absPath) === destName;

    if (promotedBasenames.has(destName)) {
      report.genuineBad.push({
        file: result.rel,
        teil: result.teil,
        stage: 'duplicate_basename',
        reasons: [`duplicate of ${destName}`],
      });
      continue;
    }

    if (alreadyThere && fs.existsSync(destPath)) {
      report.alreadyVerified.push({ file: result.rel, teil: result.teil });
      promotedBasenames.add(destName);
      report.rescued.push({ file: result.rel, dest: destName, action: 'already_in_pool_verified' });
      continue;
    }

    if (!opts.dryRun) {
      writePoolVerified(destName, result.batch, LEVEL);
      promotedBasenames.add(destName);
      if (!alreadyThere && absPath.includes('rejected')) {
        try {
          fs.unlinkSync(absPath);
        } catch {
          /* keep rejected copy if locked */
        }
      }
    }

    report.rescued.push({
      file: result.rel,
      dest: destName,
      teil: result.teil,
      action: opts.dryRun ? 'would_promote' : 'promoted',
    });
  }

  report.summary = {
    rescued: report.rescued.length,
    genuineBad: report.genuineBad.length,
    alreadyVerified: report.alreadyVerified.length,
    byTeil: {
      t3: report.rescued.filter((r) => /t3/i.test(r.dest || r.file)).length,
      t4: report.rescued.filter((r) => /t4/i.test(r.dest || r.file)).length,
    },
    badByStage: report.genuineBad.reduce((acc, row) => {
      acc[row.stage] = (acc[row.stage] || 0) + 1;
      return acc;
    }, {}),
  };

  const outPath = path.join(ROOT, 'batches/ready/gate-logs/rescue-t3-t4-length-bug.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
