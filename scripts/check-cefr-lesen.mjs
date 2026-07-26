#!/usr/bin/env node
/**
 * Pre-check CEFR local para Lesen T2/T5 (mismas métricas que pre-ingest-cefr).
 *
 *   node scripts/check-cefr-lesen.mjs --file batches/inbox/lesen-t2-claude-test.json --teil 2
 *   node scripts/check-cefr-lesen.mjs --file batches/inbox/mi-t5.json --teil 5 --level B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import {
  checkLesenBatchIngest,
  formatIngestReport,
  ingestErrorsForSummary,
} from './lib/lesenBatchIngestCheck.mjs';
import { formatCefrMetricsSummary } from './lib/gateReportFormat.mjs';

loadEnvFile();

function parseArgs(argv) {
  const out = { file: null, teil: null, lang: 'de', level: 'B1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
    else if (a === '--teil') out.teil = Number(argv[++i]);
    else if (a === '--lang') out.lang = argv[++i];
    else if (a === '--level') out.level = String(argv[++i]).toUpperCase();
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Uso:
  node scripts/check-cefr-lesen.mjs --file <batch.json> --teil 2|5 [--level B1]

Mide las 5 métricas del CEFR gate (mismo motor que pre-ingest-cefr):
  wordCount, avgSentenceLen, subordinatePct, coverageVsLevel, inferencePct

Recomendado para Lesen T2 y T5 antes de enviar al inbox.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    printHelp();
    process.exit(args.file ? 0 : 1);
  }

  const abs = path.isAbsolute(args.file) ? args.file : path.join(ROOT, args.file);
  if (!fs.existsSync(abs)) {
    console.error(`No existe: ${abs}`);
    process.exit(1);
  }

  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`JSON inválido: ${err.message}`);
    process.exit(1);
  }

  const level = String(batch.level || batch.questions?.[0]?.level || args.level).toUpperCase();
  const teil = args.teil ?? batch.questions?.[0]?.teil ?? batch.passages?.[0]?.teil;
  if (![2, 5].includes(Number(teil))) {
    console.warn(`Aviso: este script está optimizado para Lesen T2/T5 (teil=${teil}).`);
  }

  console.log(`\nCEFR pre-check · ${path.basename(abs)} · Lesen T${teil} · ${level}\n`);

  const report = checkLesenBatchIngest(batch, {
    lang: args.lang,
    level,
    batchId: path.basename(abs, '.json'),
  });

  console.log(formatIngestReport(report, { level }));

  const row = report.results?.[0];
  if (row?.cefr?.metrics) {
    console.log('\nMétricas medidas:');
    for (const line of formatCefrMetricsSummary(row.cefr, level)) {
      console.log(line);
    }
  }

  if (!report.ok) {
    console.log('\nFallos:');
    for (const e of ingestErrorsForSummary(report, level)) {
      console.log(`  ❌ ${e}`);
    }
    process.exit(1);
  }

  console.log('\n✅ CEFR OK — listo para inbox (faltan otros gates: validate-batch, calidad pedagógica).');
  process.exit(0);
}

main();
