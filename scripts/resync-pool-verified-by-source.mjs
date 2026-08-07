#!/usr/bin/env node
/**
 * Replace reusable-seed record(s) matched by sourceFile from pool-verified JSON.
 * Use when auto-sync skips duplicate id (appendLesenRecordToPool no-op).
 *
 *   node scripts/resync-pool-verified-by-source.mjs A2 lesen-t2-cur-society.json ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  buildExamSeedRecordFromBatch,
  defaultPoolFile,
  extractRecordPassageText,
} from './lib/publishToPool.mjs';
import { parsePoolVerifiedMeta } from './lib/autoSyncPersonalPoolLib.mjs';

const level = (process.argv[2] || 'A2').toUpperCase();
const files = process.argv.slice(3);
if (!files.length) {
  console.error('Usage: node scripts/resync-pool-verified-by-source.mjs A2 file.json ...');
  process.exit(1);
}

const poolDir = path.join(ROOT, 'batches/ready/pool-verified', level);
const poolFile = defaultPoolFile('de', level);
const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
const report = { at: new Date().toISOString(), level, updates: [], verify: [] };

function inferModuleTeil(batch, filename) {
  const meta = parsePoolVerifiedMeta(filename);
  const mod = String(
    batch.module || batch.passages?.[0]?.module || batch.questions?.[0]?.module || meta.module || 'lesen',
  ).toLowerCase();
  const teil = Number(
    batch.teil ?? batch.passages?.[0]?.teil ?? batch.questions?.[0]?.teil ?? meta.teil ?? 1,
  );
  return { mod, teil };
}

function allPassageText(batchOrRec) {
  if (Array.isArray(batchOrRec.passages) && batchOrRec.passages.length) {
    return batchOrRec.passages.map((p) => p.text || p.transcript || '').join('\n---\n');
  }
  if (Array.isArray(batchOrRec.segments) && batchOrRec.segments.length) {
    return batchOrRec.segments.map((s) => s.text || s.transcript || '').join('\n---\n');
  }
  return extractRecordPassageText(batchOrRec);
}

function fingerprintBatch(batch, mod, teil) {
  const topicTag = batch.topicTag || batch._requestedTopic || '';
  const passageText = allPassageText({ ...batch, module: mod, teil });
  const qIds = (batch.questions || []).map((q) => q.id).join('|');
  const opts = (batch.questions || [])
    .flatMap((q) => q.options || [])
    .map((o) => (typeof o === 'string' ? o : `${o.key})${o.text}`))
    .join('|');
  return { topicTag, passageText, qIds, opts };
}

function fingerprintSeed(rec, mod) {
  const topicTag = rec.topicTag || '';
  const passageText = allPassageText(rec);
  const qs = rec.questions || [];
  const qIds = qs.map((q) => q.id).join('|');
  const opts = qs
    .flatMap((q) => q.options || [])
    .map((o) => (typeof o === 'string' ? o : `${o.key})${o.text}`))
    .join('|');
  return { topicTag, passageText, qIds, opts };
}

for (const file of files) {
  const base = path.basename(file);
  const abs = path.join(poolDir, base);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const sourceFile = `batches/ready/pool-verified/${level}/${base}`.replace(/\\/g, '/');
  const idx = pool.records.findIndex((r) => String(r.sourceFile || '').replace(/\\/g, '/') === sourceFile);
  if (idx < 0) {
    report.updates.push({ file: base, ok: false, error: 'no seed record for sourceFile' });
    continue;
  }
  const existing = pool.records[idx];
  const { mod, teil } = inferModuleTeil(batch, base);
  const fresh = buildExamSeedRecordFromBatch(batch, {
    lang: 'de',
    level,
    module: mod,
    teil,
    id: existing.id,
    idPrefix: 'pv',
  });
  fresh.id = existing.id;
  fresh.sourceFile = sourceFile;
  fresh.contributor = existing.contributor || 'resync-pool-verified-by-source';
  fresh.complete = existing.complete !== false;
  fresh.verified = existing.verified !== false;
  fresh.disabled = existing.disabled === true ? true : false;
  fresh.sem1Ok = existing.sem1Ok;
  fresh.sem1VerifiedAt = existing.sem1VerifiedAt;
  fresh.publishedAt = existing.publishedAt;
  fresh.createdAt = existing.createdAt;
  fresh.vocabIndex = existing.vocabIndex;
  fresh.vocabIndexVersion = existing.vocabIndexVersion;
  fresh.topicTag = fresh.topicTag ?? existing.topicTag;
  fresh._resyncedAt = report.at;

  pool.records[idx] = { ...existing, ...fresh };

  const fpPool = fingerprintBatch(batch, mod, teil);
  const fpSeed = fingerprintSeed(pool.records[idx], mod);
  const match =
    fpPool.topicTag === fpSeed.topicTag &&
    fpPool.passageText === fpSeed.passageText &&
    fpPool.qIds === fpSeed.qIds &&
    fpPool.opts === fpSeed.opts;

  report.updates.push({ file: base, ok: true, seedId: existing.id, sourceFile, module: mod, teil });
  report.verify.push({
    file: base,
    topicTagMatch: fpPool.topicTag === fpSeed.topicTag,
    passageTextMatch: fpPool.passageText === fpSeed.passageText,
    questionIdsMatch: fpPool.qIds === fpSeed.qIds,
    optionsMatch: fpPool.opts === fpSeed.opts,
    allMatch: match,
    poolTopicTag: fpPool.topicTag,
    seedTopicTag: fpSeed.topicTag,
  });
}

pool._updatedAt = report.at;
fs.writeFileSync(poolFile, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
const out = path.join(ROOT, 'batches/ready/gate-logs/a2-pool-resync-by-source-evidence.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('Wrote', path.relative(ROOT, out));
if (report.verify.some((v) => !v.allMatch)) process.exit(1);
