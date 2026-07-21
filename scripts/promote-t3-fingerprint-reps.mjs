/**
 * Promote 1–2 representative Lesen T3 per fingerprint from pool-content-ok-lesen → pool-verified.
 *
 *   node scripts/promote-t3-fingerprint-reps.mjs --dry-run
 *   node scripts/promote-t3-fingerprint-reps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { t3SituationFingerprintFromBatch } from './lib/t3GroupFingerprint.mjs';
import { t3MatchingFingerprint } from './lib/qualityGates/dedupCorpus.mjs';
import { loadAssembleDiscardLists, isAssembleBlocked } from './lib/assembleDiscardLists.mjs';
import { listPoolVerifiedJson } from './lib/batchPaths.mjs';
import { POOL_VERIFIED_DIR, POOL_CONTENT_OK_LESEN_DIR, writePoolVerified, stripPoolRejectMeta } from './lib/finalizePoolReady.mjs';
import { stampGermanCapsVersion } from './lib/poolReadyCheck.mjs';

const dryRun = process.argv.includes('--dry-run');
const BP_DIR = path.join(ROOT, 'scripts/t3-blueprints');
const MAX_PER_FP = 2;
const VOCAB_JACCARD_FOR_SECOND = 0.45; // if second candidate's vocab overlap with first < this, keep 2

/** Manually reviewed in unit exams e2/e3/e4 this session. */
const MANUAL_PREFERRED = new Set([
  'lesen-t3-auto-ma7vt8.json',
  'lesen-t3-auto-1i5jz6.json',
  'lesen-t3-auto-5bw5c5.json',
]);

function vocabSet(batch) {
  const s = new Set();
  for (const q of batch.questions || []) {
    for (const t of q.vocabularyTags || []) s.add(String(t).toLowerCase());
  }
  return s;
}

function gramCount(batch) {
  let n = 0;
  for (const q of batch.questions || []) {
    n += (q.grammarTags || []).length;
  }
  return n;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function loadBlueprintSitMap() {
  const map = new Map(); // sitFp -> slug
  if (!fs.existsSync(BP_DIR)) return map;
  for (const f of fs.readdirSync(BP_DIR).filter((x) => x.endsWith('.json'))) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BP_DIR, f), 'utf8'));
      const qs = b.questions;
      if (!Array.isArray(qs) || qs.length !== 7) continue;
      const sit = t3SituationFingerprintFromBatch({ questions: qs });
      if (sit) map.set(sit, f.replace(/\.json$/i, ''));
    } catch {
      /* skip */
    }
  }
  return map;
}

function scoreCandidate(c) {
  // Higher is better
  let s = 0;
  if (c.manual) s += 1000;
  if (c.blocked) s -= 5000;
  s += c.vocabN * 2;
  s += c.gramN;
  s += c.mtime / 1e13; // tiny tie-break: newer
  return s;
}

const discard = loadAssembleDiscardLists();
const bpMap = loadBlueprintSitMap();

const files = fs
  .readdirSync(POOL_CONTENT_OK_LESEN_DIR)
  .filter((f) => /^lesen-t3-.*\.json$/i.test(f))
  .sort();

const groups = new Map();
for (const f of files) {
  const abs = path.join(POOL_CONTENT_OK_LESEN_DIR, f);
  const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const sit = t3SituationFingerprintFromBatch(batch);
  const match = t3MatchingFingerprint(batch);
  const key = sit || match || `file:${f}`;
  const vocab = vocabSet(batch);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    f,
    abs,
    batch,
    sit,
    match,
    blueprint: bpMap.get(sit) || null,
    blocked: isAssembleBlocked(f, discard.blockedIds),
    manual: MANUAL_PREFERRED.has(f),
    vocab,
    vocabN: vocab.size,
    gramN: gramCount(batch),
    mtime: fs.statSync(abs).mtimeMs,
  });
}

const selected = [];
const groupReport = [];

for (const [fp, members] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const ranked = [...members].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const picks = [];
  const first = ranked.find((c) => !c.blocked) || ranked[0];
  if (first && !first.blocked) picks.push(first);

  // Optional second: only if target vocab clearly distinct from first
  if (picks.length === 1 && ranked.length > 1) {
    for (const cand of ranked) {
      if (cand.f === picks[0].f || cand.blocked) continue;
      const jac = jaccard(picks[0].vocab, cand.vocab);
      if (jac < VOCAB_JACCARD_FOR_SECOND) {
        picks.push(cand);
        break;
      }
    }
  }

  // Cap at MAX_PER_FP
  const finalPicks = picks.slice(0, MAX_PER_FP);
  groupReport.push({
    fingerprint: fp,
    blueprint: members[0].blueprint || bpMap.get(fp) || '(unknown)',
    groupSize: members.length,
    selected: finalPicks.map((p) => ({
      file: p.f,
      manual: p.manual,
      vocabN: p.vocabN,
      gramN: p.gramN,
      reason: p.manual
        ? 'manual-review-preferred'
        : picks[0] === p
          ? 'best-score-vocab/gram/mtime'
          : 'second-distinct-vocab',
    })),
    notSelected: members.filter((m) => !finalPicks.includes(m)).map((m) => m.f),
  });
  selected.push(...finalPicks);
}

fs.mkdirSync(POOL_VERIFIED_DIR, { recursive: true });

const promoted = [];
for (const p of selected) {
  promoted.push(p.f);
  if (dryRun) continue;
  let out = { ...p.batch };
  if (p.blueprint && !out._blueprintSlug && !out.blueprintSlug) {
    out._blueprintSlug = p.blueprint;
  }
  out._t3FingerprintPromote = {
    at: new Date().toISOString(),
    situationFp: p.sit,
    matchingFp: p.match,
    blueprint: p.blueprint,
    note: 'Representative of fingerprint group; siblings remain in pool-content-ok-lesen',
  };
  out = stampGermanCapsVersion(out);
  writePoolVerified(p.f, stripPoolRejectMeta(out));
  fs.unlinkSync(p.abs);
}

const t3VerifiedAfter = listPoolVerifiedJson('B1').filter((abs) => /^lesen-t3-.*\.json$/i.test(path.basename(abs))).length;
const t3OkLeft = fs
  .readdirSync(POOL_CONTENT_OK_LESEN_DIR)
  .filter((f) => /^lesen-t3-.*\.json$/i.test(f)).length;

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  uniqueFingerprints: groups.size,
  blueprintsMapped: [...new Set([...groups.keys()].map((k) => bpMap.get(k)).filter(Boolean))].length,
  filesInOkLesen: files.length,
  selectedCount: selected.length,
  selectedFiles: selected.map((p) => p.f),
  groups: groupReport,
  after: {
    t3InPoolVerified: dryRun ? selected.length : t3VerifiedAfter,
    t3RemainingInOkLesen: dryRun ? files.length - selected.length : t3OkLeft,
  },
};

const outPath = path.join(ROOT, 'batches/ready/gate-logs/T3-FINGERPRINT-PROMOTE-2026-07-10.json');
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# T3 fingerprint representatives → pool-verified (2026-07-10)',
  '',
  `**Dry-run:** ${dryRun}`,
  '',
  `## Resumen`,
  '',
  `| Métrica | N |`,
  `|--------|--:|`,
  `| Archivos T3 en ok-lesen (antes) | ${files.length} |`,
  `| Fingerprints únicos | **${groups.size}** |`,
  `| Blueprints mapeados | ${report.blueprintsMapped} |`,
  `| Seleccionados → pool-verified | **${selected.length}** |`,
  `| Quedan en ok-lesen | ${report.after.t3RemainingInOkLesen} |`,
  '',
  '## Seleccionados',
  '',
  '| Fingerprint | Blueprint | Archivo | Motivo |',
  '|-------------|-----------|---------|--------|',
];
for (const g of groupReport) {
  for (const s of g.selected) {
    md.push(`| \`${g.fingerprint}\` | ${g.blueprint} | \`${s.file}\` | ${s.reason} |`);
  }
}
md.push('', `Datos: \`${path.basename(outPath)}\``, '');
fs.writeFileSync(
  path.join(ROOT, 'batches/ready/gate-logs/T3-FINGERPRINT-PROMOTE-2026-07-10.md'),
  md.join('\n'),
);

console.log(JSON.stringify({
  uniqueFingerprints: groups.size,
  selectedCount: selected.length,
  selectedFiles: selected.map((p) => p.f),
  after: report.after,
  dryRun,
}, null, 2));
