#!/usr/bin/env node
/**
 * pool-sanitize-audit.mjs — Re-audit reusable-seed with POOL-2 (semantic:false).
 * Read-only triage for sanitization planning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POOL_FILE = path.join(ROOT, 'library/reusable-seed/de_B1.json');
const PRIORITY_TOPICS = ['Technik', 'Bildung', 'Ernährung'];

/** Align with repairTriage Cubo A (+ CHK-8 dup, CHK-4/12 balance family). */
const CODE_REPAIRABLE = new Set(['CHK-14', 'CHK-13', 'CHK-19', 'CHK-17', 'CHK-8', 'CHK-4', 'CHK-12']);

/** Content / must jubilar or regenerate (no code-only fix today). */
const CONTENT_FATAL = new Set([
  'CHK-7', 'CHK-16', 'CHK-15', 'CHK-18', 'CHK-10', 'CHK-21', 'CHK-22', 'CHK-23', 'CHK-26', 'CHK-27',
  'CHK-11', 'CHK-20', 'CHK-2', 'CHK-1', 'CHK-3', 'CHK-6', 'CHK-26', 'CHK-5', 'CHK-9',
  'AUDIT-ERROR', 'DEDUP',
]);

function partBucket(blocking) {
  const ids = [...new Set(blocking.map((f) => f.id))];
  if (!ids.length) return 'ok';
  const hasContent = ids.some((id) => CONTENT_FATAL.has(id));
  const allCode = ids.every((id) => CODE_REPAIRABLE.has(id));
  if (allCode && !hasContent) return 'code';
  if (hasContent) return 'content';
  return 'mixed'; // unknown CHK → treat as content-safe / manual
}

function summarizeFindings(blocking) {
  const byChk = {};
  for (const f of blocking) {
    if (!byChk[f.id]) byChk[f.id] = { CRITICAL: 0, IMPORTANT: 0, MINOR: 0, parts: new Set() };
    byChk[f.id][f.severity] = (byChk[f.id][f.severity] || 0) + 1;
  }
  return byChk;
}

async function main() {
  const { isPartPoolReady } = await import('./audit-pass-2.mjs');
  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  const all = pool.records || [];
  const served = all.filter((r) => r.verified === true && r.complete !== false);

  const report = {
    generated: new Date().toISOString(),
    poolFile: POOL_FILE,
    totals: { all: all.length, served: served.length },
    global: { ok: 0, fail: 0, buckets: { code: 0, content: 0, mixed: 0 } },
    byChk: {},
    priorityTopics: {},
    failures: [],
    structOkForSem1: [],
  };

  for (const topic of PRIORITY_TOPICS) {
    report.priorityTopics[topic] = {
      served: 0, ok: 0, fail: 0,
      buckets: { code: 0, content: 0, mixed: 0 },
      sem1Candidates: 0,
      failures: [],
    };
  }

  for (const rec of served) {
    const gate = await isPartPoolReady(rec, { semantic: false });
    const topic = rec.topicTag || '_none';
    const pri = PRIORITY_TOPICS.includes(topic);
    if (pri) report.priorityTopics[topic].served++;

    const entry = {
      id: rec.id,
      module: rec.module,
      teil: rec.teil,
      topicTag: topic,
      bank: String(rec.id || '').startsWith('bank-'),
      blocking: (gate.blocking || []).map((f) => ({
        id: f.id,
        severity: f.severity,
        scope: f.scope,
        message: String(f.message || '').slice(0, 120),
      })),
    };

    if (gate.ok) {
      report.global.ok++;
      if (pri) {
        report.priorityTopics[topic].ok++;
        const m = String(rec.module || '').toLowerCase();
        if (m !== 'schreiben' && m !== 'sprechen') {
          report.priorityTopics[topic].sem1Candidates++;
          report.structOkForSem1.push({
            id: rec.id,
            module: rec.module,
            teil: rec.teil,
            topicTag: topic,
          });
        }
      }
      continue;
    }

    report.global.fail++;
    const bucket = partBucket(gate.blocking || []);
    report.global.buckets[bucket]++;

    entry.bucket = bucket;
    entry.chkIds = [...new Set((gate.blocking || []).map((f) => f.id))];
    report.failures.push(entry);

    if (pri) {
      report.priorityTopics[topic].fail++;
      report.priorityTopics[topic].buckets[bucket]++;
      report.priorityTopics[topic].failures.push({
        id: entry.id,
        module: entry.module,
        teil: entry.teil,
        bucket,
        chkIds: entry.chkIds,
      });
    }

    for (const f of gate.blocking || []) {
      if (!report.byChk[f.id]) {
        report.byChk[f.id] = { CRITICAL: 0, IMPORTANT: 0, parts: new Set() };
      }
      report.byChk[f.id][f.severity] = (report.byChk[f.id][f.severity] || 0) + 1;
      report.byChk[f.id].parts.add(rec.id);
    }
  }

  // Serialize sets
  const byChkOut = {};
  for (const [chk, v] of Object.entries(report.byChk)) {
    byChkOut[chk] = {
      CRITICAL: v.CRITICAL || 0,
      IMPORTANT: v.IMPORTANT || 0,
      uniqueParts: v.parts.size,
    };
  }
  report.byChk = byChkOut;

  const outJson = path.join(ROOT, 'scripts/pool-sanitize-audit-report.json');
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // Console summary
  console.log('=== POOL SANITIZE AUDIT (POOL-2 semantic:false) ===\n');
  console.log(`Served (verified): ${served.length}`);
  console.log(`OK: ${report.global.ok}  FAIL: ${report.global.fail}`);
  console.log(`Buckets: code=${report.global.buckets.code} content=${report.global.buckets.content} mixed=${report.global.buckets.mixed}\n`);

  console.log('--- Failures by CHK (finding count / unique parts) ---');
  for (const [chk, v] of Object.entries(byChkOut).sort((a, b) => b[1].uniqueParts - a[1].uniqueParts)) {
    console.log(
      `  ${chk.padEnd(12)} parts=${String(v.uniqueParts).padStart(3)}  CRIT=${v.CRITICAL || 0}  IMP=${v.IMPORTANT || 0}`,
    );
  }

  console.log('\n--- Priority topics ---');
  for (const t of PRIORITY_TOPICS) {
    const p = report.priorityTopics[t];
    console.log(
      `  ${t}: served=${p.served} ok=${p.ok} fail=${p.fail} | code=${p.buckets.code} content=${p.buckets.content} mixed=${p.buckets.mixed} | SEM-1 candidates (struct OK, MCQ)=${p.sem1Candidates}`,
    );
  }

  const priSem1 = PRIORITY_TOPICS.reduce((n, t) => n + report.priorityTopics[t].sem1Candidates, 0);
  console.log(`\nSEM-1 calls (priority themes, struct-OK MCQ only): ${priSem1}`);
  console.log(`Full report: ${path.relative(ROOT, outJson)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
