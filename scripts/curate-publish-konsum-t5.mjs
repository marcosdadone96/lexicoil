#!/usr/bin/env node
/**
 * Valida y publica partes curadas Konsum×T5 (gates completos, sin atajos).
 *
 *   node scripts/curate-publish-konsum-t5.mjs
 *   node scripts/curate-publish-konsum-t5.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './lib/loadEnv.mjs';
import { checkLesenBatchQuality, formatQualityReport } from './lib/lesenBatchQuality.mjs';
import { checkLesenT5BatchTopic } from './lib/lesenT5TopicFilter.mjs';
import { checkStructuralMoldDuplicate } from './lib/structuralMoldDedup.mjs';
import { collectMcqLengthBiasIssues } from './lib/mcqLengthBias.mjs';
import { loadPoolRecords, filterCellRecords } from './lib/lesenSubtypeRotation.mjs';
import { validateLesenBatch } from './lib/pasteLesenBatchLib.mjs';
import { poolReadyCheckWithRepair } from './lib/poolReadyCheck.mjs';
import { enrichBatchMetadata } from './lib/enrichBatchMetadata.mjs';
import { writePoolVerified } from './lib/finalizePoolReady.mjs';
import { publishLesenBatchToPool } from './lib/publishToPool.mjs';
import {
  assertManualPublishPositionGates,
  formatMcqPositionLine,
  normalizeManualLesenBatch,
} from './lib/manualPublishNormalize.mjs';

const FILES = [
  'batches/generated/B1/lesen-t5-cur-konsum-markthalle.json',
  'batches/generated/B1/lesen-t5-cur-konsum-einkaufszentrum.json',
];

const dryRun = process.argv.includes('--dry-run');

function corpusFor(topic) {
  return filterCellRecords(loadPoolRecords(), { teil: 5, topicTag: topic }).map((r) => ({
    ...r,
    passages: r.passages || (r.passage ? [r.passage] : []),
    questions: r.questions || [{ teil: 5 }],
  }));
}

async function validateOne(relFile, extraCorpus = []) {
  const abs = path.join(ROOT, relFile);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const teil = 5;
  const lines = [];

  const balanced = normalizeManualLesenBatch(raw, { teil, lang: 'de', level: 'B1' });
  lines.push(
    balanced._balanceMcqVersion
      ? `BALANCE MCQ OK (${balanced._balanceMcqVersion})`
      : 'BALANCE MCQ FAIL: missing _balanceMcqVersion',
  );

  const gatePack = assertManualPublishPositionGates(balanced, { teil, lang: 'de', level: 'B1' });
  lines.push(formatMcqPositionLine(gatePack.dist));
  if (!gatePack.hasBalanceStamp) {
    lines.push('BALANCE STAMP FAIL');
    return { ok: false, batch: gatePack.batch, lines };
  }
  if (!gatePack.ok) {
    lines.push(`POSITION GATE FAIL: ${gatePack.issues.join('; ')}`);
    return { ok: false, batch: gatePack.batch, lines };
  }
  lines.push('POSITION GATE OK (balanceMcq + CHK-13/19)');

  let batch = gatePack.batch;

  const fmtArgs = { lang: 'de', level: 'B1', teil: 5, skipQuality: true, skipIngest: true, allowBankDup: true };
  const fmt = validateLesenBatch(batch, fmtArgs, { teil: 5, label: path.basename(relFile) });
  if (!fmt.ok) {
    lines.push(`FORMAT FAIL: ${(fmt.errors || []).join('; ')}`);
    return { ok: false, batch, lines };
  }
  lines.push('FORMAT OK');

  const topicGate = checkLesenT5BatchTopic(batch);
  if (!topicGate.ok) {
    lines.push(`TOPIC×SUBTYPE FAIL: ${topicGate.issue}`);
    return { ok: false, batch, lines };
  }
  lines.push('TOPIC×SUBTYPE OK');

  const quality = checkLesenBatchQuality(batch, teil, { level: 'B1' });
  if (!quality.ok) {
    lines.push(formatQualityReport(quality));
    return { ok: false, batch, lines };
  }
  lines.push(formatQualityReport(quality));

  const lengthIssues = collectMcqLengthBiasIssues(batch, { level: 'B1' });
  if (lengthIssues.length) {
    lines.push(`LENGTH BIAS: ${lengthIssues.join('; ')}`);
    return { ok: false, batch, lines };
  }
  lines.push('LENGTH BIAS OK');

  const corpus = [...corpusFor(batch.topicTag), ...extraCorpus];
  const chk = checkStructuralMoldDuplicate(batch, corpus, { teil: 5 });
  if (!chk.ok) {
    lines.push(`CHK-29 FAIL: ${chk.issue}`);
    return { ok: false, batch, lines };
  }
  lines.push(`CHK-29 OK (molde ${batch._textSubtype}:${batch._t5VariantProfile || 'standard'})`);

  const enriched = enrichBatchMetadata(batch).batch;
  const pool = await poolReadyCheckWithRepair(enriched, {
    file: path.basename(relFile),
    level: 'B1',
    skipMetadata: false,
  });
  if (pool.verdict !== 'READY' && !pool.q1OnlyReject) {
    lines.push(`POOL READY FAIL: ${(pool.reasons || pool.rejectReasons || []).join('; ')}`);
    return { ok: false, batch: enriched, lines };
  }
  lines.push(`POOL READY: ${pool.verdict}${pool.q1OnlyReject ? ' (Q1 shadow)' : ''}`);

  return { ok: true, batch: pool.batch || enriched, lines, pool };
}

async function main() {
  const published = [];
  const accumulatedCorpus = [];

  for (const rel of FILES) {
    console.log(`\n══ ${rel} ══`);
    const result = await validateOne(rel, accumulatedCorpus);
    for (const l of result.lines) console.log(' ', l);
    if (!result.ok) {
      console.error(`\n✗ No publicado: ${rel}`);
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      console.log('  [dry-run] omitiendo publicación');
      accumulatedCorpus.push(result.batch);
      continue;
    }

    const outName = path.basename(rel).replace('-cur-', '-');
    writePoolVerified(outName, result.batch, 'B1');
    console.log(`  → pool-verified/B1/${outName}`);

    const pub = await publishLesenBatchToPool(result.batch, {
      lang: 'de',
      level: 'B1',
      teil: 5,
      sourceFile: `batches/ready/pool-verified/B1/${outName}`,
      allowBankDup: true,
    });
    if (!pub.ok) {
      console.error(`  POOL-2 FAIL: ${pub.reason || pub.error || JSON.stringify(pub)}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  → reusable-seed (${pub.recordId || pub.id || 'ok'})`);
    published.push(outName);
    accumulatedCorpus.push(result.batch);
  }

  console.log(`\n══ Resumen: ${published.length}/${FILES.length} publicadas ══`);
  if (published.length) console.log(published.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
