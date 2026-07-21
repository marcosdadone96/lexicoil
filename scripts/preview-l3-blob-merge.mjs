#!/usr/bin/env node
/**
 * preview-l3-blob-merge — dry-run local: merge seed reparado vs blob roto (backup).
 * No escribe en Netlify. Muestra ads reales blob→OUT para los 3 pool3 L3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUpdatedPayload,
  previewPayloadMerge,
  countRealAds,
} from './lib/mergeSeedBlobPayload.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const BLOB_BACKUP = path.join(ROOT, 'backups/pre-key-entropy-2026-07-03.json');
const BROKEN_SEED = path.join(ROOT, 'backups/pre-l3-reingest-2026-07-03T18-56-08.json');

const TARGETS = [
  'pool3-de-B1-lesen-t3-7217186ecff6',
  'pool3-de-B1-lesen-t3-d3b8edd00953',
  'pool3-de-B1-lesen-t3-fa88b9a0d707',
];

function blobPayloadFromBackup(id, backupById, brokenById) {
  if (backupById.has(id)) return backupById.get(id);
  const broken = brokenById.get(id);
  if (!broken) return null;
  return {
    schemaVersion: 1,
    id: broken.id,
    lang: broken.lang,
    level: broken.level,
    module: broken.module,
    teil: broken.teil,
    passage: broken.passage || { title: '', text: '', ads: [] },
    questions: broken.questions || [],
    ads: broken.ads || [],
    instruction: broken.instruction || null,
    complete: broken.complete ?? true,
    verified: broken.verified ?? true,
    contributor: broken.contributor || null,
  };
}

const seedRaw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
const seedArr = seedRaw.records || seedRaw;
const seedById = new Map(seedArr.map((r) => [r.id, r]));

const backupRaw = JSON.parse(fs.readFileSync(BLOB_BACKUP, 'utf8'));
const backupById = new Map((backupRaw.snapshots || []).map((s) => [s._id, s.payload]));

const brokenRaw = JSON.parse(fs.readFileSync(BROKEN_SEED, 'utf8'));
const brokenById = new Map((brokenRaw.records || []).map((r) => [r.id, r]));

console.log('\n══ PREVIEW merge L3 pool3 (blob roto → seed reparado) ══\n');

let ok = 0;
for (const id of TARGETS) {
  const seedPart = seedById.get(id);
  const blobPart = blobPayloadFromBackup(id, backupById, brokenById);
  if (!seedPart || !blobPart) {
    console.log(`✗ ${id}: seed=${!!seedPart} blob=${!!blobPart}`);
    continue;
  }

  const blobAds = blobPart.passage?.ads ?? blobPart.ads ?? [];
  const seedAds = seedPart.passage?.ads ?? seedPart.ads ?? [];
  let payload;
  try {
    payload = buildUpdatedPayload(blobPart, seedPart);
  } catch (err) {
    console.log(`✗ ${id}: MERGE ERROR — ${err.message}`);
    continue;
  }
  const outAds = payload.passage?.ads ?? payload.ads ?? [];

  console.log(`── ${id} ──`);
  console.log(`  passage.ads  blob: ${blobAds.length} (${countRealAds(blobAds)} reales)`);
  console.log(`  passage.ads  seed: ${(seedPart.passage?.ads || []).length} (${countRealAds(seedAds)} reales)`);
  console.log(`  passage.ads  OUT:  ${(payload.passage?.ads || []).length} (${countRealAds(outAds)} reales)`);
  if (outAds[0]) {
    console.log(`  OUT ad A: ${JSON.stringify(outAds[0]).slice(0, 90)}…`);
  }
  const opts0 = payload.questions?.[0]?.options;
  console.log(`  Q1 options OUT: ${opts0?.length ?? 0} entradas`);
  console.log(`  Q1 correct OUT: ${payload.questions?.[0]?.correct} (blob: ${blobPart.questions?.[0]?.correct})`);
  console.log(previewPayloadMerge(blobPart, seedPart, payload));

  if (countRealAds(blobAds) < 2 && countRealAds(outAds) >= 10) {
    console.log('  ✅ ads suben de vacío/bare → 10 anuncios reales');
    ok++;
  } else {
    console.log('  ⚠ ads merge inesperado');
  }
  console.log('');
}

console.log(`══ ${ok}/${TARGETS.length} records OK para push (ads poblados en OUT) ══\n`);
process.exit(ok === TARGETS.length ? 0 : 1);
