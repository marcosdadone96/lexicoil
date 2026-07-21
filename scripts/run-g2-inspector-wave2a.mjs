#!/usr/bin/env node
/**
 * Run frozen G2 (pos-caps-check) on wave 2a / Prueba_2 generated batch.
 *   node scripts/run-g2-inspector-wave2a.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { checkGermanCapsBatch, formatGermanCapsFinding } from './lib/germanCapsGate.mjs';

const GENERATED = path.join(ROOT, 'batches/generated');
const TANDA = path.join(ROOT, 'batches/ready/gate-logs/.tanda-prueba-25.json');
const OUT_JSON = path.join(ROOT, 'batches/ready/gate-logs/g2-inspector-wave2a.json');
const OUT_MD = path.join(ROOT, 'batches/ready/gate-logs/G2-INSPECTOR-WAVE2A.md');

const WAVE2A_EXTRA = [
  'lesen-t5-gemini-073.json',
  'lesen-t5-gemini-074.json',
  'lesen-t3-auto-jja73u.json',
  'lesen-t3-auto-1u2l8c.json',
  'lesen-t3-auto-u7x6w8.json',
];

const KNOWN_PENDING = [
  { word: 'studierenden', file: 'lesen-t5-gemini-070.json', note: 'noun lowercase after comparison' },
  { word: 'Zahlenden', file: 'lesen-t5-gemini-070.json', note: 'adj/participle over-capitalized' },
  { word: 'Automatische', file: 'lesen-t4-gemini-040.json', note: 'adj after ein' },
];

const HISTORICAL_REASONS = new Set([
  'verb_census_no_finite', 'adv_before_verb', 'lexicon_override_tag', 'modal_final_infinitive',
  'adj_before_noun', 'adv_after_pronoun', 'quantifier_capitalized', 'lexicon_after_adj',
  'modal_noun_object', 'prose_strict_homograph', 'lexicon_nn', 'zu_adv_capitalized',
  'adj_after_prep', 'double_pass_after_prep', 'adv_capitalized',
]);

function loadFileList() {
  const tanda = JSON.parse(fs.readFileSync(TANDA, 'utf8'));
  const files = new Set();
  for (const [k, v] of Object.entries(tanda.files)) {
    if (k === 't3Replaced') continue;
    if (Array.isArray(v)) v.forEach((f) => files.add(f));
  }
  WAVE2A_EXTRA.forEach((f) => files.add(f));
  return [...files].sort();
}

function main() {
  const files = loadFileList().filter((f) => fs.existsSync(path.join(GENERATED, f)));
  console.log(`G2 Inspector — ${files.length} archivos wave 2a`);

  const perFile = [];
  let totalFindings = 0;
  const allFindings = [];
  const byReason = {};
  const byType = {};

  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(GENERATED, file), 'utf8'));
    const result = checkGermanCapsBatch(batch);
    if (result.skipped) {
      console.error(`SKIP (no spaCy): ${result.warnings}`);
      process.exit(1);
    }
    const findings = result.findings || [];
    totalFindings += findings.length;
    for (const f of findings) {
      byReason[f.reason] = (byReason[f.reason] || 0) + 1;
      byType[f.type] = (byType[f.type] || 0) + 1;
      allFindings.push({ ...f, file });
    }
    perFile.push({
      file,
      teil: Number(file.match(/lesen-t(\d)/i)?.[1] || 0),
      count: findings.length,
      findings: findings.map((f) => ({
        type: f.type,
        word: f.word,
        reason: f.reason,
        tag: f.tag,
        pos: f.pos,
        field: f.field,
        context: f.context,
      })),
    });
    if (findings.length) {
      console.log(`  ${file}: ${findings.length}`);
      for (const f of findings) console.log(`    ${f.type} «${f.word}» (${f.reason})`);
    }
  }

  const holdoutAvg = 88 / 193;
  const loteAvg = totalFindings / files.length;
  const holdoutPct = holdoutAvg * 100;
  const lotePct = loteAvg * 100;

  const pendingCheck = KNOWN_PENDING.map((p) => {
    const hit = allFindings.find(
      (f) => f.file === p.file && f.word.toLowerCase().includes(p.word.toLowerCase().slice(0, 6)),
    ) || allFindings.find((f) => f.word === p.word || f.word.toLowerCase() === p.word.toLowerCase());
    return { ...p, g2Flags: Boolean(hit), finding: hit || null };
  });

  const novel = allFindings.filter((f) => {
    const w = f.word.toLowerCase();
    if (KNOWN_PENDING.some((p) => p.word.toLowerCase() === w)) return false;
    return true;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    gate: 'v6.1-B-G2 (frozen)',
    sourceDir: 'batches/generated',
    files: files.length,
    fileList: files,
    totalFindings,
    avgPerFile: round(loteAvg, 3),
    holdoutRef: { files: 193, findings: 88, avg: round(holdoutAvg, 3) },
    comparison: {
      loteVsHoldoutAvg: round(loteAvg - holdoutAvg, 3),
      loteCleaner: loteAvg < holdoutAvg,
    },
    byReason,
    byType,
    perFile,
    knownPending: pendingCheck,
    novelFindings: novel,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const md = renderMd(report);
  fs.writeFileSync(OUT_MD, md);
  console.log(`\nTotal: ${totalFindings} findings en ${files.length} archivos`);
  console.log(`Escrito: ${OUT_MD}`);
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function renderMd(r) {
  const lines = [
    '# G2 Inspector — wave 2a (Prueba_2 / generated)',
    '',
    `**Fecha:** ${r.generatedAt}`,
    `**Gate:** ${r.gate}`,
    `**Archivos:** ${r.files}`,
    `**Findings totales:** ${r.totalFindings}`,
    `**Promedio/archivo:** ${r.avgPerFile} (holdout 193: ${r.holdoutRef.avg} = ${(r.holdoutRef.avg * 100).toFixed(2)}%)`,
    `**Δ vs holdout:** ${r.comparison.loteVsHoldoutAvg > 0 ? '+' : ''}${r.comparison.loteVsHoldoutAvg} → lote ${r.comparison.loteCleaner ? 'más limpio' : 'igual o peor'}`,
    '',
    '## Findings por archivo',
    '',
    '| Archivo | Teil | N | Detalle |',
    '|---|---|---:|---|',
  ];

  for (const pf of r.perFile) {
    const det = pf.findings.length
      ? pf.findings.map((f) => `\`${f.word}\` (${f.reason})`).join('; ')
      : '—';
    lines.push(`| ${pf.file} | T${pf.teil} | ${pf.count} | ${det} |`);
  }

  lines.push('', '## 3 pendientes conocidos (BACKLOG wave 2)', '', '| Patrón | Archivo | ¿G2 marca? | reason |', '|---|---|---|---|');
  for (const p of r.knownPending) {
    lines.push(`| ${p.word} | ${p.file} | ${p.g2Flags ? '**SÍ**' : '**NO**'} | ${p.finding?.reason || '—'} |`);
  }

  lines.push('', '## Findings nuevos / no revisados manualmente', '');
  if (!r.novelFindings.length) {
    lines.push('Ninguno — lote limpio según G2.');
  } else {
    lines.push('| Archivo | word | type | reason | context |', '|---|---|---|---|---|');
    for (const f of r.novelFindings) {
      lines.push(`| ${f.file} | ${f.word} | ${f.type} | ${f.reason} | ${String(f.context || '').slice(0, 60)} |`);
    }
  }

  lines.push('', '## Por reason', '');
  for (const [k, v] of Object.entries(r.byReason).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\`: ${v}`);
  }

  return lines.join('\n');
}

main();
