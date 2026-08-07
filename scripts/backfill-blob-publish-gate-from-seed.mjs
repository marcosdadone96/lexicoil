#!/usr/bin/env node
/**
 * Backfill sem1 + index fields on blob payloads from local seed so partPassesPublishGate
 * works in poolSearchCache (push-seed only-missing used addReusablePart without sem1).
 *
 *   node scripts/backfill-blob-publish-gate-from-seed.mjs --dry-run
 *   node scripts/backfill-blob-publish-gate-from-seed.mjs --apply --yes
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { partPayloadKey, partIndexKey } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));
const { vocabKeysFromPart } = require(path.join(ROOT, 'netlify/functions/lib/poolSearchCache.js'));
const { applyPartIndex } = require(path.join(ROOT, 'netlify/functions/lib/partIndex.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const apply = argv.includes('--apply');
const yes = argv.includes('--yes');

if (!dryRun && !apply) {
  console.error('Use --dry-run or --apply --yes');
  process.exit(1);
}

const seedPath = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const seedRaw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const seedArr = Array.isArray(seedRaw) ? seedRaw : seedRaw.records || [];

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error('Missing NETLIFY_SITE_ID / token');
  process.exit(1);
}

const store = getStore({ name: 'lexicoil-data', siteID, token });

let scanned = 0;
let needFix = 0;
let fixed = 0;
let errors = 0;

const idsFile = argv.includes('--ids-file') ? argv[argv.indexOf('--ids-file') + 1] : null;
const filterIds = idsFile
  ? new Set(JSON.parse(fs.readFileSync(path.resolve(idsFile), 'utf8')))
  : argv.includes('--from-apply-log')
    ? new Set(JSON.parse(fs.readFileSync(
        path.join(ROOT, 'batches/ready/gate-logs/push-only-missing-ids-2026-07-28.json'),
        'utf8',
      )))
    : null;

for (const rec of seedArr) {
  const id = rec.id || rec.partId;
  if (!id) continue;
  if (filterIds && !filterIds.has(id)) continue;
  const lang = String(rec.lang || 'de').toLowerCase();
  const level = String(rec.level || 'B1').toUpperCase();
  const mod = String(rec.module || '').toLowerCase();
  if (!mod) continue;
  scanned++;

  if (!partPassesPublishGate(rec)) continue;

  const pKey = partPayloadKey(lang, level, mod, id);
  let blob;
  try {
    blob = await store.get(pKey, { type: 'json' });
  } catch {
    continue;
  }
  if (!blob) continue;
  if (partPassesPublishGate(blob)) continue;

  needFix++;
  const merged = {
    ...blob,
    sem1VerifiedAt: rec.sem1VerifiedAt ?? blob.sem1VerifiedAt,
    sem1Skipped: rec.sem1Skipped ?? blob.sem1Skipped,
    vocabIndex: Array.isArray(rec.vocabIndex) && rec.vocabIndex.length ? rec.vocabIndex : blob.vocabIndex,
    vocabIndexVersion: rec.vocabIndexVersion || blob.vocabIndexVersion,
    topicTag: blob.topicTag || rec.topicTag,
    topicSlug: blob.topicSlug || rec.topicSlug,
    topic: blob.topic || rec.topic,
  };
  applyPartIndex(merged, { lang, level, topicTag: merged.topicTag });

  if (dryRun) {
    console.log(`  FIX ${id} (${mod} T${rec.teil}) sem1=${merged.sem1VerifiedAt || merged.sem1Skipped || '?'}`);
    continue;
  }

  try {
    const servedCount = blob.servedCount || 0;
    const lastServedAt = blob.lastServedAt;
    merged.servedCount = servedCount;
    if (lastServedAt) merged.lastServedAt = lastServedAt;
    await store.setJSON(pKey, merged);
    const iKey = partIndexKey(lang, level, mod, id);
    const idxPayload = {
      partKey: pKey,
      id,
      teil: merged.teil,
      complete: merged.complete,
      verified: merged.verified,
      createdAt: merged.createdAt,
      contributor: merged.contributor,
      disabled: false,
      servedCount,
      topicTag: merged.topicTag || null,
      topicSlug: merged.topicSlug || merged.topic || null,
      vocabKeys: vocabKeysFromPart(merged),
    };
    await store.setJSON(iKey, idxPayload);
    console.log(`  ✓ ${id}`);
    fixed++;
  } catch (err) {
    console.error(`  ✗ ${id}: ${err.message}`);
    errors++;
  }
}

console.log(`\nScanned seed: ${scanned} · need fix: ${needFix} · ${dryRun ? 'dry-run' : `fixed ${fixed}, errors ${errors}`}\n`);
process.exit(errors ? 1 : 0);
