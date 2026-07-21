#!/usr/bin/env node
/**
 * Cluster T3 blueprints by shared ad-set + character cast.
 *   node scripts/scan-t3-blueprint-molds-2026-07-15.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './lib/loadEnv.mjs';

const BP_DIR = path.join(ROOT, 'scripts/t3-blueprints');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/scan-t3-blueprint-molds-2026-07-15.json');

function stripLetter(opt) {
  return String(opt || '').replace(/^[A-J]\)\s*/, '').trim();
}

function adsFingerprint(questions) {
  const bodies = (questions?.[0]?.options || []).map(stripLetter).sort().join('\n');
  return crypto.createHash('sha256').update(bodies, 'utf8').digest('hex').slice(0, 12);
}

function castFingerprint(questions) {
  const names = [];
  for (const q of questions || []) {
    const m = String(q.question || '').match(/\b(?:Herr|Frau|Opa|Die kleine)\s+[\wäöüß]+/gi);
    if (m) names.push(...m);
    const first = String(q.question || '').match(/^([A-ZÄÖÜ][a-zäöüß]+)\s/);
    if (first) names.push(first[1]);
  }
  return [...new Set(names.map((n) => n.trim()))].sort().join('|');
}

function situationsCore(questions) {
  return (questions || []).map((q, i) => {
    const qtext = String(q.question || '');
    return { slot: i + 1, text: qtext.slice(0, 72) };
  });
}

const files = fs.readdirSync(BP_DIR).filter((f) => f.endsWith('.json'));
const rows = [];

for (const f of files) {
  const bp = JSON.parse(fs.readFileSync(path.join(BP_DIR, f), 'utf8'));
  const slug = f.replace(/\.json$/, '');
  rows.push({
    slug,
    adsFp: adsFingerprint(bp.questions),
    cast: castFingerprint(bp.questions),
    situations: situationsCore(bp.questions),
    q7: bp.questions?.[6]?.question || '',
  });
}

const byAds = new Map();
for (const r of rows) {
  const list = byAds.get(r.adsFp) || [];
  list.push(r.slug);
  byAds.set(r.adsFp, list);
}

const byCast = new Map();
for (const r of rows) {
  const list = byCast.get(r.cast) || [];
  list.push(r.slug);
  byCast.set(r.cast, list);
}

const report = {
  scannedAt: new Date().toISOString(),
  blueprintCount: rows.length,
  adSetFamilies: [...byAds.entries()].map(([fp, slugs]) => ({ adsFp: fp, count: slugs.length, slugs })),
  castFamilies: [...byCast.entries()].map(([cast, slugs]) => ({ cast, count: slugs.length, slugs })),
  rows,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Blueprints: ${rows.length}`);
console.log(`Ad-set families: ${byAds.size}`);
for (const [fp, slugs] of byAds) {
  if (slugs.length > 1) console.log(`  shared ads [${fp}]: ${slugs.join(', ')}`);
}
console.log(`Cast families (exact): ${byCast.size}`);
for (const [cast, slugs] of byCast) {
  if (slugs.length > 1) console.log(`  shared cast: ${slugs.join(', ')}`);
}
console.log(`Report → ${path.relative(ROOT, OUT)}`);
