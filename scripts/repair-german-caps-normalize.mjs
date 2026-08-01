#!/usr/bin/env node
/**
 * Apply post-gen German caps normalization to an existing corpus and measure
 * caps-gate finding reduction (v6.1-B-G2 frozen — gate itself is NOT modified).
 *
 *   node scripts/repair-german-caps-normalize.mjs --dir batches/pilot-holdout/2026-07-08T07-33-45/generated
 *   node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen --dry-run
 *   node scripts/repair-german-caps-normalize.mjs --dir batches/ready/lesen --apply --out batches/ready/caps-normalize-log.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import { collectStringsFromBatch, runPosCapsBulk } from './lib/germanCapsGate.mjs';
import { applyGermanCapsNormalize } from './lib/germanCapsNormalize.mjs';

loadEnvFile();

const GATE_VERSION = 'v6.1-B-G2 (frozen)';

function parseArgs(argv) {
  const args = { dryRun: true, apply: false, dir: null, files: [], fileList: null, out: null, decapOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--filelist') args.fileList = argv[++i];
    else if (argv[i] === '--files') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]);
    } else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--apply') { args.apply = true; args.dryRun = false; }
    else if (argv[i] === '--decap-only') args.decapOnly = true;
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function listJsonFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .map((f) => path.join(dir, f));
}

function resolveFiles(args) {
  if (args.fileList) {
    const absList = path.resolve(args.fileList);
    const lines = fs.readFileSync(absList, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.map((f) => path.resolve(f));
  }
  if (args.files.length) return args.files.map((f) => path.resolve(f));
  if (!args.dir) throw new Error('Indica --dir, --files o --filelist');
  const abs = path.resolve(args.dir);
  if (!fs.existsSync(abs)) throw new Error(`No existe: ${abs}`);
  if (fs.statSync(abs).isFile()) return [abs];
  return listJsonFiles(abs).filter((f) => /lesen-t\d/i.test(path.basename(f)));
}

function capsFindingsForBatch(batch, file) {
  const fields = collectStringsFromBatch(batch);
  const items = fields.map((f, i) => ({
    id: `${file}::${f.field}::${i}`,
    file,
    field: f.field,
    text: f.text,
  }));
  const bulk = runPosCapsBulk(items, { timeoutMs: 180_000 });
  if (bulk.skipped) return { findings: [], observations: [], error: bulk.warning };
  return {
    findings: bulk.findings || [],
    observations: bulk.observations || [],
    byReason: countBy(bulk.findings || [], (f) => f.reason),
  };
}

function countBy(arr, fn) {
  const m = {};
  for (const x of arr) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return m;
}

function teilFromFile(name) {
  const m = name.match(/lesen-t(\d)/i);
  return m ? Number(m[1]) : 0;
}

function renderMarkdown(report) {
  const r = report;
  return [
    '# German caps normalize — impact report',
    '',
    `**Gate:** ${GATE_VERSION} (sin modificar)`,
    `**Mode:** ${r.mode}`,
    `**Files:** ${r.summary.files}`,
    '',
    '## Caps gate findings',
    '',
    '| Métrica | Antes | Después | Δ |',
    '|---|---:|---:|---:|',
    `| Findings bloqueantes | ${r.summary.beforeFindings} | ${r.summary.afterFindings} | ${r.summary.deltaFindings} |`,
    `| Promedio/archivo | ${r.summary.beforeAvg} | ${r.summary.afterAvg} | ${r.summary.deltaAvg} |`,
    `| Archivos con findings | ${r.summary.beforeFilesWithFindings} | ${r.summary.afterFilesWithFindings} | ${r.summary.deltaFilesWithFindings} |`,
    '',
    '## Normalización aplicada',
    '',
    `- Token changes: ${r.summary.tokenChanges}`,
    `- Fields touched: ${r.summary.fieldsChanged}`,
    `- decap fixes: ${r.summary.decapFixed}`,
    `- cap fixes: ${r.summary.capFixed}`,
    '',
    '## Por reason code (antes → después)',
    '',
    ...Object.keys({ ...r.summary.beforeByReason, ...r.summary.afterByReason })
      .sort()
      .map((k) => `- \`${k}\`: ${r.summary.beforeByReason[k] || 0} → ${r.summary.afterByReason[k] || 0}`),
    '',
    '## Por Teil',
    '',
    '| Teil | archivos | antes | después | Δ |',
    '|---:|---:|---:|---:|---:|',
    ...Object.entries(r.byTeil).sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([t, v]) => `| T${t} | ${v.files} | ${v.before} | ${v.after} | ${v.delta} |`),
    '',
    'Detalle por archivo en el JSON de log.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = resolveFiles(args);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outJson = args.out
    ? path.resolve(args.out)
    : path.join(ROOT, 'batches/ready', `german-caps-normalize-report-${ts}.json`);
  const outMd = outJson.replace(/\.json$/i, '.md');

  console.log(`Analizando ${files.length} archivos (${args.apply ? 'APPLY' : 'dry-run'})…`);

  const fileReports = [];
  let beforeFindings = 0;
  let afterFindings = 0;
  let beforeFilesWithFindings = 0;
  let afterFilesWithFindings = 0;
  const beforeByReason = {};
  const afterByReason = {};
  const byTeil = {};
  let totalDecap = 0;
  let totalCap = 0;
  let totalFields = 0;
  let totalTokenChanges = 0;

  for (const abs of files.sort()) {
    const file = path.basename(abs);
    const teil = teilFromFile(file);
    const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

    const before = capsFindingsForBatch(batch, file);
    if (before.error) {
      console.warn(`  SKIP ${file}: ${before.error}`);
      continue;
    }

    const { batch: repaired, stats, changes } = applyGermanCapsNormalize(batch, { decapOnly: args.decapOnly });
    const after = capsFindingsForBatch(repaired, file);

    beforeFindings += before.findings.length;
    afterFindings += after.findings.length;
    if (before.findings.length) beforeFilesWithFindings++;
    if (after.findings.length) afterFilesWithFindings++;
    mergeCount(beforeByReason, before.byReason);
    mergeCount(afterByReason, after.byReason);
    totalDecap += stats.decapFixed;
    totalCap += stats.capFixed;
    totalFields += stats.fieldsChanged;
    totalTokenChanges += stats.tokenChanges;

    if (!byTeil[teil]) byTeil[teil] = { files: 0, before: 0, after: 0, delta: 0 };
    byTeil[teil].files++;
    byTeil[teil].before += before.findings.length;
    byTeil[teil].after += after.findings.length;
    byTeil[teil].delta += after.findings.length - before.findings.length;

    if (args.apply && (stats.decapFixed || stats.capFixed || stats.fieldsChanged)) {
      fs.writeFileSync(abs, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
    }

    fileReports.push({
      file,
      teil,
      beforeFindings: before.findings.length,
      afterFindings: after.findings.length,
      delta: after.findings.length - before.findings.length,
      normalize: stats,
      beforeByReason: before.byReason,
      afterByReason: after.byReason,
      removedFindings: before.findings.filter(
        (bf) => !after.findings.some((af) => af.word === bf.word && af.reason === bf.reason && af.field === bf.field),
      ),
      addedFindings: after.findings.filter(
        (af) => !before.findings.some((bf) => bf.word === af.word && bf.reason === bf.reason && bf.field === bf.field),
      ),
      changes: changes.slice(0, 50),
    });

    if (stats.fieldsChanged || before.findings.length !== after.findings.length) {
      console.log(
        `  ${file}: caps ${before.findings.length}→${after.findings.length} · norm fields=${stats.fieldsChanged}`,
      );
    }
  }

  const n = fileReports.length || 1;
  const report = {
    generatedAt: new Date().toISOString(),
    gateVersion: GATE_VERSION,
    mode: args.apply ? 'apply' : 'dry-run',
    normalizeMode: args.decapOnly ? 'decap-only' : 'full',
    sourceDir: args.dir || null,
    summary: {
      files: fileReports.length,
      beforeFindings,
      afterFindings,
      deltaFindings: afterFindings - beforeFindings,
      beforeAvg: Math.round((beforeFindings / n) * 100) / 100,
      afterAvg: Math.round((afterFindings / n) * 100) / 100,
      deltaAvg: Math.round(((afterFindings - beforeFindings) / n) * 100) / 100,
      beforeFilesWithFindings,
      afterFilesWithFindings,
      deltaFilesWithFindings: afterFilesWithFindings - beforeFilesWithFindings,
      decapFixed: totalDecap,
      capFixed: totalCap,
      fieldsChanged: totalFields,
      tokenChanges: totalTokenChanges,
      beforeByReason,
      afterByReason,
    },
    byTeil,
    files: fileReports,
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outMd, `${renderMarkdown(report)}\n`, 'utf8');

  console.log('\n── Resumen ──');
  console.log(`Findings caps: ${beforeFindings} → ${afterFindings} (Δ ${report.summary.deltaFindings})`);
  console.log(`Avg/archivo: ${report.summary.beforeAvg} → ${report.summary.afterAvg}`);
  console.log(`Normalización: decap=${totalDecap} cap=${totalCap} fields=${totalFields}`);
  console.log(`Log: ${outJson}`);
  console.log(`Report: ${outMd}`);
}

function mergeCount(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    target[k] = (target[k] || 0) + v;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
