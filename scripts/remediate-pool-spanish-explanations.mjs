#!/usr/bin/env node
/**
 * Emergency remediation: Spanish explanations in pool-verified.
 * 1) Quarantine 24 files → needs-regeneration (jubilate seed records)
 * 2) Repair explanations via corrected CHK-18b prompt (German-only)
 * 3) Re-publish to pool-verified after Q5 v1.2 gate
 *
 *   node scripts/remediate-pool-spanish-explanations.mjs --dry-run
 *   node scripts/remediate-pool-spanish-explanations.mjs --quarantine-only
 *   node scripts/remediate-pool-spanish-explanations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  POOL_FILE,
  poolVerifiedDir,
  needsRegenerationDir,
  normalizeLevel,
} from './lib/batchPaths.mjs';
import { generateContent } from './lib/geminiClient.mjs';
import {
  repairSpanishExplanationsInBatch,
  findSpanishExplanationFindings,
} from './lib/explanationRepair.mjs';
import { wrapSurgicalCallLlm, SURGICAL_THINKING_CONFIG } from './lib/surgicalRepairRouter.mjs';
import {
  assertBatchGermanExamContent,
  assessGermanExamText,
} from './lib/qualityGates/germanContentLanguageGate.mjs';
import { writePoolVerified, stripPoolRejectMeta } from './lib/finalizePoolReady.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';
import {
  costUsdFromTokens,
  parseUsageMetadata,
} from './lib/generationCostLog.mjs';

loadEnvFile();

const SCAN_REPORT = path.join(ROOT, 'batches/ready/gate-logs/pool-german-explanation-scan.json');
const OUT_REPORT = path.join(
  ROOT,
  'batches/ready/gate-logs/pool-spanish-explanation-remediation.json',
);

const dryRun = process.argv.includes('--dry-run');
const quarantineOnly = process.argv.includes('--quarantine-only');
const repairOnly = process.argv.includes('--repair-only');

const REASON =
  'Q5 spanish explanation contamination (repair meta / non-German explanation in pool-verified)';

function loadTargetFiles() {
  if (!fs.existsSync(SCAN_REPORT)) {
    throw new Error(`Missing scan report: ${SCAN_REPORT} — run scan-pool-german-explanations.mjs first`);
  }
  const scan = JSON.parse(fs.readFileSync(SCAN_REPORT, 'utf8'));
  return [...new Set((scan.q5Hits || []).map((h) => path.basename(String(h.file))))].sort();
}

function jubilateSeedsForFiles(filenames, level = 'B1') {
  if (!fs.existsSync(POOL_FILE)) {
    console.warn('  seed file missing — skip jubilation');
    return [];
  }
  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const relPaths = new Set(
    filenames.map((f) => `batches/ready/pool-verified/${level}/${f}`.replace(/\\/g, '/')),
  );
  const touched = [];
  for (const rec of pool.records || []) {
    const sf = String(rec.sourceFile || '').replace(/\\/g, '/');
    if (!relPaths.has(sf)) continue;
    touched.push(rec.id);
    if (!dryRun) {
      rec.verified = false;
      rec.complete = false;
      rec.disabled = true;
      rec.jubilatedAt = new Date().toISOString();
      rec.jubilatedReason = REASON;
      delete rec.sem1VerifiedAt;
      delete rec.sem1Ok;
      delete rec.publishedAt;
    }
    console.log(`  seed jubilated: ${rec.id} (${sf})`);
  }
  if (!dryRun && touched.length) {
    const backup = `${POOL_FILE}.bak-spanish-expl-${Date.now()}`;
    fs.copyFileSync(POOL_FILE, backup);
    fs.writeFileSync(POOL_FILE, `${JSON.stringify(pool, null, 2)}\n`);
    console.log(`  backup: ${path.relative(ROOT, backup)}`);
  }
  return touched;
}

function quarantineFile(file, level = 'B1') {
  const src = path.join(poolVerifiedDir(level), file);
  if (!fs.existsSync(src)) {
    console.warn(`  skip (not in pool-verified): ${file}`);
    return null;
  }
  const batch = JSON.parse(fs.readFileSync(src, 'utf8'));
  const spanishCount = findSpanishExplanationFindings(batch).length;
  console.log(`  ${file}: ${spanishCount} Spanish explanation(s)`);

  const tagged = {
    ...batch,
    _poolRejectReason: REASON,
    _poolRejectAt: new Date().toISOString(),
    _poolRejectDetails: [`spanish_explanations=${spanishCount}`],
    _quarantinedAt: new Date().toISOString(),
    _quarantinedReason: 'spanish-explanation-pool-contamination',
  };

  const dest = path.join(needsRegenerationDir(level), file);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, `${JSON.stringify(tagged, null, 2)}\n`);
    fs.unlinkSync(src);
  }
  return { file, spanishCount, dest: path.relative(ROOT, dest).replace(/\\/g, '/') };
}

async function callLlm(opts) {
  const res = await generateContent({
    ...opts,
    thinkingConfig: SURGICAL_THINKING_CONFIG,
    jsonMode: true,
  });
  const usage = parseUsageMetadata(res.usageMetadata || res.usage);
  const costUsd = costUsdFromTokens(
    usage.promptTokens,
    usage.outputTokensBilled,
    usage.cachedContentTokenCount,
  );
  return { text: res.text, usage, costUsd };
}

function countSpanishExplanations(batch) {
  return findSpanishExplanationFindings(batch).length;
}

async function repairAndRepublishFile(file, level = 'B1') {
  const abs = path.join(needsRegenerationDir(level), file);
  if (!fs.existsSync(abs)) {
    return { file, error: 'not in needs-regeneration' };
  }

  let batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const before = countSpanishExplanations(batch);
  if (!before) {
    console.log(`  ${file}: already clean — republishing`);
  } else {
    let costUsd = 0;
    const trackedCallLlm = wrapSurgicalCallLlm(async (opts) => {
      const r = await callLlm(opts);
      costUsd += r.costUsd;
      return r;
    });
    const teil = Number(batch?.questions?.[0]?.teil ?? batch?.teil ?? 2);
    const repaired = await repairSpanishExplanationsInBatch(batch, trackedCallLlm, {
      teil,
      maxAttempts: 5,
      maxRounds: 5,
    });
    if (!repaired) {
      const afterPartial = countSpanishExplanations(batch);
      return { file, error: 'repair failed', before, after: afterPartial, costUsd };
    }
    batch = repaired;
    const after = countSpanishExplanations(batch);
    if (after > 0) {
      if (!dryRun) {
        fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`);
      }
      if (after === before) {
        return { file, error: 'still has spanish explanations', before, after, costUsd };
      }
      return { file, error: 'still has spanish explanations (partial progress saved)', before, after, costUsd };
    }

    const langGate = assertBatchGermanExamContent(batch, {
      lang: 'de',
      file: `remediate:${file}`,
    });
    if (!langGate.ok) {
      return {
        file,
        error: 'Q5 gate failed after repair',
        detail: langGate.findings?.[0]?.detail,
        costUsd,
      };
    }

    if (!dryRun) {
      const clean = stripPoolRejectMeta({
        ...batch,
        _spanishExplanationRemediatedAt: new Date().toISOString(),
        _spanishExplanationRemediatedReason: REASON,
      });
      writePoolVerified(file, clean, level);
      fs.unlinkSync(abs);
      await syncPoolVerifiedBatch({ file, batch: clean, level, opts: { lang: 'de' } });
    }

    return { file, ok: true, before, after: 0, costUsd, republished: !dryRun };
  }

  // already clean path
  const langGate = assertBatchGermanExamContent(batch, {
    lang: 'de',
    file: `remediate:${file}`,
  });
  if (!langGate.ok) {
    return { file, error: 'Q5 gate failed', detail: langGate.findings?.[0]?.detail };
  }
  if (!dryRun) {
    const clean = stripPoolRejectMeta(batch);
    writePoolVerified(file, clean, level);
    fs.unlinkSync(abs);
    await syncPoolVerifiedBatch({ file, batch: clean, level, opts: { lang: 'de' } });
  }
  return { file, ok: true, before: 0, after: 0, republished: !dryRun };
}

console.log(`\n══ Pool Spanish explanation remediation ${dryRun ? '(dry-run)' : ''} ══\n`);

let targetFiles = loadTargetFiles();
if (repairOnly) {
  targetFiles = targetFiles.filter((file) =>
    fs.existsSync(path.join(needsRegenerationDir('B1'), file)),
  );
  console.log(`Repair-only mode: ${targetFiles.length} file(s) in needs-regeneration\n`);
}
console.log(`Target files: ${targetFiles.length}\n`);

let quarantined = [];
let jubilated = [];
if (!repairOnly) {
  console.log('── Phase 1: quarantine ──');
  for (const file of targetFiles) {
    const r = quarantineFile(file);
    if (r) quarantined.push(r);
  }

  console.log('\n── seed jubilation ──');
  jubilated = jubilateSeedsForFiles(targetFiles);
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  reason: REASON,
  targetFiles,
  quarantined: repairOnly ? [] : quarantined,
  jubilated: repairOnly ? [] : jubilated,
  repaired: [],
  failed: [],
  totalCostUsd: 0,
};

if (quarantineOnly) {
  report.phase = 'quarantine-only';
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  fs.writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n══ Quarantine done: ${quarantined.length} files, ${jubilated.length} seeds ══`);
  process.exit(0);
}

console.log('\n── Phase 2: repair + re-publish ──');
for (const file of targetFiles) {
  console.log(`\n── ${file} ──`);
  try {
    const r = await repairAndRepublishFile(file);
    report.totalCostUsd += r.costUsd || 0;
    if (r.ok) {
      report.repaired.push(r);
      console.log(`  OK: ${r.before} → ${r.after} Spanish explanations, cost $${(r.costUsd || 0).toFixed(4)}`);
    } else {
      report.failed.push(r);
      console.warn(`  FAIL: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  } catch (e) {
    report.failed.push({ file, error: e.message });
    console.error(`  ERROR: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
fs.writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n══ Done: ${report.repaired.length}/${targetFiles.length} republished, ${report.failed.length} failed ══`);
console.log(`Total LLM cost: $${report.totalCostUsd.toFixed(4)}`);
console.log(`Report: ${path.relative(ROOT, OUT_REPORT)}`);

if (report.failed.length) process.exit(1);
