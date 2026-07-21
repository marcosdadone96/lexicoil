#!/usr/bin/env node
/**
 * Scan + reprocess pool for was-clause substantivized-adj regressions (v3.15).
 *   node scripts/reprocess-was-subst-adj-v315-2026-07-12.mjs
 *   node scripts/reprocess-was-subst-adj-v315-2026-07-12.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGermanCapsNormalize,
  GERMAN_CAPS_NORMALIZE_VERSION,
} from './lib/germanCapsNormalize.mjs';
import {
  capitalizeNounsInText,
  decapitalizeMidSentence,
  isSubstantivizedAdjLemma,
  looksLikeWasSubstVerbFollower,
} from './lib/capitalizeNouns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');
const dryRun = process.argv.includes('--dry-run');

// tokenize may not be exported — fallback inline scan via normalize
function collectTexts(batch) {
  const out = [];
  const push = (where, text) => {
    if (typeof text === 'string' && text.trim()) out.push({ where, text });
  };
  for (const p of batch.passages || []) {
    for (const f of ['text', 'title', 'transcript', 'signText']) push(`p.${f}`, p[f]);
    for (const a of p.audio || []) push('audio', a?.text);
    for (const ad of p.ads || []) {
      push('ad', typeof ad === 'string' ? ad : ad?.text || ad?.title);
    }
  }
  for (const q of batch.questions || []) {
    for (const f of ['question', 'explanation', 'signText', 'statement']) {
      push(`q.${q.id}.${f}`, q[f]);
    }
    for (const o of q.options || []) push('opt', typeof o === 'string' ? o : o?.text);
  }
  return out;
}

/**
 * Find lowercase substantivized adj in a was-clause that should be capital
 * (was … schönes + verb).
 */
function findWasLowerAdjHits(text) {
  const hits = [];
  // Broad: was … (up to 12 tokens) … lowerAdj(es) … verbish
  const re =
    /\bwas((?:\s+[A-Za-zÄÖÜäöüß]+){0,12})\s+([a-zäöüß]+(?:es))\s+([a-zäöüß]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const adj = m[2];
    const verb = m[3];
    if (!isSubstantivizedAdjLemma(adj)) continue;
    if (!looksLikeWasSubstVerbFollower(verb)) continue;
    hits.push({
      match: m[0],
      adj,
      verb,
      expected: adj.charAt(0).toUpperCase() + adj.slice(1),
    });
  }
  return hits;
}

/** Confirm capital form survives decap (regression detector). */
function findWasCapitalWouldDecap(text) {
  const before = text;
  const after = decapitalizeMidSentence(text).result;
  if (before === after) return [];
  const hits = [];
  const re =
    /\bwas((?:\s+[A-Za-zÄÖÜäöüß]+){0,12})\s+([A-ZÄÖÜ][a-zäöüß]+(?:es))\s+([a-zäöüß]+)/g;
  let m;
  while ((m = re.exec(before))) {
    const adj = m[2];
    const verb = m[3];
    if (!isSubstantivizedAdjLemma(adj.toLowerCase())) continue;
    if (!looksLikeWasSubstVerbFollower(verb)) continue;
    if (!after.includes(adj) && after.includes(adj.toLowerCase())) {
      hits.push({ match: m[0], adj, verb, wouldBecome: adj.toLowerCase() });
    }
  }
  return hits;
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  capsVersion: GERMAN_CAPS_NORMALIZE_VERSION,
  scanHits: [],
  reprocessed: [],
  unitChecks: [],
};

// Unit smoke before pool
const unitCases = [
  {
    name: 'schreiben-005 golden',
    input: 'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
    want: 'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
  },
  {
    name: 'schreiben-005 lower→cap',
    input: 'Erzählen Sie, was Sie am Wochenende schönes unternommen haben.',
    wantCap: 'Erzählen Sie, was Sie am Wochenende Schönes unternommen haben.',
  },
  {
    name: 'attributive',
    input: 'Sie haben vor Kurzem ein schönes Wochenende erlebt.',
    want: 'Sie haben vor Kurzem ein schönes Wochenende erlebt.',
  },
  {
    name: 'etwas Gutes',
    input: 'Jeder kann etwas Gutes tun.',
    want: 'Jeder kann etwas Gutes tun.',
  },
];
for (const c of unitCases) {
  const decap = decapitalizeMidSentence(c.input).result;
  const cap = capitalizeNounsInText(c.input).result;
  const ok =
    (c.want == null || decap === c.want) &&
    (c.wantCap == null || cap === c.wantCap) &&
    (c.want == null || cap === c.input || capitalizeNounsInText(decap).result === c.want);
  report.unitChecks.push({ ...c, decap, cap, ok });
}

const files = fs.readdirSync(POOL).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const abs = path.join(POOL, file);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const fileHits = [];
  for (const { where, text } of collectTexts(batch)) {
    for (const h of findWasLowerAdjHits(text)) {
      fileHits.push({ where, kind: 'lower_needs_cap', ...h });
    }
    for (const h of findWasCapitalWouldDecap(text)) {
      fileHits.push({ where, kind: 'capital_would_decap', ...h });
    }
  }
  if (!fileHits.length) continue;
  report.scanHits.push({ file, hits: fileHits });

  const { batch: capped, stats, changes } = applyGermanCapsNormalize(batch, { quiet: true });
  capped._germanCapsNormalizeVersion = GERMAN_CAPS_NORMALIZE_VERSION;
  capped._germanCapsNormalizedAt = report.generatedAt;
  capped._wasSubstAdjReprocessNote =
    'v3.15 was-clause substantivized adj (Schönes etc.) — scan+normalize 2026-07-12';

  const afterHits = [];
  for (const { where, text } of collectTexts(capped)) {
    for (const h of findWasLowerAdjHits(text)) {
      afterHits.push({ where, ...h });
    }
  }

  report.reprocessed.push({
    file,
    beforeHits: fileHits.length,
    afterLowerHits: afterHits.length,
    capsStats: stats,
    changeCount: changes?.length || 0,
    remaining: afterHits,
  });

  if (!dryRun) {
    fs.writeFileSync(abs, `${JSON.stringify(capped, null, 2)}\n`);
  }
}

const logPath = path.join(
  ROOT,
  'batches/ready/gate-logs/was-subst-adj-v315-2026-07-12.json',
);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Unit ok: ${report.unitChecks.filter((u) => u.ok).length}/${report.unitChecks.length}`);
console.log(`Scan hits files: ${report.scanHits.length}`);
for (const s of report.scanHits) {
  console.log(`  ${s.file}: ${s.hits.length} hit(s)`);
  for (const h of s.hits.slice(0, 5)) console.log(`    [${h.kind}] ${h.match}`);
}
console.log(`Reprocessed: ${report.reprocessed.length}`);
console.log(`Log: ${path.relative(ROOT, logPath)}`);
if (report.unitChecks.some((u) => !u.ok)) process.exit(1);
if (report.reprocessed.some((r) => r.afterLowerHits > 0)) {
  console.error('FAIL: lower hits remain after normalize');
  process.exit(1);
}
