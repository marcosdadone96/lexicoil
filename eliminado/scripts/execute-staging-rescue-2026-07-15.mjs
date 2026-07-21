#!/usr/bin/env node
/**
 * Execute staging rescue: 92 repairable files (40 stamp_only + 5 free_code + 47 surgical).
 * Publishes to library/reusable-seed/de_B1.json with backup.
 *
 *   node scripts/execute-staging-rescue-2026-07-15.mjs
 *   node scripts/execute-staging-rescue-2026-07-15.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';
import { validateExamBatch } from './lib/pasteExamBatchLib.mjs';
import { validateLesenBatch } from './lib/pasteLesenBatchLib.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';
import { runSurgicalRepair } from './lib/surgicalRepairRouter.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkPromptBatchQuality } from './lib/promptBatchQuality.mjs';
import {
  publishExamBatchToPool,
  publishLesenBatchToPool,
} from './lib/publishToPool.mjs';
import { callLlm } from './generate-lesen-part-gemini.mjs';
import { resolveMaxOutputTokens } from './lib/genOutputTokens.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { partPassesPublishGate } = require(path.join(ROOT, 'netlify/functions/lib/partPublishGate.js'));
const { partPassesAssembleMode } = require(path.join(ROOT, 'netlify/functions/lib/officialQuarantine.js'));
const { loadSeedRecords, clearLocalSeedCache } = require(path.join(ROOT, 'netlify/functions/lib/reusablePartsLocalSeed.js'));

const TRIAGE = path.join(ROOT, 'batches/ready/gate-logs/staging-surgical-triage-2026-07-15.json');
const PUBLISH_AUDIT = path.join(ROOT, 'batches/ready/gate-logs/publish-pool-verified-2026-07-15.json');
const SEED_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const BACKUP_DIR = path.join(ROOT, 'library/reusable-seed/backups');
const OUT = path.join(ROOT, 'batches/ready/gate-logs/execute-staging-rescue-2026-07-15.json');

const dryRun = process.argv.includes('--dry-run');
const quiet = process.argv.includes('--quiet');
const retryFailed = process.argv.includes('--retry-failed');
const PREV_REPORT = OUT;

const TEILE = { lesen: [1, 2, 3, 4, 5], horen: [1, 2, 3, 4] };
const CUSHION_MIN_ADD = 3;
const CUSHION_PCT = 0.25;

const USAGE_PROFILES = {
  pro_early: { exams: 4, personalLesen: 10, personalHoren: 8 },
};

function inferFromFilename(relFile) {
  const base = path.basename(relFile);
  if (/^lesen-t(\d+)/i.test(base)) return { module: 'lesen', teil: Number(base.match(/^lesen-t(\d+)/i)[1]) };
  if (/^horen-t(\d+)/i.test(base)) return { module: 'horen', teil: Number(base.match(/^horen-t(\d+)/i)[1]) };
  if (base.startsWith('schreiben')) return { module: 'schreiben', teil: null };
  if (base.startsWith('sprechen')) return { module: 'sprechen', teil: null };
  return { module: null, teil: null };
}

function bankDupIssues(batch) {
  const bankPath = path.join(ROOT, 'library/de/B1/questions.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const bankIds = new Set((bank.questions || []).map((q) => q.id));
  return (batch.questions || []).filter((q) => bankIds.has(q.id)).map((q) => q.id);
}

function extractIssues(auditRow, batch) {
  const hint = inferFromFilename(auditRow.relFile);
  const module = auditRow.module || hint.module;
  const teil = auditRow.teil ?? hint.teil;
  const issues = [];
  let gate = 'unknown';

  if (auditRow.category === 'validation_fail') {
    const dups = bankDupIssues(batch);
    if (dups.length > 0) {
      issues.push(...dups.map((id) => `${id}: id ya existe en el banco`));
      gate = 'audit2';
    }
    if (auditRow.reason === 'Calidad pedagógica falló') {
      const mod = String(module || 'lesen').toLowerCase();
      let q;
      if (mod === 'lesen') q = checkLesenBatchQuality(batch, teil);
      else if (mod === 'horen') q = checkHorenBatchQuality(batch, teil);
      else q = checkPromptBatchQuality(batch, mod, teil, { lang: 'de', level: 'B1' });
      if (!q.ok) {
        issues.push(...(q.issues || []));
        gate = 'calidad';
      }
    } else if (auditRow.reason === 'Auditoría pedagógica IMPORTANT — revisa el JSON') {
      gate = 'audit2';
      for (const b of auditRow.detail?.blocking || []) {
        issues.push(`[${b.severity}][${b.chk}] ${b.message}`);
      }
    } else if (auditRow.reason === 'Vocabulario C1/C2 encontrado — revisa el JSON') {
      gate = 'lexico';
      issues.push(auditRow.reason);
    }
  }

  if (auditRow.category === 'gate_fail' && auditRow.reason === 'isPartPoolReady') {
    gate = 'audit2';
    for (const b of auditRow.detail?.blocking || []) {
      issues.push(`[${b.severity}][${b.chk}] ${b.message}`);
    }
  }

  return { issues, gate, module, teil };
}

async function validateBatchForPublish(batch, relFile) {
  const hint = inferFromFilename(relFile);
  const baseArgs = { lang: 'de', level: 'B1', allowBankDup: false };
  if (hint.module === 'lesen') {
    return validateLesenBatch(batch, baseArgs, {
      teil: hint.teil ?? batch.questions?.[0]?.teil,
      label: path.basename(relFile),
    });
  }
  return validateExamBatch(
    batch,
    { ...baseArgs, module: hint.module, teil: hint.teil },
    { teil: hint.teil ?? batch.questions?.[0]?.teil, label: path.basename(relFile) },
  );
}

function buildSeedRows(module) {
  return loadSeedRecords('de', 'B1')
    .filter((r) => {
      if (String(r.module).toLowerCase() !== module) return false;
      if (!partPassesPublishGate(r)) return false;
      if (!partPassesAssembleMode(r, 'practice')) return false;
      return r.complete !== false && r.verified !== false;
    })
    .map((rec) => ({ id: rec.id, teil: Number(rec.teil) }));
}

function currentStockByTeil() {
  const out = { lesen: {}, horen: {} };
  for (const mod of ['lesen', 'horen']) {
    const rows = buildSeedRows(mod);
    for (const t of TEILE[mod]) {
      out[mod][t] = rows.filter((r) => r.teil === t).length;
    }
  }
  return out;
}

function withCushion(minVal) {
  return Math.ceil(minVal * (1 + CUSHION_PCT) + CUSHION_MIN_ADD);
}

function cushionDeficitTable(stock) {
  const profile = USAGE_PROFILES.pro_early;
  const minLh = {
    lesen: Object.fromEntries(TEILE.lesen.map((t) => [t, profile.exams + profile.personalLesen])),
    horen: Object.fromEntries(TEILE.horen.map((t) => [t, profile.exams + profile.personalHoren])),
  };
  const targetLh = {
    lesen: Object.fromEntries(TEILE.lesen.map((t) => [t, withCushion(minLh.lesen[t])])),
    horen: Object.fromEntries(TEILE.horen.map((t) => [t, withCushion(minLh.horen[t])])),
  };
  const cells = [];
  let total = 0;
  for (const mod of ['lesen', 'horen']) {
    for (const t of TEILE[mod]) {
      const have = stock[mod][t] || 0;
      const need = targetLh[mod][t];
      const deficit = Math.max(0, need - have);
      cells.push({
        cell: `${mod} T${t}`,
        module: mod,
        teil: t,
        stock: have,
        bindingMin: minLh[mod][t],
        targetWithCushion: need,
        toGenerate: deficit,
      });
      total += deficit;
    }
  }
  return { cells, total, bindingMin: minLh, targetWithCushion: targetLh };
}

function createLlmSession() {
  return {
    provider: 'gemini',
    model: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    maxApiCalls: 60,
    minPauseMs: Math.max(1500, Number(process.env.GEMINI_BATCH_PAUSE_MS || 1500)),
    apiCallsUsed: 0,
    totalAttempts: 0,
    lastApiCallAt: 0,
    stopped: false,
    stopReason: null,
  };
}

const llmArgs = { lang: 'de', level: 'B1', pauseMs: 1500, provider: 'gemini' };
const session = createLlmSession();

async function runPoolGate(batch, relFile) {
  const restore = quiet
    ? () => {
        const o = console.log;
        console.log = () => {};
        return o;
      }
    : () => console.log;
  const prev = restore();
  try {
    return await isPartPoolReady(batch, { allowFailures: false, semantic: false, skipSem2: true });
  } finally {
    if (quiet) console.log = prev;
  }
}

async function publishOne(relFile, batch, check) {
  const opts = {
    lang: 'de',
    level: 'B1',
    teil: check.teil,
    sourceFile: relFile,
    contributor: 'staging-rescue-2026-07-15',
    skipLock: true,
  };
  if (check.module === 'lesen') {
    return publishLesenBatchToPool(batch, {
      ...opts,
      topicTag: batch.passages?.[0]?.topicTag || batch.topicTag,
      forceTopicTag: batch._requestedTopic || batch._resolvedTopic || null,
    });
  }
  return publishExamBatchToPool(batch, { ...opts, module: check.module });
}

async function processEntry(entry, auditByFile) {
  const relFile = entry.relFile;
  const abs = path.join(ROOT, relFile);
  const result = {
    relFile,
    bucket: entry.bucket,
    subreason: entry.subreason,
    stage: null,
    published: false,
    duplicate: false,
    error: null,
  };

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    result.stage = 'parse_error';
    result.error = err.message;
    return result;
  }

  const hint = inferFromFilename(relFile);
  const module = entry.module || hint.module;
  const teil = entry.teil ?? hint.teil;

  try {
    if (entry.bucket === 'free_code') {
      const auditRow = auditByFile.get(relFile);
      const { issues, gate } = auditRow ? extractIssues(auditRow, batch) : { issues: [], gate: 'audit2' };
      let triage = entry.triage || classifyAndRepair(batch, { gate, issues });
      if (triage.repaired === true && triage.batch) {
        batch = triage.batch;
      } else {
        batch = applyGermanCapsNormalize(batch, { decapOnly: true }).batch;
      }
      batch = applyGermanCapsNormalize(batch, { decapOnly: true }).batch;
      result.stage = 'free_code_repaired';
      if (!dryRun) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    } else if (entry.bucket === 'surgical') {
      const auditRow = auditByFile.get(relFile);
      const { issues, gate } = auditRow ? extractIssues(auditRow, batch) : { issues: [], gate: 'calidad' };
      const triage = classifyAndRepair(batch, { gate, issues });
      if (triage.repaired !== 'targeted' || !triage.repairKind) {
        result.stage = 'surgical_skip';
        result.error = 'no_targeted_repair_kind';
        return result;
      }
      const maxTokens = resolveMaxOutputTokens('gemini', module, teil);
      const repaired = await runSurgicalRepair(triage, batch, {
        teil,
        module,
        callLlm: (opts) => callLlm(session, llmArgs, opts),
        maxTokens,
        lang: 'de',
        level: 'B1',
        issues,
      });
      if (!repaired) {
        result.stage = 'surgical_failed';
        result.error = 'runSurgicalRepair returned null';
        return result;
      }
      batch = repaired;
      batch = applyGermanCapsNormalize(batch, { decapOnly: true }).batch;
      result.stage = 'surgical_repaired';
      if (!dryRun) fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    } else if (entry.bucket === 'stamp_only') {
      result.stage = 'stamp_only';
    } else {
      result.stage = 'skipped';
      result.error = `unexpected bucket ${entry.bucket}`;
      return result;
    }

    const check = await validateBatchForPublish(batch, relFile);
    if (!check.ok) {
      result.stage = `${result.stage || 'gate'}_validation_fail`;
      result.error = (check.errors || []).join('; ');
      return result;
    }

    const gate = await runPoolGate(batch, relFile);
    if (!gate.ok) {
      result.stage = `${result.stage || 'gate'}_pool_fail`;
      result.error = (gate.blocking || []).slice(0, 3).map((f) => f.message).join('; ');
      return result;
    }

    if (dryRun) {
      result.stage = `${result.stage}_dry_run_ok`;
      return result;
    }

    const pub = await publishOne(relFile, batch, { module: check.module || module, teil: check.teil ?? teil });
    if (pub.ok && !pub.duplicate) {
      result.published = true;
      result.stage = `${result.stage}_published`;
      result.recordId = pub.recordId || pub.id;
    } else if (pub.ok && pub.duplicate) {
      result.duplicate = true;
      result.stage = `${result.stage}_duplicate`;
    } else {
      result.error = pub.error || pub.reason || 'publish_failed';
      result.stage = `${result.stage}_publish_fail`;
    }
  } catch (err) {
    result.error = err.message || String(err);
    result.stage = `${result.stage || 'error'}_exception`;
  }

  return result;
}

async function main() {
  const triage = JSON.parse(fs.readFileSync(TRIAGE, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(PUBLISH_AUDIT, 'utf8'));
  const auditByFile = new Map(audit.audit.map((a) => [a.relFile, a]));

  let targets = triage.results.filter((r) =>
    ['stamp_only', 'free_code', 'surgical'].includes(r.bucket),
  );

  if (retryFailed && fs.existsSync(PREV_REPORT)) {
    const prev = JSON.parse(fs.readFileSync(PREV_REPORT, 'utf8'));
    const failedSet = new Set(
      prev.results
        .filter((r) => !r.published && !r.duplicate)
        .map((r) => r.relFile),
    );
    targets = targets.filter((r) => failedSet.has(r.relFile));
    console.log(`--retry-failed: ${targets.length} archivos`);
  }

  const stockBefore = currentStockByTeil();
  const seedCountBefore = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')).records?.length || 0;

  let backupPath = null;
  if (!dryRun && !retryFailed) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(BACKUP_DIR, `de_B1_pre-staging-rescue-${stamp}.json`);
    fs.copyFileSync(SEED_FILE, backupPath);
    console.log(`Backup: ${path.relative(ROOT, backupPath)}`);
  }

  const order = { free_code: 0, stamp_only: 1, surgical: 2 };
  targets.sort((a, b) => (order[a.bucket] ?? 9) - (order[b.bucket] ?? 9) || a.relFile.localeCompare(b.relFile));

  console.log(`Rescue ${targets.length} files (${dryRun ? 'DRY-RUN' : 'LIVE'})…`);
  const results = [];
  let published = 0;
  let duplicates = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    if (!quiet) console.log(`[${i + 1}/${targets.length}] ${entry.bucket} · ${path.basename(entry.relFile)}`);
    const row = await processEntry(entry, auditByFile);
    results.push(row);
    if (row.published) published++;
    else if (row.duplicate) duplicates++;
    else if (!row.stage?.includes('dry_run_ok')) failed++;
  }

  if (!dryRun) clearLocalSeedCache();
  const stockAfter = dryRun ? stockBefore : currentStockByTeil();
  const seedCountAfter = dryRun
    ? seedCountBefore
    : JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')).records?.length || 0;
  const cushion = cushionDeficitTable(stockAfter);

  const byBucket = {};
  for (const r of results) {
    const key = r.published ? 'published' : r.duplicate ? 'duplicate' : r.stage?.includes('dry_run_ok') ? 'dry_run_ok' : 'failed';
    byBucket[`${r.bucket}:${key}`] = (byBucket[`${r.bucket}:${key}`] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry_run' : 'execute',
    backup: backupPath ? path.relative(ROOT, backupPath) : null,
    seedCountBefore,
    seedCountAfter,
    seedGain: seedCountAfter - seedCountBefore,
    stockBefore,
    stockAfter,
    published,
    duplicates,
    failed,
    apiCallsUsed: session.apiCallsUsed,
    byBucket,
    cushionDeficit: cushion,
    results,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n── Rescue summary ──');
  console.log(`  published: ${published}, duplicates: ${duplicates}, failed: ${failed}`);
  console.log(`  seed: ${seedCountBefore} → ${seedCountAfter} (+${seedCountAfter - seedCountBefore})`);
  console.log(`  API calls: ${session.apiCallsUsed}`);
  console.log(`  cushion deficit total: ${cushion.total} LH parts`);
  console.log(`Report: ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
