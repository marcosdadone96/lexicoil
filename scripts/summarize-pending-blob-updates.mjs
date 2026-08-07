#!/usr/bin/env node
/**
 * Summarize pending blob UPDATEs from dry-run log + live servedCount.
 * Output: batches/ready/gate-logs/BLOB-PENDING-UPDATES-281-2026-07-28.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';

loadEnvFile();

const DRY = path.join(ROOT, 'batches/ready/gate-logs/push-seed-to-blobs-dry-run-2026-07-28.txt');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/BLOB-PENDING-UPDATES-281-2026-07-28.md');

const text = fs.readFileSync(DRY, 'utf8');
const lines = text.split(/\n/);

/** @type {{ id: string, module: string, teil: string, flags: string, detail: string }[]} */
const updates = [];
let inDiffers = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('DIFFERS (en blobs pero contenido distinto)')) {
    inDiffers = true;
    continue;
  }
  if (inDiffers && line.includes('OK (payload merge = blob)')) break;
  const m = line.match(/^\s+≠ UPDATE\s+(\S+)\s+(\w+)\s+T(\d+)(.*)$/);
  if (m) {
    const detailLine = (lines[i + 1] || '').trim();
    updates.push({
      id: m[1],
      module: m[2],
      teil: m[3],
      flags: m[4].trim(),
      detail: detailLine.replace(/^\s+/, ''),
    });
  }
}

function classifyDetail(d) {
  const tags = [];
  if (/vocabIndex:/i.test(d)) tags.push('vocabIndex');
  if (/passage\.ads|ads:\s*\[\]/.test(d)) tags.push('ads/schema');
  if (/passage\.transcript|instruction:/.test(d)) tags.push('horen/schema');
  if (/questions:/.test(d)) tags.push('questions');
  if (/passage\.text|passage chars/.test(d)) tags.push('passage-text');
  if (/uppercase→lower/.test(d)) tags.push('mcq-key-normalize');
  if (!tags.length) tags.push('other');
  return tags;
}

const require = createRequire(import.meta.url);
const { getStore } = require('@netlify/blobs');
const { partPayloadKey } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsStore.js'));

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
const servedById = new Map();
if (siteID && token) {
  const store = getStore({ name: 'lexicoil-data', siteID, token });
  process.stdout.write(`Fetching servedCount for ${updates.length} parts`);
  let n = 0;
  for (const u of updates) {
    n++;
    if (n % 40 === 0) process.stdout.write('.');
    try {
      const mod = u.module || 'lesen';
      const raw = await store.get(partPayloadKey('de', 'B1', mod, u.id));
      if (raw) {
        const p = JSON.parse(raw);
        servedById.set(u.id, {
          servedCount: p.servedCount || 0,
          lastServedAt: p.lastServedAt || null,
        });
      }
    } catch {
      servedById.set(u.id, { servedCount: null, lastServedAt: null });
    }
  }
  console.log(' done');
} else {
  console.warn('No NETLIFY creds — servedCount omitted');
}

const enriched = updates.map((u) => ({
  ...u,
  changeTags: classifyDetail(u.detail + ' ' + u.flags),
  ...(servedById.get(u.id) || { servedCount: null, lastServedAt: null }),
}));

enriched.sort((a, b) => (b.servedCount || 0) - (a.servedCount || 0));

const BURN = 50;
const highTraffic = enriched.filter((e) => (e.servedCount || 0) >= 10);
const warm = enriched.filter((e) => (e.servedCount || 0) >= 1 && (e.servedCount || 0) < 10);
const cold = enriched.filter((e) => (e.servedCount || 0) === 0);
const unknown = enriched.filter((e) => e.servedCount == null);

const byTag = {};
for (const e of enriched) {
  for (const t of e.changeTags) {
    byTag[t] = (byTag[t] || 0) + 1;
  }
}

const keySeqFlag = enriched.filter((e) => /secuencia|uppercase→lower/i.test(e.flags + e.detail));

let md = `# Pending blob UPDATEs (281) — post only-missing push\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md += `Source diff: \`push-seed-to-blobs-dry-run-2026-07-28.txt\` (pre-push). **Not applied.**\n\n`;
md += `## Traffic proxy (live blob \`servedCount\`)\n\n`;
md += `| Bucket | Count | Definition |\n|--------|------:|------------|\n`;
md += `| High (≥10 serves) | ${highTraffic.length} | Likely seen in generic/personal pool picks |\n`;
md += `| Warm (1–9) | ${warm.length} | Occasional |\n`;
md += `| Cold (0) | ${cold.length} | Never incremented in blob payload |\n`;
md += `| Unknown | ${unknown.length} | Payload read failed |\n\n`;
md += `Note: \`servedCount\` is incremented on pool serve (CAS), not a full analytics trail. IDs with 0 may still appear in exams if served before counter existed.\n\n`;
md += `## Change categories (from dry-run diff lines)\n\n`;
for (const [t, c] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  md += `- **${t}**: ${c}\n`;
}
md += `\n- **MCQ key normalize / seq flags on UPDATE header**: ${keySeqFlag.length} rows tagged in dry-run (subset of 33 “secuencia” total across merge previews)\n\n`;

md += `## High-traffic IDs (servedCount ≥ 10)\n\n`;
if (!highTraffic.length) {
  md += `_None ≥10 — pool skew is toward cold bank/pool3 rows._\n\n`;
} else {
  md += `| servedCount | id | module | T | change tags | dry-run detail (truncated) |\n`;
  md += `|------------:|----|--------|---|-------------|---------------------------|\n`;
  for (const e of highTraffic) {
    const det = (e.detail || e.flags).slice(0, 80).replace(/\|/g, '/');
    md += `| ${e.servedCount} | \`${e.id}\` | ${e.module} | ${e.teil} | ${e.changeTags.join(', ')} | ${det}… |\n`;
  }
  md += `\n`;
}

md += `## Top 25 by servedCount (all pending UPDATEs)\n\n`;
md += `| servedCount | lastServedAt | id | module | T | tags |\n|------------:|--------------|----|--------|---|------|\n`;
for (const e of enriched.slice(0, 25)) {
  const ls = e.lastServedAt ? new Date(e.lastServedAt).toISOString().slice(0, 10) : '—';
  md += `| ${e.servedCount ?? '?'} | ${ls} | \`${e.id}\` | ${e.module} | ${e.teil} | ${e.changeTags.join(', ')} |\n`;
}

md += `\n## Full list (281)\n\n`;
md += `<details><summary>Expand</summary>\n\n`;
md += `| served | id | mod | T | tags | detail |\n|-------:|----|-----|---|------|--------|\n`;
for (const e of enriched) {
  const det = (e.detail || e.flags).slice(0, 120).replace(/\|/g, '/').replace(/\n/g, ' ');
  md += `| ${e.servedCount ?? '?'} | \`${e.id}\` | ${e.module} | ${e.teil} | ${e.changeTags.join('+')} | ${det} |\n`;
}
md += `\n</details>\n`;

fs.writeFileSync(OUT, md, 'utf8');
console.log(`Wrote ${OUT} (${updates.length} rows)`);
