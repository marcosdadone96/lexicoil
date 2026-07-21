#!/usr/bin/env node
/**
 * Audit + publish all pool-verified batches to reusable-seed (de_B1.json).
 * Lesen: publish-lesen-generated path. Hören/Schreiben/Sprechen: publish-exam-generated path.
 *
 *   node scripts/publish-pool-verified-to-seed-2026-07-15.mjs           # audit only
 *   node scripts/publish-pool-verified-to-seed-2026-07-15.mjs --publish
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { validateExamBatch } from './lib/pasteExamBatchLib.mjs';
import { validateLesenBatch } from './lib/pasteLesenBatchLib.mjs';
import { inferTeilFromBatch } from './lib/extractJson.mjs';
import {
  buildExamSeedRecordFromBatch,
  buildLesenSeedRecordFromBatch,
  publishExamBatchToPool,
  publishLesenBatchToPool,
} from './lib/publishToPool.mjs';
import {
  poolVerifiedDir,
  listJsonInStagingRoot,
  inferBatchLevel,
  normalizeLevel,
  seedPoolPath,
  POOL_VERIFIED_DIR,
} from './lib/batchPaths.mjs';

const require = createRequire(import.meta.url);
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

loadEnvFile();

function parseLevelArg() {
  const idx = process.argv.indexOf('--level');
  return normalizeLevel(idx >= 0 ? process.argv[idx + 1] : 'B1');
}

const TARGET_LEVEL = parseLevelArg();
const POOL_DIR = poolVerifiedDir(TARGET_LEVEL);
const SEED_FILE = seedPoolPath('de', TARGET_LEVEL);
const BACKUP_DIR = path.join(ROOT, 'library/reusable-seed/backups');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/publish-pool-verified-2026-07-15.json');

const doPublish = process.argv.includes('--publish');
const quiet = process.argv.includes('--quiet');

function shortHash(s) {
  return createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
}

function contentFingerprint(batch, teil) {
  const mod = String(batch.module || 'lesen').toLowerCase();
  const qs = (batch.questions || []).filter((q) => !teil || Number(q.teil) === teil);
  const ps = batch.passages || [];
  return JSON.stringify({ mod, teil, qs, ps });
}

function inferFromFilename(relFile) {
  const base = path.basename(relFile);
  if (/^lesen-t(\d+)/i.test(base)) {
    return { module: 'lesen', teil: Number(base.match(/^lesen-t(\d+)/i)[1]) };
  }
  if (/^horen-t(\d+)/i.test(base)) {
    return { module: 'horen', teil: Number(base.match(/^horen-t(\d+)/i)[1]) };
  }
  if (base.startsWith('schreiben')) return { module: 'schreiben', teil: null };
  if (base.startsWith('sprechen')) return { module: 'sprechen', teil: null };
  return { module: null, teil: null };
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
}

function seedIndex(pool) {
  const bySource = new Map();
  const byBasename = new Map();
  const byHash = new Map();
  for (const r of pool.records || []) {
    const sf = String(r.sourceFile || '').replace(/\\/g, '/');
    if (sf) {
      bySource.set(sf, r);
      byBasename.set(path.basename(sf), r);
    }
    const h = shortHash(contentFingerprint(r, r.teil));
    byHash.set(`${r.module}:T${r.teil}:${h}`, r);
  }
  return { bySource, byBasename, byHash };
}

function classifyAlreadyInSeed(relFile, batch, idx, hint) {
  const norm = relFile.replace(/\\/g, '/');
  if (idx.bySource.has(norm)) {
    return { inSeed: true, reason: 'sourceFile_exact', recordId: idx.bySource.get(norm).id };
  }
  const base = path.basename(norm);
  if (idx.byBasename.has(base)) {
    return { inSeed: true, reason: 'basename_match', recordId: idx.byBasename.get(base).id };
  }
  const mod = hint.module || String(batch.module || 'lesen').toLowerCase();
  const teil = Number(hint.teil ?? inferTeilFromBatch(batch) ?? batch.questions?.[0]?.teil ?? 1);
  const h = shortHash(contentFingerprint(batch, teil));
  const key = `${mod}:T${teil}:${h}`;
  if (idx.byHash.has(key)) {
    return { inSeed: true, reason: 'content_hash', recordId: idx.byHash.get(key).id };
  }
  return { inSeed: false };
}

async function validateBatchForPublish(batch, relFile, args) {
  const hint = inferFromFilename(relFile);
  const lv = normalizeLevel(inferBatchLevel(batch) || args.level || TARGET_LEVEL);
  const baseArgs = { lang: 'de', level: lv, allowBankDup: false };

  if (hint.module === 'lesen') {
    return validateLesenBatch(batch, baseArgs, {
      teil: hint.teil ?? inferTeilFromBatch(batch),
      label: quiet ? '' : path.basename(relFile),
    });
  }

  return validateExamBatch(
    batch,
    { ...baseArgs, module: hint.module, teil: hint.teil },
    { teil: hint.teil ?? inferTeilFromBatch(batch), label: quiet ? '' : path.basename(relFile) },
  );
}

function buildSeedRecord(batch, check, relFile) {
  const lv = normalizeLevel(inferBatchLevel(batch) || check.level || TARGET_LEVEL);
  if (check.module === 'lesen') {
    return buildLesenSeedRecordFromBatch(batch, {
      lang: 'de',
      level: lv,
      teil: check.teil,
      sourceFile: relFile,
    });
  }
  return buildExamSeedRecordFromBatch(batch, {
    lang: 'de',
    level: lv,
    module: check.module,
    teil: check.teil,
    sourceFile: relFile,
  });
}

async function auditOneFile(relFile, idx, args) {
  const hint = inferFromFilename(relFile);
  const entry = { relFile, module: hint.module, teil: hint.teil, category: null, reason: null, detail: null };

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(path.join(ROOT, relFile), 'utf8'));
  } catch (err) {
    entry.category = 'parse_error';
    entry.reason = err.message;
    return entry;
  }

  const mute = quiet
    ? () => {
        const o = console.log;
        console.log = () => {};
        return o;
      }
    : () => console.log;

  const restore = mute();
  let check;
  try {
    check = await validateBatchForPublish(batch, relFile, args);
  } finally {
    if (quiet) console.log = restore;
  }

  if (!check.ok) {
    entry.category = 'validation_fail';
    entry.module = check.module || hint.module;
    entry.teil = check.teil ?? hint.teil;
    entry.reason = (check.errors || []).join('; ');
    return entry;
  }

  entry.module = check.module || hint.module;
  entry.teil = check.teil ?? hint.teil;

  const inSeed = classifyAlreadyInSeed(relFile, batch, idx, hint);
  if (inSeed.inSeed) {
    entry.category = 'already_in_seed';
    entry.reason = inSeed.reason;
    entry.recordId = inSeed.recordId;
    return entry;
  }

  const restore2 = mute();
  let gate;
  try {
    gate = await isPartPoolReady(batch, {
      allowFailures: args.allowAuditFailures,
      semantic: false,
      skipSem2: true,
    });
  } finally {
    if (quiet) console.log = restore2;
  }

  if (!gate.ok) {
    entry.category = 'gate_fail';
    entry.reason = 'isPartPoolReady';
    entry.detail = {
      blocking: (gate.blocking || []).slice(0, 5).map((f) => ({
        chk: f.id,
        severity: f.severity,
        message: f.message,
      })),
      blockingCount: gate.blocking?.length || 0,
    };
    return entry;
  }

  const record = buildSeedRecord(batch, check, relFile);
  record.sourceFile = relFile;

  if (!partPassesPublishGate(record)) {
    entry.category = 'gate_fail';
    entry.reason = 'partPassesPublishGate';
    return entry;
  }

  entry.category = 'ready_to_publish';
  entry.recordId = record.id;
  return entry;
}

async function publishOne(relFile, batch, check) {
  const lv = normalizeLevel(inferBatchLevel(batch) || TARGET_LEVEL);
  const opts = {
    lang: 'de',
    level: lv,
    teil: check.teil,
    sourceFile: relFile,
    contributor: 'pool-verified-publish-2026-07-15',
    skipLock: true,
  };
  if (check.module === 'lesen') {
    return publishLesenBatchToPool(batch, {
      ...opts,
      topicTag: batch.passages?.[0]?.topicTag || batch.topicTag,
      forceTopicTag: batch._requestedTopic || batch._resolvedTopic || null,
    });
  }
  return publishExamBatchToPool(batch, {
    ...opts,
    module: check.module,
  });
}

function collectPoolVerifiedFiles() {
  const out = new Map();
  for (const root of [POOL_DIR, POOL_VERIFIED_DIR]) {
    if (!fs.existsSync(root)) continue;
    for (const abs of listJsonInStagingRoot(root)) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      let batch;
      try {
        batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        continue;
      }
      const lv = inferBatchLevel(batch);
      if (lv === 'MIXED') continue;
      if (normalizeLevel(lv) !== TARGET_LEVEL) continue;
      out.set(rel, abs);
    }
  }
  return [...out.keys()].sort();
}

async function main() {
  const pool = loadSeed();
  const idx = seedIndex(pool);
  const files = collectPoolVerifiedFiles();

  const args = { allowAuditFailures: false };
  const audit = [];
  const byCategory = {};

  console.log(`Auditing ${files.length} pool-verified/${TARGET_LEVEL} files…`);
  for (const rel of files) {
    const row = await auditOneFile(rel, idx, args);
    audit.push(row);
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    if (!quiet && audit.length % 25 === 0) console.log(`  …${audit.length}/${files.length}`);
  }

  let published = 0;
  let publishFailed = 0;
  const publishResults = [];

  if (doPublish) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `de_B1_pre-publish-pool-verified-${stamp}.json`);
    fs.copyFileSync(SEED_FILE, backupPath);
    console.log(`Backup: ${path.relative(ROOT, backupPath)}`);

    const ready = audit.filter((a) => a.category === 'ready_to_publish');
    console.log(`Publishing ${ready.length} ready files…`);

    for (const row of ready) {
      const batch = JSON.parse(fs.readFileSync(path.join(ROOT, row.relFile), 'utf8'));
      const check = { module: row.module, teil: row.teil, ok: true };
      const pub = await publishOne(row.relFile, batch, check);
      publishResults.push({ relFile: row.relFile, ...pub });
      if (pub.ok && !pub.duplicate) {
        published++;
        row.category = 'published';
      } else if (pub.ok && pub.duplicate) {
        row.category = 'already_in_seed';
        row.reason = 'dedup_at_publish';
      } else {
        publishFailed++;
        row.category = 'publish_fail';
        row.reason = pub.error || pub.reason || 'unknown';
        row.detail = pub;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: doPublish ? 'audit_and_publish' : 'audit_only',
    seedFile: 'library/reusable-seed/de_B1.json',
    seedCountBefore: pool.records?.length || 0,
    seedCountAfter: doPublish ? loadSeed().records?.length : pool.records?.length,
    poolVerifiedFiles: files.length,
    byCategory,
    published,
    publishFailed,
    audit,
    publishResults: doPublish ? publishResults : undefined,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n── Summary ──');
  for (const [k, v] of Object.entries(byCategory).sort()) console.log(`  ${k}: ${v}`);
  if (doPublish) console.log(`  published (new): ${published}, publish_failed: ${publishFailed}`);
  console.log(`Report: ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
