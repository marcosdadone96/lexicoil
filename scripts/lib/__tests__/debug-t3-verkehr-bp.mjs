#!/usr/bin/env node
import fs from 'node:fs';
import { checkLesenBatchQuality } from '../lesenBatchQuality.mjs';
import { checkT3PoolDedup } from '../t3PoolDedupGate.mjs';
import { loadPassingT3Blueprints } from '../lesenT3BlueprintStock.mjs';
import { buildValidatedT3Part } from '../../make-t3.mjs';

const slug = process.argv[2] || 'bp-oepnv-ticket';
const bp = loadPassingT3Blueprints().find((b) => b.slug === slug);
if (!bp) {
  console.error('Blueprint not found', slug);
  process.exit(1);
}

for (let i = 0; i < 5; i++) {
  try {
    const batch = buildValidatedT3Part({
      requestedTopic: 'Verkehr',
      words: ['bus', 'bahn', 'fahrrad', 'parkplatz', 'strasse', 'führerschein'],
      maxAttempts: 3,
      exclude: new Set(i ? [slug] : []),
    });
    console.log('attempt', i, 'OK', batch._blueprintSlug);
    break;
  } catch (e) {
    console.log('attempt', i, 'FAIL', e.message);
  }
}
