#!/usr/bin/env node
/**
 * Deterministic repair for 15 A2 curated pool files (CHK-4 balanceMcq + CHK-8 dup IDs + Lesen T2 society passage swap).
 *   node scripts/repair-a2-curated-critical.mjs           # dry-run
 *   node scripts/repair-a2-curated-critical.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import { poolVerifiedDir } from './lib/batchPaths.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';
import { syncPoolVerifiedBatch } from './lib/autoSyncPersonalPoolLib.mjs';

loadEnvFile();

const BANK_PATH = path.join(ROOT, 'library/de/A2/questions.json');
const LESEN_T2_SOCIETY_PASSAGE = 'de-a2-p-lesen-t2-einkauf-online-lokal-01';

const TARGET_FILES = [
  'horen-t1-cur-education.json',
  'horen-t3-cur-health.json',
  'horen-t3-cur-society.json',
  'lesen-t1-cur-education.json',
  'lesen-t1-cur-health.json',
  'lesen-t1-cur-society.json',
  'lesen-t1-cur-work.json',
  'lesen-t2-cur-society.json',
  'lesen-t3-cur-education.json',
  'lesen-t3-cur-health.json',
  'lesen-t3-cur-society.json',
  'lesen-t3-cur-work.json',
  'lesen-t4-cur-health.json',
  'lesen-t4-cur-society.json',
  'lesen-t4-cur-work.json',
];

const NEEDS_BALANCE = new Set([
  'horen-t1-cur-education.json',
  'horen-t3-cur-health.json',
  'horen-t3-cur-society.json',
  'lesen-t1-cur-education.json',
  'lesen-t1-cur-work.json',
  'lesen-t3-cur-education.json',
  'lesen-t3-cur-health.json',
  'lesen-t3-cur-society.json',
  'lesen-t2-cur-society.json', // bank swap leaves 100% "a" — balance after swap
]);

const NEEDS_ID_RENAME = new Set([
  'lesen-t1-cur-health.json',
  'lesen-t1-cur-society.json',
  'lesen-t1-cur-work.json',
  'lesen-t2-cur-society.json',
  'lesen-t3-cur-education.json',
  'lesen-t3-cur-society.json',
  'lesen-t3-cur-work.json',
  'lesen-t4-cur-health.json',
  'lesen-t4-cur-society.json',
  'lesen-t4-cur-work.json',
]);

const NEEDS_LESEN_T2_SWAP = new Set(['lesen-t2-cur-society.json']);

function parseMeta(filename) {
  const m = /^(\w+)-t(\d+)-cur-(\w+)\.json$/.exec(filename);
  if (!m) throw new Error(`Cannot parse filename: ${filename}`);
  return { module: m[1], teil: Number(m[2]), topic: m[3] };
}

function pickPoolFields(obj, keep = []) {
  const base = {
    id: obj.id,
    type: obj.type,
    question: obj.question,
    options: obj.options,
    correct: obj.correct,
    correctAnswer: obj.correctAnswer,
    explanation: obj.explanation,
    passageId: obj.passageId,
    module: obj.module,
    teil: obj.teil,
    level: obj.level || 'A2',
    signText: obj.signText,
  };
  for (const k of keep) {
    if (obj[k] != null) base[k] = obj[k];
  }
  return base;
}

function renameQuestionIds(batch, filename) {
  const slug = filename.replace(/\.json$/, '');
  const questions = (batch.questions || []).map((q, i) => {
    const num = i + 1;
    return { ...q, id: `de-a2-cur-${slug}-q${num}` };
  });
  return { ...batch, questions };
}

function swapLesenT2Society(batch, bank) {
  const passage = (bank.passages || []).find((p) => p.id === LESEN_T2_SOCIETY_PASSAGE);
  if (!passage) throw new Error(`Bank passage missing: ${LESEN_T2_SOCIETY_PASSAGE}`);
  const bankQs = (bank.questions || []).filter((q) => q.passageId === LESEN_T2_SOCIETY_PASSAGE);
  if (bankQs.length !== 5) throw new Error(`Expected 5 bank questions, got ${bankQs.length}`);

  return {
    ...batch,
    instruction:
      "Lesen Sie die Informationstafel und die Aufgaben 6 bis 10.\nIn welchem Stock gehen Sie? Wählen Sie die richtige Lösung a, b oder c.",
    passages: [
      pickPoolFields(
        { ...passage, module: 'lesen', teil: 2, level: 'A2' },
        ['title', 'text', 'passageVocab'],
      ),
    ],
    questions: bankQs.map((q) =>
      pickPoolFields(
        {
          ...q,
          module: 'lesen',
          teil: 2,
          level: 'A2',
          lang: 'de',
          explanation: q.explanation || 'Die richtige Antwort steht im Text. Lesen Sie den Text noch einmal genau.',
        },
        ['topicTags', 'grammarTags', 'vocabularyTags', 'difficulty', 'skills'],
      ),
    ),
  };
}

function repairBatch(raw, filename, bank) {
  const { module, teil } = parseMeta(filename);
  let batch = JSON.parse(JSON.stringify(raw));

  if (NEEDS_LESEN_T2_SWAP.has(filename)) {
    batch = swapLesenT2Society(batch, bank);
  }

  if (NEEDS_ID_RENAME.has(filename) && !NEEDS_LESEN_T2_SWAP.has(filename)) {
    batch = renameQuestionIds(batch, filename);
  }

  if (NEEDS_BALANCE.has(filename)) {
    batch = normalizeBatch(batch, { module, teil, lang: 'de', level: 'A2' });
  }

  batch.level = 'A2';
  batch.lang = batch.lang || 'de';
  batch._a2CuratedCriticalRepairAt = new Date().toISOString();
  batch._a2CuratedCriticalRepairNote = 'CHK-4 balanceMcq + CHK-8 unique IDs + Lesen T2 society bank swap (deterministic, $0)';
  return batch;
}

async function auditFiles(dir, files) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['scripts/audit-pass-2.mjs', dir, '--json'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: ROOT,
  });
  if (r.status !== 0 && !r.stdout) {
    throw new Error(r.stderr || 'audit-pass-2 failed');
  }
  const audit = JSON.parse(r.stdout);
  const fileSet = new Set(files.map((f) => path.basename(f)));
  const findings = (audit.findings || []).filter((f) => fileSet.has(path.basename(f.file)));
  const critical = findings.filter((f) => f.severity === 'CRITICAL');
  const important = findings.filter((f) => f.severity === 'IMPORTANT');
  return { audit, findings, critical, important };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dir = poolVerifiedDir('A2');
  const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
  const report = {
    at: new Date().toISOString(),
    level: 'A2',
    files: TARGET_FILES,
    repairs: [],
    llmCostUsd: 0,
  };

  console.log(`\n=== A2 curated CRITICAL repair (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  for (const filename of TARGET_FILES) {
    const fp = path.join(dir, filename);
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const batch = repairBatch(raw, filename, bank);
    const entry = {
      file: filename,
      fixes: [
        NEEDS_BALANCE.has(filename) ? 'balanceMcq' : null,
        NEEDS_ID_RENAME.has(filename) ? 'uniqueIds' : null,
        NEEDS_LESEN_T2_SWAP.has(filename) ? 'lesenT2BankSwap' : null,
      ].filter(Boolean),
      questionIds: (batch.questions || []).map((q) => q.id),
    };

    if (apply) {
      fs.writeFileSync(fp, `${JSON.stringify(batch, null, 2)}\n`);
      const { module, teil } = parseMeta(filename);
      const sync = await syncPoolVerifiedBatch({
        file: fp,
        batch,
        level: 'A2',
        opts: { lang: 'de', module, teil, syncBlobs: false },
      });
      entry.sync = sync;
    }

    report.repairs.push(entry);
    console.log(`${apply ? 'FIXED' : 'PLAN'}  ${filename}  [${entry.fixes.join(' + ')}]`);
  }

  // Audit the 15 repaired files
  const targetPaths = TARGET_FILES.map((f) => path.join(dir, f));
  const audit15 = await auditFiles(dir, targetPaths);
  report.audit15 = {
    critical: audit15.critical.length,
    important: audit15.important.length,
    findings: audit15.findings.map((f) => ({
      file: path.basename(f.file),
      severity: f.severity,
      id: f.id,
      message: f.message,
    })),
  };

  console.log(`\n--- audit-pass-2 on 15 files ---`);
  console.log(`  CRITICAL: ${audit15.critical.length}`);
  console.log(`  IMPORTANT: ${audit15.important.length}`);
  if (audit15.critical.length) {
    for (const f of audit15.critical.slice(0, 10)) {
      console.log(`  [CRITICAL] ${path.basename(f.file)} ${f.id}: ${f.message}`);
    }
  }

  // Full pool audit
  const auditFull = await auditFiles(dir, fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)));
  report.auditFullPool = {
    filesScanned: fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length,
    critical: auditFull.audit.summary?.critical ?? auditFull.critical.length,
    important: auditFull.audit.summary?.important ?? auditFull.important.length,
    filesWithCritical: [...new Set(auditFull.critical.map((f) => path.basename(f.file)))],
    residualCritical: auditFull.critical.slice(0, 20).map((f) => ({
      file: path.basename(f.file),
      id: f.id,
      message: f.message,
    })),
  };

  console.log(`\n--- audit-pass-2 full A2 pool (${report.auditFullPool.filesScanned} files) ---`);
  console.log(`  CRITICAL: ${report.auditFullPool.critical}`);
  console.log(`  IMPORTANT: ${report.auditFullPool.important}`);
  if (report.auditFullPool.filesWithCritical.length) {
    console.log(`  files with CRITICAL: ${report.auditFullPool.filesWithCritical.join(', ')}`);
  }

  const outReport = path.join(ROOT, 'batches/ready/gate-logs/a2-curated-critical-repair-2026-07-21.json');
  fs.mkdirSync(path.dirname(outReport), { recursive: true });
  fs.writeFileSync(outReport, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${path.relative(ROOT, outReport)}`);

  const ok15 = audit15.critical.length === 0;
  console.log(ok15 ? '\n✓ 15 files: 0 CRITICAL\n' : '\n✗ Some of 15 files still have CRITICAL\n');
  process.exit(ok15 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
