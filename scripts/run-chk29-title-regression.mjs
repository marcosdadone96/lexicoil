#!/usr/bin/env node
/**
 * Regresión CHK-29 title fix: Umwelt×T4, Umwelt×T5, Technik×T5.
 * Ratio vocab del log real — no éxito declarado.
 *
 *   node scripts/run-chk29-title-regression.mjs
 *   node scripts/run-chk29-title-regression.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/loadEnv.mjs';
import { normTitle } from './lib/structuralMoldDedup.mjs';
import { checkT4TitleContentCoherence } from './lib/titleVariantBank.mjs';
import { loadPersistedCellMolds } from './lib/persistedCellPool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'batches/ready/gate-logs/chk29-title-regression');

const CASES = [
  { id: 'umwelt-t4', teil: 4, topic: 'Umwelt', label: 'Umwelt×T4' },
  { id: 'umwelt-t5', teil: 5, topic: 'Umwelt', label: 'Umwelt×T5' },
  { id: 'technik-t5', teil: 5, topic: 'Technik', label: 'Technik×T5' },
];

function parseLogMetrics(logText) {
  const out = {
    ok: /✓|OK|pool-ready|guardado en pool/i.test(logText) && !/FAIL|BLOQUEADO|discarded/i.test(logText.slice(-800)),
    chk29: /CHK-29|molde estructural|título idéntico/i.test(logText),
    gate: logText.match(/gate:\s*(\S+)/i)?.[1] || null,
    mandatedTitle: logText.match(/título «([^»]+)»/)?.[1] || null,
    vocabRatio: null,
    vocabUsed: null,
    vocabTotal: null,
  };
  const vr = logText.match(/Vocabulario:\s*(\d+)\s*de\s*(\d+)/i);
  if (vr) {
    out.vocabUsed = Number(vr[1]);
    out.vocabTotal = Number(vr[2]);
    out.vocabRatio = out.vocabUsed / out.vocabTotal;
  }
  const ratioMeta = logText.match(/"ratio":\s*([0-9.]+)/);
  if (ratioMeta && out.vocabRatio == null) out.vocabRatio = Number(ratioMeta[1]);
  return out;
}

function findLatestBatch(teil, sinceMs) {
  const dirs = [
    path.join(ROOT, 'batches/ready/pool-verified/B1'),
    path.join(ROOT, 'batches/generated/B1'),
    path.join(ROOT, 'batches/generated'),
  ];
  let best = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`lesen-t${teil}-`) || !name.endsWith('.json')) continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.mtimeMs < sinceMs - 5000) continue;
      if (!best || st.mtimeMs > best.mtime) best = { abs, name, mtime: st.mtimeMs };
    }
  }
  return best;
}

function verifyBatch(caseDef, batchPath, logMetrics) {
  const issues = [];
  if (!batchPath || !fs.existsSync(batchPath)) {
    issues.push('sin batch de salida');
    return { issues, batch: null };
  }
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const title = batch.passages?.[0]?.title || '';
  const fb = batch.userVocabFeedback;
  const ratio =
    typeof fb?.ratio === 'number'
      ? fb.ratio
      : fb?.requested?.length
        ? (fb.used?.length || 0) / fb.requested.length
        : logMetrics.vocabRatio;

  if (caseDef.teil === 4) {
    const coherence = checkT4TitleContentCoherence(batch, batch._debateSeed);
    if (!coherence.ok && !coherence.skipped) {
      issues.push(coherence.issue || 'T4 title↔content incoherente');
    }
    if (batch._mandatedTitle && normTitle(batch._mandatedTitle) !== normTitle(title)) {
      issues.push(`título ≠ mandated: «${title}» vs «${batch._mandatedTitle}»`);
    }
  }

  if (caseDef.teil === 5) {
    if (batch._mandatedTitle && normTitle(batch._mandatedTitle) !== normTitle(title)) {
      issues.push(`título ≠ mandated: «${title}» vs «${batch._mandatedTitle}»`);
    }
    const persisted = loadPersistedCellMolds({
      topicTag: caseDef.topic,
      teil: 5,
    });
    const siblings = persisted.persistedBatches.filter((b) => b._file !== path.basename(batchPath));
    for (const other of siblings) {
      const ot = other.passages?.[0]?.title;
      if (ot && normTitle(ot) === normTitle(title) && normTitle(title).length >= 12) {
        issues.push(`CHK-29 título duplicado vs ${other._file}: «${title}»`);
      }
    }
  }

  return { issues, batch, ratio, title };
}

function runCase(caseDef, dryRun) {
  const logPath = path.join(LOG_DIR, `${caseDef.id}.log`);
  if (dryRun) {
    return { caseDef, dryRun: true, logPath };
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const sinceMs = Date.now();
  const argv = [
    path.join(__dirname, 'generate-lesen-part-gemini.mjs'),
    '--teil', String(caseDef.teil),
    '--topic', caseDef.topic,
    '--from-coverage',
    '--count', '1',
    '--max-api-calls', '45',
    '--fix-retries', '2',
  ];

  const proc = spawnSync(process.execPath, argv, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env },
  });

  const logText = `${proc.stdout || ''}\n${proc.stderr || ''}`;
  fs.writeFileSync(logPath, logText, 'utf8');

  const metrics = parseLogMetrics(logText);
  const batchFile = findLatestBatch(caseDef.teil, sinceMs);
  const verify = verifyBatch(caseDef, batchFile?.abs, metrics);

  return {
    caseDef,
    exitCode: proc.status,
    logPath,
    batchFile: batchFile?.name || null,
    metrics,
    verify,
    passed: proc.status === 0 && verify.issues.length === 0 && !metrics.chk29,
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('=== CHK-29 title regression ===\n');

  const results = CASES.map((c) => runCase(c, dryRun));
  const summary = [];

  for (const r of results) {
    if (r.dryRun) {
      console.log(`[dry-run] ${r.caseDef.label} → ${r.logPath}`);
      continue;
    }
    const ratioPct =
      r.verify.ratio != null ? `${Math.round(r.verify.ratio * 100)}%` : r.metrics.vocabRatio != null ? `${Math.round(r.metrics.vocabRatio * 100)}%` : '?';
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${r.caseDef.label}`);
    console.log(`  log: ${path.relative(ROOT, r.logPath).replace(/\\/g, '/')}`);
    console.log(`  batch: ${r.batchFile || '—'}`);
    console.log(`  vocab ratio (log/batch): ${ratioPct}`);
    if (r.verify.title) console.log(`  title: «${r.verify.title.slice(0, 72)}»`);
    if (r.metrics.mandatedTitle) console.log(`  mandated (log): «${r.metrics.mandatedTitle.slice(0, 72)}»`);
    if (r.metrics.chk29) console.log(`  CHK-29 en log: sí`);
    if (r.verify.issues.length) console.log(`  issues: ${r.verify.issues.join('; ')}`);
    console.log('');
    summary.push({
      id: r.caseDef.id,
      label: r.caseDef.label,
      passed: r.passed,
      vocabRatioPct: ratioPct,
      batch: r.batchFile,
      issues: r.verify.issues,
    });
  }

  const outJson = path.join(LOG_DIR, 'summary.json');
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(
    outJson,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results: summary }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Summary: ${outJson.replace(/\\/g, '/')}`);

  const failed = summary.filter((s) => !s.passed);
  if (failed.length) process.exitCode = 1;
}

main();
