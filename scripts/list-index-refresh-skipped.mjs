#!/usr/bin/env node
/** Reproduce index-refresh skip logic for push-only-missing IDs. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { partPayloadKey } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));

const idsPath = path.join(ROOT, 'batches/ready/gate-logs/push-only-missing-ids-2026-07-28.json');
const ids = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
const seedRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/reusable-seed/de_B1.json'), 'utf8'));
const seedArr = Array.isArray(seedRaw) ? seedRaw : seedRaw.records || [];
const seedById = new Map(seedArr.map((r) => [r.id || r.partId, r]));

const store = getStore({
  name: 'lexicoil-data',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN,
});

const skipped = [];
let refreshed = 0;

for (const id of ids) {
  const rec = seedById.get(id);
  const mod = rec ? String(rec.module || '').toLowerCase() : null;
  let blob = null;
  if (mod) {
    blob = await store.get(partPayloadKey('de', 'B1', mod, id), { type: 'json' });
  }
  if (!blob) {
    for (const m of ['lesen', 'horen', 'schreiben', 'sprechen']) {
      blob = await store.get(partPayloadKey('de', 'B1', m, id), { type: 'json' });
      if (blob) break;
    }
  }

  if (!blob) {
    skipped.push({
      id,
      reason: 'no_blob_payload',
      seedGate: rec ? partPassesPublishGate(rec) : null,
      seedModule: mod,
    });
    continue;
  }
  if (!partPassesPublishGate(blob)) {
    skipped.push({
      id,
      reason: 'publish_gate_fail_on_blob',
      module: blob.module,
      blob: {
        complete: blob.complete,
        verified: blob.verified,
        sem1VerifiedAt: blob.sem1VerifiedAt ?? null,
        sem1Skipped: blob.sem1Skipped ?? null,
      },
      seed: rec
        ? {
            complete: rec.complete,
            verified: rec.verified,
            sem1VerifiedAt: rec.sem1VerifiedAt ?? null,
            sem1Skipped: rec.sem1Skipped ?? null,
            seedGate: partPassesPublishGate(rec),
          }
        : null,
      sem1_bug_likely:
        rec &&
        partPassesPublishGate(rec) &&
        !blob.sem1VerifiedAt &&
        !blob.sem1Skipped,
    });
    continue;
  }
  refreshed++;
}

const outPath = path.join(ROOT, 'batches/ready/gate-logs/index-refresh-skipped-22-analysis-2026-07-28.json');
fs.writeFileSync(
  outPath,
  JSON.stringify({ refreshedWouldBe: refreshed, skippedCount: skipped.length, skipped }, null, 2),
  'utf8',
);
console.log(`Wrote ${outPath}`);
console.log(`refreshed=${refreshed} skipped=${skipped.length}`);
