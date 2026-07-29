#!/usr/bin/env node
/**
 * Tier-2 reconciliation safety check: HEAD vs working tree vs production CDN.
 *   node scripts/audit-tier2-divergence.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD_BASE = process.env.PROD_ASSET_BASE || 'https://www.lexicoil.com';
const INVENTORY = path.join(
  ROOT,
  'batches/ready/gate-logs/prod-app-html-drift-inventory.json',
);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizeText(buf) {
  return Buffer.from(
    buf
      .toString('utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trimEnd(),
    'utf8',
  );
}

function readHead(file) {
  try {
    return execSync(`git show HEAD:${file}`, { cwd: ROOT, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function readLocal(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

async function fetchProd(file) {
  const url = `${PROD_BASE}/${file.replace(/\\/g, '/')}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) return { ok: false, status: res.status, url };
  const ab = await res.arrayBuffer();
  return { ok: true, body: Buffer.from(ab), url };
}

function classify(headBuf, localBuf, prodBuf) {
  if (!localBuf) return { kind: 'missing_local', note: 'file missing on disk' };
  if (!headBuf) return { kind: 'missing_head', note: 'not in HEAD' };
  if (!prodBuf) return { kind: 'prod_fetch_failed', note: 'could not fetch CDN' };

  const hHead = sha256(normalizeText(headBuf));
  const hLocal = sha256(normalizeText(localBuf));
  const hProd = sha256(normalizeText(prodBuf));

  if (hLocal === hProd && hHead !== hLocal) {
    return { kind: 'simple_prod_ahead', note: 'local matches prod; HEAD is older' };
  }
  if (hHead === hProd && hLocal !== hHead) {
    return {
      kind: 'local_ahead_of_prod',
      note: 'HEAD matches prod but working tree differs — do not commit local as prod sync',
    };
  }
  if (hHead === hLocal && hLocal !== hProd) {
    return {
      kind: 'prod_ahead_of_both',
      note: 'prod differs from both HEAD and local — prod may have been deployed from another tree',
    };
  }
  if (hHead === hLocal && hLocal === hProd) {
    return { kind: 'already_aligned', note: 'no drift' };
  }
  return {
    kind: 'three_way_diverge',
    note: 'HEAD, local, and prod all differ — manual review required',
    hashes: { head: hHead.slice(0, 12), local: hLocal.slice(0, 12), prod: hProd.slice(0, 12) },
  };
}

const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const files = inv.trackedModifiedReferenced || [];

const rows = [];
for (const file of files) {
  const headBuf = readHead(file);
  const localBuf = readLocal(file);
  let prodBuf = null;
  let prodMeta = {};
  try {
    const prod = await fetchProd(file);
    if (prod.ok) prodBuf = prod.body;
    else prodMeta = { status: prod.status, url: prod.url };
  } catch (e) {
    prodMeta = { error: String(e.message || e) };
  }
  const c = classify(headBuf, localBuf, prodBuf);
  rows.push({ file, ...c, prodMeta });
}

const byKind = {};
for (const r of rows) {
  byKind[r.kind] = byKind[r.kind] || [];
  byKind[r.kind].push(r.file);
}

const out = {
  generatedAt: new Date().toISOString(),
  prodBase: PROD_BASE,
  head: execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  summary: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])),
  needsReview: rows.filter((r) => r.kind !== 'simple_prod_ahead' && r.kind !== 'already_aligned'),
  rows,
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/tier2-divergence-audit.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

console.log('HEAD', out.head);
console.log('Summary:', out.summary);
console.log('\n=== NEEDS REVIEW (not simple prod-ahead) ===');
for (const r of out.needsReview) {
  console.log(`${r.kind}: ${r.file}`);
  console.log(`  ${r.note}`);
  if (r.hashes) console.log('  hashes', r.hashes);
  if (r.prodMeta?.status) console.log('  prod HTTP', r.prodMeta.status);
}
console.log('\n=== SIMPLE (local == prod, HEAD older) ===');
for (const f of byKind.simple_prod_ahead || []) console.log(f);
console.log('\nWrote', outPath);
