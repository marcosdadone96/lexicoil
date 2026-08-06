#!/usr/bin/env node
/**
 * Pilot holdout validation — caps gate v6.1-B-G2 (frozen), no repair / no rule changes.
 *
 *   node scripts/pilot-holdout-caps-validation.mjs --generate --count 5
 *   node scripts/pilot-holdout-caps-validation.mjs --files batches/pilot-holdout/run/*.json
 *   node scripts/pilot-holdout-caps-validation.mjs --files … --compare-pilot 2026-07-08T07-25-00
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { classifyTextRegime, REGIME } from './lib/textRegime.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';

loadEnvFile();

const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
const REJECTED_DIR = path.join(GENERATED_DIR, '.rejected');
const CAL_REPORT = path.join(ROOT, 'batches/ready/german-caps-gate-report-v6.1-B-G2.json');
const PILOT_HOLDOUT_DIR = path.join(ROOT, 'batches/pilot-holdout');
const GATE_VERSION = 'v6.1-B-G2 (frozen)';
const KNOWN_REASONS = [
  'verb_census_no_finite', 'lexicon_override_tag', 'lexicon_nn', 'adj_before_noun',
  'quantifier_capitalized', 'prose_strict_homograph', 'modal_final_infinitive',
  'adv_before_verb', 'double_pass_after_prep', 'adj_after_prep',
];

const EDUCATIONAL_PHRASES = [
  'abschließend lässt sich sagen', 'experten raten', 'im gegenteil', 'zusammenfassend',
  'es ist wichtig zu', 'man sollte wissen', 'wie wir sehen',
];

const SUSPICIOUS_CAPS = [
  /\b[A-ZÄÖÜ][a-zäöüß]+(?:en|ern)\b.*\b(?:wir|sie|Sie)\b/,
  /\b(Sie|Wir|Ich)\s+[A-ZÄÖÜ][a-zäöüß]+\b/,
  /\b[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\s+(?:wir|sie|Sie)\b/,
];

function parseArgs(argv) {
  const args = { generate: false, files: [], count: 1, comparePilot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--generate') args.generate = true;
    else if (argv[i] === '--files') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]);
    } else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--count') args.count = Math.max(1, Number(argv[++i]) || 1);
    else if (argv[i] === '--compare-pilot') args.comparePilot = argv[++i];
  }
  return args;
}

function teilFromFile(name) {
  const m = name.match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function tsRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
}

function generatorEnv() {
  const env = { ...process.env, GERMAN_CAPS_GATE: 'warn' };
  if (process.platform === 'win32' && !env.NODE_OPTIONS?.includes('use-system-ca')) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');
  }
  if (!env.POS_CHECK_PYTHON) {
    const venvPy = path.join(ROOT, '.venv-pos-check', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPy)) env.POS_CHECK_PYTHON = venvPy;
  }
  return env;
}

function generatePilotExams(countPerTeil) {
  const beforeGen = new Set(listJson(GENERATED_DIR));
  const beforeRej = new Set(listJson(REJECTED_DIR));
  console.log(`Generando ${countPerTeil} examen(es) por Teil (T1–T5)…`);
  const timeoutMs = Math.max(60 * 60 * 1000, countPerTeil * 5 * 45 * 60 * 1000);
  const proc = spawnSync(
    process.execPath,
    [
      'scripts/generate-lesen-part-gemini.mjs',
      '--all-teile',
      '--count', String(countPerTeil),
      '--from-coverage',
      '--fix-retries', '4',
    ],
    { cwd: ROOT, encoding: 'utf8', env: generatorEnv(), stdio: 'inherit', timeout: timeoutMs },
  );
  if (proc.status !== 0) {
    console.warn(`Generador terminó con código ${proc.status} — usando archivos nuevos si existen.`);
  }

  const newGen = listJson(GENERATED_DIR).filter((f) => !beforeGen.has(f));
  const newRej = listJson(REJECTED_DIR).filter((f) => !beforeRej.has(f));
  const picked = [];
  const byTeil = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  for (const f of newGen.sort()) {
    const t = teilFromFile(f);
    if (!t) continue;
    byTeil[t].push({
      absPath: path.join(GENERATED_DIR, f),
      file: f,
      pipelineStatus: 'passed',
    });
  }
  for (const f of newRej.sort()) {
    const t = teilFromFile(f);
    if (!t) continue;
    byTeil[t].push({
      absPath: path.join(REJECTED_DIR, f),
      file: f,
      pipelineStatus: 'audit_rejected',
    });
  }

  for (const t of [1, 2, 3, 4, 5]) {
    const passed = byTeil[t].filter((x) => x.pipelineStatus === 'passed');
    const rejected = byTeil[t].filter((x) => x.pipelineStatus === 'audit_rejected');
    picked.push(...passed.slice(0, countPerTeil));
    if (passed.length < countPerTeil) {
      picked.push(...rejected.slice(0, countPerTeil - passed.length));
    }
  }
  return { picked, byTeil, newGen: newGen.length, newRej: newRej.length };
}

function loadCalibrationMeta() {
  if (!fs.existsSync(CAL_REPORT)) {
    return { byTeil: {}, byTeilFiles: {}, totalFindings: 0, totalFiles: 0, totalObservations: 0 };
  }
  const report = JSON.parse(fs.readFileSync(CAL_REPORT, 'utf8'));
  const byTeil = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byTeilFiles = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const file of Object.keys(report.byFile || {})) {
    const t = teilFromFile(file);
    if (!t) continue;
    byTeil[t] += (report.byFile[file] || []).length;
    byTeilFiles[t] += 1;
  }
  return {
    byTeil,
    byTeilFiles,
    totalFindings: report.totalFindings || 0,
    totalFiles: report.totalFiles || 0,
    totalObservations: report.totalObservations || 0,
  };
}

function loadPilotSummary(runId) {
  if (!runId) return null;
  const p = path.join(PILOT_HOLDOUT_DIR, runId, 'summary.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function expectedBehavior(teil) {
  const base = {
    1: { dominantRegime: 'PROSE', telegraphicFpExpected: 0, notes: 'Textos continuos + preguntas MCQ.' },
    2: { dominantRegime: 'PROSE', telegraphicFpExpected: 0, notes: 'Dos textos largos; homógrafos frecuentes.' },
    3: { dominantRegime: 'TELEGRAPHIC_AD', telegraphicFpExpected: 0, notes: 'Anuncios telegráficos.' },
    4: { dominantRegime: 'TITLE + PROSE', telegraphicFpExpected: 0, notes: 'signText TITLE, explanation PROSE.' },
    5: { dominantRegime: 'PROSE', telegraphicFpExpected: 0, notes: 'Reglamentos/instrucciones.' },
  };
  return base[teil] || { notes: '—' };
}

function pipelineMeta(batch, pipelineStatus) {
  if (pipelineStatus === 'audit_rejected' || batch._rejectedGate) {
    return {
      status: 'audit_rejected',
      gate: batch._rejectedGate || 'audit2',
      reason: String(batch._rejectedReason || '').split('\n').filter(Boolean)[0] || '',
    };
  }
  return { status: 'passed', gate: null, reason: null };
}

function analyzeBatchFile(absPath, pipelineStatus = null) {
  const file = path.basename(absPath);
  const teil = teilFromFile(file);
  const batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const pipeline = pipelineMeta(batch, pipelineStatus);
  const fields = collectStringsFromBatch(batch);
  const items = fields.map((f, i) => ({
    id: `${file}::${f.field}::${i}`,
    file,
    field: f.field,
    text: f.text,
  }));

  const bulk = runPosCapsBulk(items, { timeoutMs: 180_000 });
  if (bulk.skipped) {
    return { file, teil, pipeline, error: bulk.warning, findings: [], observations: [] };
  }

  const idToMeta = new Map(items.map((it) => [it.id, it]));
  const enrichedFindings = (bulk.findings || []).map((f) => {
    const meta = idToMeta.get(String(f.id)) || {};
    const regime = f.regime || classifyTextRegime({
      text: meta.text || f.context || '',
      field: meta.field || f.field || '',
      file,
    }).regime;
    return {
      ...f,
      file,
      field: meta.field || f.field,
      regime,
      textPreview: String(meta.text || '').slice(0, 160),
    };
  });
  const enrichedObs = (bulk.observations || []).map((o) => {
    const meta = idToMeta.get(String(o.id)) || {};
    return { ...o, file, field: meta.field || o.field, regime: o.regime };
  });

  const quality = checkLesenBatchQuality(batch, teil);
  const capsWarnDuringGen = (quality.warnings || []).filter((w) => /mayúsculas|capitaliz/i.test(w));

  return {
    file,
    teil,
    absPath,
    batch,
    pipeline,
    items: items.length,
    findings: enrichedFindings,
    observations: enrichedObs,
    qualityWarnings: quality.warnings || [],
    qualityErrors: quality.issues || [],
    generatorCapsWarnings: capsWarnDuringGen,
  };
}

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function mergeCountMaps(maps) {
  const out = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

function aggregateTeilReports(fileReports, calMeta) {
  const teil = fileReports[0]?.teil;
  const findings = fileReports.flatMap((r) => r.findings?.list || []);
  const observations = fileReports.flatMap((r) => r.observations || []);
  const byReason = mergeCountMaps(fileReports.map((r) => r.findings?.byReason || {}));
  const byRegime = mergeCountMaps(fileReports.map((r) => r.findings?.byRegime || {}));
  const telegraphicFindings = findings.filter((f) => f.regime === REGIME.TELEGRAPHIC_AD);
  const calN = calMeta.byTeil[teil] || 0;
  const calFiles = calMeta.byTeilFiles[teil] || 1;
  const calAvg = calN / calFiles;
  const passed = fileReports.filter((r) => r.pipeline?.status === 'passed');
  const rejected = fileReports.filter((r) => r.pipeline?.status === 'audit_rejected');
  const totalFindings = fileReports.reduce((s, r) => s + (r.findings?.blocking || 0), 0);
  const avgFindings = fileReports.length ? totalFindings / fileReports.length : 0;
  const novelReasons = Object.keys(byReason).filter((r) => !KNOWN_REASONS.includes(r));

  return {
    teil,
    gateVersion: GATE_VERSION,
    filesAnalyzed: fileReports.length,
    pipeline: {
      passed: passed.length,
      auditRejected: rejected.length,
      rejectReasons: countBy(rejected, (r) => {
        const reason = r.pipeline?.reason || 'unknown';
        return reason.slice(0, 80);
      }),
    },
    capsGate: {
      totalFindings,
      avgFindingsPerFile: Math.round(avgFindings * 100) / 100,
      totalObservations: observations.length,
      byReason,
      byRegime,
      telegraphicFindings: telegraphicFindings.length,
      telegraphicOk: telegraphicFindings.length === 0,
      novelReasons,
      findings,
    },
    generatorAuditor: {
      qualityErrors: fileReports.reduce((s, r) => s + (r.qualityGate?.errors?.length || 0), 0),
      qualityWarnings: fileReports.reduce((s, r) => s + (r.qualityGate?.warnings?.length || 0), 0),
      capsWarningsDuringGen: fileReports.reduce((s, r) => s + (r.generatorCapsWarnings?.length || 0), 0),
    },
    calibration: {
      poolFindings: calN,
      poolFiles: calFiles,
      avgPerFile: Math.round(calAvg * 10) / 10,
      deltaVsPilotAvg: Math.round((avgFindings - calAvg) * 10) / 10,
    },
    files: fileReports.map((r) => ({
      file: r.file,
      pipelineStatus: r.pipeline?.status,
      findings: r.findings?.blocking || 0,
      observations: r.findings?.observations || 0,
    })),
  };
}

function buildFileReport(analysis, calMeta) {
  const teil = analysis.teil;
  const exp = expectedBehavior(teil);
  const byReason = countBy(analysis.findings, (f) => f.reason);
  const byRegime = countBy(analysis.findings, (f) => f.regime || '?');
  const telegraphicFindings = analysis.findings.filter((f) => f.regime === REGIME.TELEGRAPHIC_AD);
  const calN = calMeta.byTeil[teil] || 0;
  const calFiles = calMeta.byTeilFiles[teil] || 1;
  const calAvgPerFile = calN / calFiles;

  return {
    gateVersion: GATE_VERSION,
    file: analysis.file,
    teil,
    pipeline: analysis.pipeline,
    textFields: analysis.items,
    findings: {
      blocking: analysis.findings.length,
      observations: analysis.observations.length,
      byReason,
      byRegime,
      list: analysis.findings,
    },
    observations: analysis.observations,
    expected: exp,
    comparison: {
      calibrationPoolFindingsThisTeil: calN,
      calibrationAvgPerFile: Math.round(calAvgPerFile * 10) / 10,
      pilotFindings: analysis.findings.length,
      deltaVsCalAvg: Math.round((analysis.findings.length - calAvgPerFile) * 10) / 10,
      telegraphicFindings: telegraphicFindings.length,
      telegraphicFpExpected: exp.telegraphicFpExpected,
      telegraphicOk: telegraphicFindings.length <= exp.telegraphicFpExpected,
    },
    qualityGate: {
      errors: analysis.qualityErrors,
      warnings: analysis.qualityWarnings.slice(0, 20),
    },
    generatorCapsWarnings: analysis.generatorCapsWarnings,
  };
}

function pilotAggregateFromSummary(summary) {
  if (!summary) return null;
  const byTeil = {};
  for (const [t, v] of Object.entries(summary.byTeil || {})) {
    byTeil[t] = {
      files: 1,
      totalFindings: v.findings,
      avgFindings: v.findings,
    };
  }
  return {
    runId: summary.runId,
    totalFiles: summary.files?.length || 0,
    totalFindings: summary.totalFindings,
    avgFindings: summary.files?.length ? summary.totalFindings / summary.files.length : 0,
    byTeil,
  };
}

function pilot2Aggregate(allFileReports) {
  const byTeil = {};
  for (const t of [1, 2, 3, 4, 5]) {
    const reps = allFileReports.filter((r) => r.teil === t);
    if (!reps.length) continue;
    const totalFindings = reps.reduce((s, r) => s + (r.findings?.blocking || 0), 0);
    byTeil[t] = {
      files: reps.length,
      passed: reps.filter((r) => r.pipeline?.status === 'passed').length,
      auditRejected: reps.filter((r) => r.pipeline?.status === 'audit_rejected').length,
      totalFindings,
      avgFindings: Math.round((totalFindings / reps.length) * 100) / 100,
    };
  }
  const totalFiles = allFileReports.length;
  const totalFindings = allFileReports.reduce((s, r) => s + (r.findings?.blocking || 0), 0);
  return {
    totalFiles,
    totalFindings,
    avgFindings: totalFiles ? Math.round((totalFindings / totalFiles) * 100) / 100 : 0,
    byTeil,
  };
}

function renderComparative({ runId, countPerTeil, calMeta, pilot1, pilot2, teilAggregates, allFileReports }) {
  const calAvgOverall = calMeta.totalFiles
    ? Math.round((calMeta.totalFindings / calMeta.totalFiles) * 100) / 100
    : 0;

  const lines = [
    '# Pilot holdout 2 — informe comparativo',
    '',
    `**Run:** ${runId}`,
    `**Gate:** ${GATE_VERSION} (congelado, sin repair ni cambios de reglas)`,
    `**Objetivo:** ${countPerTeil} exámenes/Teil · medir generalización caps gate vs generador/auditor`,
    '',
    '## Resumen global',
    '',
    '| Corpus | Archivos | Findings caps | Promedio/archivo |',
    '|---|---:|---:|---:|',
    `| Calibración G2 (pool \`batches/ready/lesen\`) | ${calMeta.totalFiles} | ${calMeta.totalFindings} | ${calAvgOverall} |`,
    pilot1
      ? `| Pilot 1 (\`${pilot1.runId}\`) | ${pilot1.totalFiles} | ${pilot1.totalFindings} | ${Math.round(pilot1.avgFindings * 100) / 100} |`
      : '| Pilot 1 | — | — | — |',
    `| **Pilot 2 (este run)** | **${pilot2.totalFiles}** | **${pilot2.totalFindings}** | **${pilot2.avgFindings}** |`,
    '',
    '## Por Teil',
    '',
    '| Teil | P2 archivos | P2 passed | P2 audit↓ | P2 findings | P2 avg | Cal avg | Pilot1 avg |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const t of [1, 2, 3, 4, 5]) {
    const p2 = pilot2.byTeil[t] || {};
    const calAvg = calMeta.byTeilFiles[t]
      ? Math.round((calMeta.byTeil[t] / calMeta.byTeilFiles[t]) * 10) / 10
      : 0;
    const p1avg = pilot1?.byTeil?.[t]?.avgFindings ?? '—';
    lines.push(
      `| T${t} | ${p2.files || 0} | ${p2.passed || 0} | ${p2.auditRejected || 0} | ${p2.totalFindings || 0} | ${p2.avgFindings ?? '—'} | ${calAvg} | ${p1avg} |`,
    );
  }

  lines.push(
    '',
    '## Separación generador/auditor vs caps gate',
    '',
    '| Teil | Audit rechazados | Errores quality | Warnings quality | Warnings caps en gen (warn) | Findings caps gate (frozen) |',
    '|---:|---:|---:|---:|---:|---:|',
  );
  for (const agg of teilAggregates) {
    lines.push(
      `| T${agg.teil} | ${agg.pipeline.auditRejected} | ${agg.generatorAuditor.qualityErrors} | ${agg.generatorAuditor.qualityWarnings} | ${agg.generatorAuditor.capsWarningsDuringGen} | ${agg.capsGate.totalFindings} |`,
    );
  }

  lines.push(
    '',
    '## Reason codes (caps gate, pilot 2)',
    '',
  );
  const allReasons = mergeCountMaps(teilAggregates.map((a) => a.capsGate.byReason));
  if (Object.keys(allReasons).length) {
    for (const [k, n] of Object.entries(allReasons).sort((a, b) => b[1] - a[1])) {
      const novel = KNOWN_REASONS.includes(k) ? '' : ' ⚠ nuevo';
      lines.push(`- \`${k}\`: ${n}${novel}`);
    }
  } else {
    lines.push('- (ninguno)');
  }

  const allNovel = [...new Set(teilAggregates.flatMap((a) => a.capsGate.novelReasons))];
  lines.push('', '## Patrones nuevos vs calibración', '');
  if (allNovel.length) {
    lines.push(`Reason codes no presentes en calibración: ${allNovel.map((r) => `\`${r}\``).join(', ')}`);
  } else {
    lines.push('Ningún reason code nuevo respecto al vocabulario de calibración G2.');
  }

  lines.push(
    '',
    '## Interpretación',
    '',
    '- **Findings caps gate** = salida del gate v6.1-B-G2 congelado (pos-check Python).',
    '- **Audit rechazados** = audit-pass-2 / calidad pedagógica del generador (no modifica el gate).',
    '- **Warnings caps en gen** = `GERMAN_CAPS_GATE=warn` durante generación; puede solaparse con el gate frozen.',
    '',
    'Detalle por archivo: `manifest.json`, agregados por Teil: `teil-N-aggregate.json`.',
  );

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.out || tsRunId();
  const outDir = path.join(PILOT_HOLDOUT_DIR, runId);
  fs.mkdirSync(outDir, { recursive: true });

  let entries = [];
  let genStats = null;

  if (args.generate) {
    const result = generatePilotExams(args.count);
    genStats = { requestedPerTeil: args.count, newGenerated: result.newGen, newRejected: result.newRej };
    const genDir = path.join(outDir, 'generated');
    fs.mkdirSync(genDir, { recursive: true });
    for (const item of result.picked) {
      const dest = path.join(genDir, item.file);
      fs.copyFileSync(item.absPath, dest);
      entries.push({ absPath: dest, ...item });
      console.log(`  Copiado [${item.pipelineStatus}]: ${item.file}`);
    }
    const perTeil = countBy(entries, (e) => teilFromFile(e.file));
    for (const t of [1, 2, 3, 4, 5]) {
      const n = perTeil[t] || 0;
      if (n < args.count) console.warn(`  T${t}: solo ${n}/${args.count} archivos para análisis.`);
    }
  } else {
    entries = args.files.map((f) => {
      const absPath = path.resolve(f);
      const batch = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      const pipelineStatus = batch._rejectedGate ? 'audit_rejected' : 'passed';
      return { absPath, file: path.basename(absPath), pipelineStatus };
    });
  }

  if (!entries.length) {
    console.error('Sin archivos. Usa --generate o --files …');
    process.exit(1);
  }

  const calMeta = loadCalibrationMeta();
  const pilot1 = pilotAggregateFromSummary(loadPilotSummary(args.comparePilot || '2026-07-08T07-25-00'));

  const fileReports = [];
  const rawAnalyses = [];

  for (const entry of entries.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`\nAnalizando [${entry.pipelineStatus}] ${entry.file}…`);
    const analysis = analyzeBatchFile(entry.absPath, entry.pipelineStatus);
    if (analysis.error) {
      console.error(`  Error caps: ${analysis.error}`);
      continue;
    }
    rawAnalyses.push(analysis);
    const report = buildFileReport(analysis, calMeta);
    fileReports.push(report);
    const base = `teil-${report.teil}-${path.basename(entry.file, '.json')}`;
    fs.writeFileSync(path.join(outDir, `${base}-caps.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`  T${report.teil}: ${report.findings.blocking} findings caps, pipeline=${report.pipeline.status}`);
  }

  const teilAggregates = [];
  for (const t of [1, 2, 3, 4, 5]) {
    const reps = fileReports.filter((r) => r.teil === t);
    if (!reps.length) continue;
    const agg = aggregateTeilReports(reps, calMeta);
    teilAggregates.push(agg);
    fs.writeFileSync(
      path.join(outDir, `teil-${t}-aggregate.json`),
      `${JSON.stringify(agg, null, 2)}\n`,
      'utf8',
    );
  }

  const pilot2 = pilot2Aggregate(fileReports);
  const manifest = {
    runId,
    gateVersion: GATE_VERSION,
    generatedAt: new Date().toISOString(),
    requestedPerTeil: args.count,
    generation: genStats,
    comparePilot: args.comparePilot || '2026-07-08T07-25-00',
    files: fileReports.map((r) => ({
      file: r.file,
      teil: r.teil,
      pipeline: r.pipeline,
      capsFindings: r.findings.blocking,
      capsObservations: r.findings.observations,
      qualityErrors: r.qualityGate.errors.length,
      qualityWarnings: r.qualityGate.warnings.length,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const summary = {
    runId,
    pilot: 2,
    gateVersion: GATE_VERSION,
    generatedAt: manifest.generatedAt,
    requestedPerTeil: args.count,
    comparePilot: manifest.comparePilot,
    calibration: {
      totalFiles: calMeta.totalFiles,
      totalFindings: calMeta.totalFindings,
      avgPerFile: calMeta.totalFiles ? calMeta.totalFindings / calMeta.totalFiles : 0,
      byTeil: calMeta.byTeil,
    },
    pilot1,
    pilot2,
    teilAggregates,
    totalFindings: pilot2.totalFindings,
    totalObservations: fileReports.reduce((s, r) => s + r.findings.observations, 0),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const comparative = renderComparative({
    runId,
    countPerTeil: args.count,
    calMeta,
    pilot1,
    pilot2,
    teilAggregates,
    allFileReports: fileReports,
  });
  fs.writeFileSync(path.join(outDir, 'COMPARATIVE.md'), `${comparative}\n`, 'utf8');

  const sumMd = [
    '# Pilot holdout 2 — resumen',
    '',
    `**Run:** ${runId}`,
    `**Gate:** ${GATE_VERSION}`,
    `**Exámenes analizados:** ${pilot2.totalFiles} (${args.count} solicitados/Teil)`,
    `**Findings caps gate:** ${pilot2.totalFindings} (avg ${pilot2.avgFindings}/archivo)`,
    '',
    'Ver `COMPARATIVE.md` para comparación vs calibración y pilot 1.',
    'Ver `manifest.json` para estado pipeline por archivo.',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), `${sumMd}\n`, 'utf8');

  console.log(`\nInformes en: ${outDir}`);
  console.log(`  COMPARATIVE.md · manifest.json · ${teilAggregates.length} agregados por Teil`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
