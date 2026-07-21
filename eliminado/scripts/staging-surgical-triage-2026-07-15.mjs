#!/usr/bin/env node
/**
 * Triage 178 staging publish-failures: surgical rescue vs full regen.
 * Uses publish audit + fast local gates (no full isPartPoolReady re-run).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { classifyAndRepair } from './lib/repairTriage.mjs';
import { SURGICAL_REPAIR_KINDS } from './lib/surgicalRepairRouter.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality, formatHorenQualityReport } from './lib/horenBatchQuality.mjs';
import { checkPromptBatchQuality, formatPromptQualityReport } from './lib/promptBatchQuality.mjs';

const require = createRequire(import.meta.url);
const OUT = path.join(ROOT, 'batches/ready/gate-logs/staging-surgical-triage-2026-07-15.json');
const PUBLISH_AUDIT = path.join(ROOT, 'batches/ready/gate-logs/publish-pool-verified-2026-07-15.json');
const DEFICIT = path.join(ROOT, 'batches/ready/gate-logs/post-publish-deficit-2026-07-15.json');

const COST_FULL_OK = 0.1508;
const COST_SURGICAL_CALL = 0.00055; // verify-opt-2026-07-13 measured avg
const SURGICAL_SUCCESS_RATE = 0.75; // conservative for staging rescue (pool-verified baseline)

const IRREPARABLE_CHK = new Set([
  'CHK-1', 'CHK-2', 'CHK-3', 'CHK-5', 'CHK-9', 'CHK-11', 'CHK-21', 'CHK-22', 'CHK-23',
  'CHK-26', 'CHK-27', 'CHK-29', 'DEDUP', 'POOL-DEDUP',
]);

const FREE_CHK = new Set(['CHK-14', 'CHK-13', 'CHK-19', 'CHK-17', 'CHK-8', 'CHK-4', 'CHK-12']);

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
  const dups = (batch.questions || []).filter((q) => bankIds.has(q.id)).map((q) => q.id);
  return dups;
}

function runQuality(batch, module, teil) {
  const mod = String(module || 'lesen').toLowerCase();
  if (mod === 'lesen') return checkLesenBatchQuality(batch, teil);
  if (mod === 'horen') return checkHorenBatchQuality(batch, teil);
  if (mod === 'schreiben' || mod === 'sprechen') {
    return checkPromptBatchQuality(batch, mod, teil, { lang: 'de', level: 'B1' });
  }
  return { ok: true, issues: [], warnings: [] };
}

function triageFromIssues(batch, gate, issues) {
  const gates = { gate, issues: issues || [] };
  const triage = classifyAndRepair(batch, gates);
  return triage;
}

function classifyEntry(auditRow, batch) {
  const hint = inferFromFilename(auditRow.relFile);
  const module = auditRow.module || hint.module;
  const teil = auditRow.teil ?? hint.teil;

  // False positive: passed POOL-2, only unstamped publish gate
  if (auditRow.reason === 'partPassesPublishGate') {
    return {
      bucket: 'stamp_only',
      subreason: 'passed_pool2_needs_publish_stamp',
      repairCostUsd: 0,
      expectedGain: 1,
      triage: null,
    };
  }

  const issues = [];
  let gate = 'unknown';

  if (auditRow.category === 'validation_fail') {
    const dups = bankDupIssues(batch);
    if (dups.length > 0) {
      const total = (batch.questions || []).length;
      if (dups.length >= total * 0.5) {
        return {
          bucket: 'irreparable',
          subreason: 'bank_dup_ids',
          repairCostUsd: 0,
          expectedGain: 0,
          detail: { dupCount: dups.length, total },
        };
      }
      issues.push(...dups.map((id) => `${id}: id ya existe en el banco`));
      gate = 'audit2';
    }

    if (auditRow.reason === 'Calidad pedagógica falló') {
      const q = runQuality(batch, module, teil);
      if (!q.ok) {
        issues.push(...(q.issues || []));
        gate = 'calidad';
      }
    } else if (auditRow.reason === 'Auditoría pedagógica IMPORTANT — revisa el JSON') {
      gate = 'audit2';
      if (auditRow.detail?.blocking) {
        for (const b of auditRow.detail.blocking) {
          issues.push(`[${b.severity}][${b.chk}] ${b.message}`);
        }
      }
    } else if (auditRow.reason === 'Vocabulario C1/C2 encontrado — revisa el JSON') {
      gate = 'lexico';
      issues.push(auditRow.reason);
    } else if (auditRow.reason === 'Validación técnica falló' && issues.length === 0) {
      return {
        bucket: 'irreparable',
        subreason: 'technical_validation_other',
        repairCostUsd: 0,
        expectedGain: 0,
      };
    }
  }

  if (auditRow.category === 'gate_fail' && auditRow.reason === 'isPartPoolReady') {
    gate = 'audit2';
    for (const b of auditRow.detail?.blocking || []) {
      issues.push(`[${b.severity}][${b.chk}] ${b.message}`);
    }
  }

  if (!issues.length) {
    return {
      bucket: 'irreparable',
      subreason: 'no_issues_extracted',
      repairCostUsd: 0,
      expectedGain: 0,
    };
  }

  const chkCodes = [...new Set(issues.flatMap((i) => [...String(i).matchAll(/CHK-(\d+)/g)].map((m) => `CHK-${m[1]}`)))];
  if (chkCodes.some((c) => IRREPARABLE_CHK.has(c))) {
    return {
      bucket: 'irreparable',
      subreason: `structural_chk:${chkCodes.filter((c) => IRREPARABLE_CHK.has(c)).join(',')}`,
      repairCostUsd: 0,
      expectedGain: 0,
      chkCodes,
    };
  }

  const triage = triageFromIssues(batch, gate, issues);

  if (triage.discard) {
    return {
      bucket: 'irreparable',
      subreason: triage.reason || 'triage_discard',
      repairCostUsd: 0,
      expectedGain: 0,
      triage,
      chkCodes,
    };
  }

  if (triage.repaired === true && !triage.calledLlm) {
    return {
      bucket: 'free_code',
      subreason: triage.cube === 'B' ? 'lexico_substitution' : `cube_${triage.cube}`,
      repairCostUsd: 0,
      expectedGain: 1,
      triage,
      chkCodes,
    };
  }

  if (triage.repaired === 'targeted' || triage.partialOnly) {
    const kind = triage.repairKind || 'generic_targeted';
    const surgical = kind && (SURGICAL_REPAIR_KINDS?.has?.(kind) ?? ['word_match', 'mcq_distinct', 'explanation', 'passage_length', 'mcq_length_bias', 'lexico'].includes(kind));
    return {
      bucket: surgical ? 'surgical' : 'irreparable',
      subreason: surgical ? `surgical:${kind}` : `targeted_no_kind:${kind}`,
      repairCostUsd: surgical ? COST_SURGICAL_CALL : 0,
      expectedGain: surgical ? SURGICAL_SUCCESS_RATE : 0,
      triage,
      chkCodes,
      repairKind: kind,
    };
  }

  // Only free CHK codes in blocking
  if (chkCodes.length && chkCodes.every((c) => FREE_CHK.has(c))) {
    return {
      bucket: 'free_code',
      subreason: 'chk_codes_only_free',
      repairCostUsd: 0,
      expectedGain: 1,
      chkCodes,
    };
  }

  // CHK-18 / CHK-6 without triage repairKind — default surgical
  if (chkCodes.includes('CHK-18') || chkCodes.includes('CHK-6')) {
    const kind = chkCodes.includes('CHK-18') ? 'explanation' : 'lexico';
    return {
      bucket: 'surgical',
      subreason: `surgical:${kind}`,
      repairCostUsd: COST_SURGICAL_CALL,
      expectedGain: SURGICAL_SUCCESS_RATE,
      chkCodes,
      repairKind: kind,
    };
  }

  if (gate === 'calidad' && issues.length < 6) {
    return {
      bucket: 'surgical',
      subreason: 'calidad_few_issues',
      repairCostUsd: COST_SURGICAL_CALL,
      expectedGain: SURGICAL_SUCCESS_RATE,
      chkCodes,
    };
  }

  return {
    bucket: 'irreparable',
    subreason: 'unclassified',
    repairCostUsd: 0,
    expectedGain: 0,
    triage,
    chkCodes,
    issueCount: issues.length,
  };
}

function main() {
  const audit = JSON.parse(fs.readFileSync(PUBLISH_AUDIT, 'utf8'));
  const deficit = JSON.parse(fs.readFileSync(DEFICIT, 'utf8'));
  const failed = audit.audit.filter((a) => a.category === 'validation_fail' || a.category === 'gate_fail');

  const results = [];
  const summary = {
    total: failed.length,
    byBucket: {},
    byTeil: {},
    horenT3: { total: 0, byBucket: {} },
  };

  for (const row of failed) {
    const abs = path.join(ROOT, row.relFile);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      results.push({ ...row, bucket: 'irreparable', subreason: 'parse_error' });
      continue;
    }
    const c = classifyEntry(row, batch);
    const entry = {
      relFile: row.relFile,
      module: row.module,
      teil: row.teil,
      auditCategory: row.category,
      auditReason: row.reason,
      ...c,
    };
    results.push(entry);

    summary.byBucket[c.bucket] = (summary.byBucket[c.bucket] || 0) + 1;
    const tk = `${row.module || '?'} T${row.teil ?? '?'}`;
    summary.byTeil[tk] = summary.byTeil[tk] || {};
    summary.byTeil[tk][c.bucket] = (summary.byTeil[tk][c.bucket] || 0) + 1;

    if (row.module === 'horen' && Number(row.teil) === 3) {
      summary.horenT3.total++;
      summary.horenT3.byBucket[c.bucket] = (summary.horenT3.byBucket[c.bucket] || 0) + 1;
    }
  }

  const stampOnly = summary.byBucket.stamp_only || 0;
  const freeCode = summary.byBucket.free_code || 0;
  const surgical = summary.byBucket.surgical || 0;
  const irreparable = summary.byBucket.irreparable || 0;

  const expectedPartsFromRescue =
    stampOnly * 1 +
    freeCode * 1 +
    surgical * SURGICAL_SUCCESS_RATE;

  const rescueCostUsd = surgical * COST_SURGICAL_CALL;

  const proDeficit = deficit.deficitByPlan?.pro?.partsToGenerate || 268;
  const remainingAfterRescue = Math.max(0, proDeficit - expectedPartsFromRescue);
  const regenCostAfterRescue = remainingAfterRescue * COST_FULL_OK;
  const combinedCost = rescueCostUsd + regenCostAfterRescue;
  const fullRegenCost = proDeficit * COST_FULL_OK;

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      publishAudit: 'publish-pool-verified-2026-07-15.json',
      failedCount: failed.length,
      costAssumptions: {
        COST_FULL_OK,
        COST_SURGICAL_CALL,
        SURGICAL_SUCCESS_RATE,
        source: 'verify-opt-2026-07-13 + pair-pool-viability-2026-07-13',
      },
    },
    summary,
    costComparison: {
      pathA_fullRegen268: { parts: proDeficit, costUsd: Number(fullRegenCost.toFixed(2)) },
      pathC_combined: {
        stampOnlyFree: stampOnly,
        freeCodeRepairs: freeCode,
        surgicalAttempts: surgical,
        surgicalCostUsd: Number(rescueCostUsd.toFixed(4)),
        expectedPartsFromRescue: Number(expectedPartsFromRescue.toFixed(1)),
        irreparableNeedFullRegen: irreparable,
        remainingDeficitAfterRescue: Number(remainingAfterRescue.toFixed(1)),
        regenCostUsd: Number(regenCostAfterRescue.toFixed(2)),
        totalCostUsd: Number(combinedCost.toFixed(2)),
        savingsVsFullRegenUsd: Number((fullRegenCost - combinedCost).toFixed(2)),
        savingsPct: Number(((1 - combinedCost / fullRegenCost) * 100).toFixed(1)),
      },
    },
    results,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    summary: report.summary,
    costComparison: report.costComparison,
    out: path.relative(ROOT, OUT),
  }, null, 2));
}

main();
