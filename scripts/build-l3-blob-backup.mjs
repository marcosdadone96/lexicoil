#!/usr/bin/env node
/**
 * build-l3-blob-backup.mjs — snapshot local de los 3 pool3 L3 antes del push.
 * Usa blob real (pre-key-entropy) + proxy roto (pre-l3-reingest) para los que no estaban en backup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'pool3-de-B1-lesen-t3-7217186ecff6',
  'pool3-de-B1-lesen-t3-d3b8edd00953',
  'pool3-de-B1-lesen-t3-fa88b9a0d707',
];

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = path.join(ROOT, 'backups', `pre-l3-blobs-${stamp}.json`);

function blobFromBroken(record) {
  return {
    schemaVersion: 1,
    id: record.id,
    lang: record.lang,
    level: record.level,
    module: record.module,
    teil: record.teil,
    passage: record.passage || { title: '', text: '', ads: [] },
    questions: record.questions || [],
    ads: record.ads || [],
    instruction: record.instruction || null,
    complete: record.complete ?? true,
    verified: record.verified ?? true,
    contributor: record.contributor || null,
  };
}

const backupRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'backups/pre-key-entropy-2026-07-03.json'), 'utf8'),
);
const backupById = new Map((backupRaw.snapshots || []).map((s) => [s._id, s]));

const brokenRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'backups/pre-l3-reingest-2026-07-03T18-56-08.json'), 'utf8'),
);
const brokenById = new Map((brokenRaw.records || []).map((r) => [r.id, r]));

const snapshots = [];
for (const id of TARGETS) {
  const fromEntropy = backupById.get(id);
  if (fromEntropy) {
    snapshots.push(fromEntropy);
    continue;
  }
  const broken = brokenById.get(id);
  if (!broken) {
    console.error(`Missing snapshot source for ${id}`);
    process.exit(1);
  }
  snapshots.push({
    _blobKey: `reusable_part:de:B1:lesen:${id}`,
    _module: 'lesen',
    _id: id,
    _backedUpAt: new Date().toISOString(),
    _source: 'pre-l3-reingest-broken-proxy',
    payload: blobFromBroken(broken),
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      _format: 'lexiloop-blob-backup-v1',
      _createdAt: new Date().toISOString(),
      _note: '3 pool3 L3 pre-push; fa88b9a0 from pre-key-entropy blob, others from broken seed proxy',
      _count: snapshots.length,
      snapshots,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

for (const s of snapshots) {
  const ads = s.payload?.passage?.ads ?? s.payload?.ads ?? [];
  console.log(`  ${s._id}: passage.ads=${ads.length} (${s._source || 'pre-key-entropy'})`);
}
console.log(`\n✅ Backup: ${path.relative(ROOT, outPath)}`);
