#!/usr/bin/env node
/**
 * Tabla de frecuencia de parejas/nombres — Hören A2 T1–T3 en pool-verified.
 * Umbral de referencia: 10–12% (mismo criterio operativo que matriz de temas).
 *
 *   node scripts/scan-a2-horen-dialogue-pair-frequency.mjs
 *   node scripts/scan-a2-horen-dialogue-pair-frequency.mjs --max-pct 12
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import {
  extractDialoguePairs,
  pairKey,
  DIALOGUE_HOT_PAIRS,
  tallyNameFrequency,
} from './lib/dialogueNamesBank.mjs';

/** Referencia auditorías futuras A2 Hören diálogos (T1–T3). */
export const A2_HOREN_DIALOGUE_PAIR_MAX_PCT = 12;
export const A2_HOREN_DIALOGUE_PAIR_MIN_PCT = 10;

const argv = process.argv.slice(2);
const maxPctArg = argv.includes('--max-pct') ? Number(argv[argv.indexOf('--max-pct') + 1]) : A2_HOREN_DIALOGUE_PAIR_MAX_PCT;
const maxPct = Number.isFinite(maxPctArg) ? maxPctArg : A2_HOREN_DIALOGUE_PAIR_MAX_PCT;

const poolDir = path.join(ROOT, 'batches/ready/pool-verified/A2');
const files = fs.readdirSync(poolDir).filter((f) => /^horen-t[123]-/.test(f));

const batches = [];
const hotContaminated = [];

for (const file of files.sort()) {
  const batch = JSON.parse(fs.readFileSync(path.join(poolDir, file), 'utf8'));
  const teil = Number(batch.teil ?? batch.passages?.[0]?.teil);
  batches.push({ file, batch, teil });
  const pairs = extractDialoguePairs(batch).map(([a, b]) => pairKey(a, b));
  const hits = pairs.filter((p) => DIALOGUE_HOT_PAIRS.has(p));
  if (hits.length) hotContaminated.push({ file, teil, hits: [...new Set(hits)] });
}

const tally = tallyNameFrequency(batches.map((b) => b.batch));
const dialogueSegments = batches.reduce((n, { batch }) => n + extractDialoguePairs(batch).length, 0);
const dialogueFiles = batches.filter(({ batch }) => extractDialoguePairs(batch).length > 0).length;

const pairRows = [...tally.pairCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([pair, count]) => ({
    pair,
    count,
    pctOfSegments: dialogueSegments ? (100 * count) / dialogueSegments : 0,
    overThreshold: dialogueSegments ? (100 * count) / dialogueSegments > maxPct : false,
  }));

const nameRows = [...tally.nameCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({
    name,
    count,
    pctOfSegments: dialogueSegments ? (100 * count) / dialogueSegments : 0,
  }));

const report = {
  at: new Date().toISOString(),
  poolDir: poolDir.replace(/\\/g, '/'),
  horenT123Files: files.length,
  dialogueFiles,
  dialogueSegments,
  threshold: {
    referenceMinPct: A2_HOREN_DIALOGUE_PAIR_MIN_PCT,
    referenceMaxPct: A2_HOREN_DIALOGUE_PAIR_MAX_PCT,
    auditMaxPctUsed: maxPct,
    note: 'Ninguna pareja debe superar auditMaxPctUsed % del total de segmentos con diálogo (Hören T1–T3).',
  },
  hotContaminated,
  topPairs: pairRows.slice(0, 25),
  topNames: nameRows.slice(0, 25),
  pass: hotContaminated.length === 0 && !pairRows.some((r) => r.overThreshold),
  violations: pairRows.filter((r) => r.overThreshold),
};

const outJson = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-dialogue-pair-frequency.json');
const outMd = path.join(ROOT, 'batches/ready/gate-logs/a2-horen-dialogue-pair-frequency.md');
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const md = [
  '# A2 Hören T1–T3 — frecuencia de parejas de diálogo',
  '',
  `Generado: ${report.at}`,
  '',
  `Archivos Hören T1–T3: **${report.horenT123Files}** · segmentos con diálogo: **${report.dialogueSegments}**`,
  '',
  `**Umbral de referencia (auditorías):** ${A2_HOREN_DIALOGUE_PAIR_MIN_PCT}–${A2_HOREN_DIALOGUE_PAIR_MAX_PCT}% por pareja · evaluado a **${maxPct}%**`,
  '',
  `**pass:** ${report.pass ? '✅' : '❌'} · hot contaminados: ${hotContaminated.length} · parejas sobre umbral: ${report.violations.length}`,
  '',
  '## Top parejas',
  '',
  '| Pareja | Count | % segmentos |',
  '| --- | ---: | ---: |',
  ...pairRows.slice(0, 20).map((r) => `| ${r.pair} | ${r.count} | ${r.pctOfSegments.toFixed(1)}% |`),
  '',
].join('\n');
fs.writeFileSync(outMd, `${md}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
