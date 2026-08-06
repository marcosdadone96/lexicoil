#!/usr/bin/env node
/**
 * Cost / repairability breakdown for B1 IMPORTANT findings (CHK-18, CHK-6, CHK-14).
 *   node scripts/analyze-b1-important-cost.mjs [--official-only]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';

const officialOnly = process.argv.includes('--official-only');
const poolDir = poolVerifiedDir('B1');

function officialBasenames() {
  const out = new Set();
  const asmDir = path.join(ROOT, 'batches/ready/assembled-from-verified');
  for (let s = 1; s <= 14; s++) {
    const p = path.join(asmDir, `assembled-exam-b1-verified-e${s}.json`);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const id of Object.values(j._meta?.partIds || {})) if (id) out.add(String(id));
  }
  return out;
}

const official = officialBasenames();
const audit = spawnSync(
  process.execPath,
  ['scripts/audit-pass-2.mjs', poolDir, '--json'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
);

if (audit.status !== 0 && audit.status !== 1) {
  console.error(audit.stderr || audit.stdout);
  process.exit(1);
}

let raw = audit.stdout;
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const j = JSON.parse(raw);
const findings = (j.findings || []).filter((f) => f.severity === 'IMPORTANT');

const TOP = ['CHK-18', 'CHK-6', 'CHK-14'];
const COST = {
  'CHK-14': { det: 1, llm: 0, note: 'applyGermanCapsNormalize + normalizeBatch ($0)' },
  'CHK-14c': { det: 1, llm: 0, note: 'normalizeBatchMcqOptionCapitalization ($0)' },
  'CHK-6': { det: 0.15, llm: 0.85, note: '~15% lexico 1:1 swap; ~85% surgical LLM (~$0.02/q)' },
  'CHK-6c': { det: 0, llm: 1, note: 'A2 blacklist in B1 — regen or surgical' },
  'CHK-18': { det: 0.05, llm: 0.95, note: 'short/trivial/circular → explanationRepair (~$0.008/expl)' },
  'CHK-18b': { det: 0.2, llm: 0.8, note: 'key mismatch: some sync letter; rest explanationRepair' },
};

function inScope(f) {
  if (!officialOnly) return true;
  const base = String(f.file || '').replace(/\.json$/, '');
  return official.has(base);
}

const scoped = findings.filter(inScope);
const byChk = {};
for (const f of scoped) {
  const id = f.id || 'other';
  byChk[id] = byChk[id] || { n: 0, files: new Set(), det: 0, llm: 0 };
  byChk[id].n++;
  byChk[id].files.add(f.file);
  const c = COST[id] || { det: 0, llm: 1, note: 'manual review' };
  byChk[id].det += c.det;
  byChk[id].llm += c.llm;
}

let totalDet = 0;
let totalLlmItems = 0;
let estUsd = 0;

console.log(`\n══ B1 IMPORTANT cost analysis ${officialOnly ? '(official catalog only)' : '(full pool)'} ══`);
console.log(`  scoped findings: ${scoped.length} / ${findings.length}\n`);

for (const chk of TOP) {
  const row = byChk[chk] || { n: 0, files: new Set(), det: 0, llm: 0 };
  const detN = Math.round(row.det);
  const llmN = Math.round(row.llm);
  const perItem = chk.startsWith('CHK-18') ? 0.008 : chk.startsWith('CHK-6') ? 0.02 : 0;
  const usd = llmN * perItem;
  totalDet += detN;
  totalLlmItems += llmN;
  estUsd += usd;
  console.log(`  ${chk}: ${row.n} hits in ${row.files.size} files`);
  console.log(`    deterministic: ~${detN}  LLM/surgical: ~${llmN}  est $${usd.toFixed(2)}`);
  console.log(`    ${COST[chk]?.note || ''}\n`);
}

// Related sub-checks
for (const chk of ['CHK-18b', 'CHK-14c', 'CHK-6c']) {
  const row = byChk[chk];
  if (!row?.n) continue;
  const llmN = Math.round(row.llm);
  const perItem = chk.includes('18') ? 0.008 : 0.02;
  estUsd += llmN * perItem;
  totalLlmItems += llmN;
  console.log(`  ${chk}: ${row.n} (included above partially)`);
}

console.log('── TOTAL to close ALL scoped IMPORTANT ──');
console.log(`  deterministic fixes: ~${totalDet} items ($0)`);
console.log(`  LLM/surgical fixes: ~${totalLlmItems} items`);
console.log(`  estimated LLM cost: ~$${estUsd.toFixed(2)} USD (gemini-2.5-flash)`);
console.log(`  full pool (not official-only): ${findings.length} IMPORTANT total\n`);

const out = path.join(ROOT, 'batches/ready/gate-logs/b1-important-cost-analysis.json');
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      officialOnly,
      scoped: scoped.length,
      totalImportant: findings.length,
      byChk: Object.fromEntries(
        Object.entries(byChk).map(([k, v]) => [k, { n: v.n, files: [...v.files] }]),
      ),
      estimate: { deterministicItems: totalDet, llmItems: totalLlmItems, usd: estUsd },
    },
    null,
    2,
  ),
);
console.log(`Wrote ${out}`);
