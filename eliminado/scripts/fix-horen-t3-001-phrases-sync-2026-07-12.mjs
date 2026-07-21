#!/usr/bin/env node
/**
 * Fix artificial phrases in horen-t3-001 (staging + mirrors) with passage sync contract.
 *   node scripts/fix-horen-t3-001-phrases-sync-2026-07-12.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertHorenPassageSyncContract,
  replaceAcrossHorenPassageSync,
  HOREN_PASSAGE_SYNC_VERSION,
} from './lib/horenPassageSync.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  'batches/ready/horen-t3-staging-2026-07-11-canary/horen-t3-gemini-001.json',
  'batches/ready/canary-all-staging-2026-07-11/horen-t3-gemini-001.json',
  'batches/ready/pool-verified/horen-t3-gemini-001.json',
];

const REPLACES = [
  ['Ich konsumiere nur noch Kaffee.', 'Ich trinke nur noch Kaffee.'],
  ['Das gab mir gute Gedanken.', 'Das hat mir neue Impulse gegeben.'],
];

const report = { generatedAt: new Date().toISOString(), version: HOREN_PASSAGE_SYNC_VERSION, files: [] };

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  const entry = { file: rel, hits: [], skipped: false };
  if (!fs.existsSync(fp)) {
    entry.skipped = true;
    entry.reason = 'missing';
    report.files.push(entry);
    continue;
  }
  const before = JSON.parse(fs.readFileSync(fp, 'utf8'));
  // Skip pool copy if it already has different content (no konsumiere)
  const blob = JSON.stringify(before);
  if (!/konsumiere|gute Gedanken/.test(blob)) {
    entry.skipped = true;
    entry.reason = 'phrases-not-present';
    report.files.push(entry);
    continue;
  }
  let current = before;
  for (const [from, to] of REPLACES) {
    if (!JSON.stringify(current).includes(from)) continue;
    const { batch, hits } = replaceAcrossHorenPassageSync(current, from, to);
    assertHorenPassageSyncContract(current, batch, { label: path.basename(rel) });
    current = batch;
    entry.hits.push(...hits);
  }
  // Also remap vocab tag konsumieren→trinken if present
  for (const q of current.questions || []) {
    if (!Array.isArray(q.vocabularyTags)) continue;
    q.vocabularyTags = q.vocabularyTags.map((t) =>
      String(t).toLowerCase() === 'konsumieren' ? 'trinken' : t,
    );
  }
  fs.writeFileSync(fp, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  report.files.push(entry);
}

fs.writeFileSync(
  path.join(ROOT, 'batches/ready/gate-logs/horen-t3-001-phrases-sync-2026-07-12.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
