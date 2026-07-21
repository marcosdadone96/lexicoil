#!/usr/bin/env node
/**
 * PASO 9/10 — Run quality gates (advisory by default).
 *
 *   node scripts/run-quality-gates.mjs path/to/part.json
 *   node scripts/run-quality-gates.mjs batches/generated/ --policy review
 *   node scripts/run-quality-gates.mjs batches/generated/ --policy enforced --out-dir …
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQualityGates } from './lib/qualityGates/qualityGateRunner.mjs';
import { canPromotePart, loadQualityGatePolicy } from './lib/qualityGates/qualityGatePolicy.mjs';
import { writeQualityDashboard } from './lib/qualityGates/buildQualityDashboard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { targets: [], outDir: null, help: false, feedbackFile: null, policy: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--out-dir' && argv[i + 1]) out.outDir = argv[++i];
    else if (a === '--feedback-file' && argv[i + 1]) out.feedbackFile = argv[++i];
    else if (a === '--policy' && argv[i + 1]) out.policy = argv[++i];
    else if (!a.startsWith('-')) out.targets.push(a);
  }
  return out;
}

function listJsonFiles(target) {
  const abs = path.resolve(ROOT, target);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return abs.endsWith('.json') ? [abs] : [];
  const files = [];
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith('.json')) continue;
    if (name.includes('.raw.')) continue;
    if (name.startsWith('.')) continue;
    if (name.includes('qualityReport') || name.includes('report')) continue;
    const p = path.join(abs, name);
    if (fs.statSync(p).isFile()) files.push(p);
  }
  return files.sort();
}

function loadFeedbackRules(feedbackFile) {
  if (!feedbackFile) return [];
  const p = path.resolve(ROOT, feedbackFile);
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(data)) return data;
  return data.feedback || data.rules || [];
}

function printTable(rows, policyMode) {
  const counts = { PASS: 0, WARNING: 0, FAIL: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log('');
  console.log('═'.repeat(72));
  console.log(`Policy: ${policyMode}`);
  console.log(
    `${'STATUS'.padEnd(10)} ${'PROMOTE'.padEnd(8)} ${'PART'.padEnd(32)} ${'E/W'.padEnd(6)} STAGING`,
  );
  console.log('─'.repeat(72));
  for (const r of rows) {
    const ew = `${r.summary?.errors ?? 0}/${r.summary?.warnings ?? 0}`;
    const promote = r.promotion?.allowed ? 'yes' : 'no';
    console.log(
      `${r.status.padEnd(10)} ${promote.padEnd(8)} ${String(r.partId).slice(0, 32).padEnd(32)} ${ew.padEnd(6)} ${r.stagingStatus}`,
    );
  }
  console.log('─'.repeat(72));
  console.log(`PASS ${counts.PASS}   WARNING ${counts.WARNING}   FAIL ${counts.FAIL}`);
  console.log('═'.repeat(72));
  if (policyMode === 'advisory') {
    console.log('(advisory — promotion never blocked by this CLI)');
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.targets.length) {
    console.log(`Usage:
  node scripts/run-quality-gates.mjs <file-or-dir> [--policy advisory|review|enforced]
       [--out-dir DIR] [--feedback-file FILE]
`);
    process.exit(args.help ? 0 : 1);
  }

  const policy = loadQualityGatePolicy({ mode: args.policy || undefined });
  const files = args.targets.flatMap(listJsonFiles);
  if (!files.length) {
    console.error('No JSON files found.');
    process.exit(1);
  }

  const feedbackRules = loadFeedbackRules(args.feedbackFile);
  const outDir = args.outDir
    ? path.resolve(ROOT, args.outDir)
    : path.join(ROOT, 'generation-evaluation', 'quality-reports');
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [];
  for (const file of files) {
    let part;
    try {
      part = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      const fail = {
        partId: path.basename(file),
        source: path.relative(ROOT, file).replace(/\\/g, '/'),
        status: 'FAIL',
        stagingStatus: 'rejected',
        summary: { errors: 1, warnings: 0 },
        gates: [{ name: 'json_parse', status: 'FAIL', errors: [err.message], details: [] }],
        policyMode: policy.mode,
        mode: policy.mode,
        generatedAt: new Date().toISOString(),
      };
      fail.promotion = canPromotePart(fail, { mode: policy.mode });
      rows.push(fail);
      continue;
    }

    const report = await runQualityGates({
      part,
      source: path.relative(ROOT, file).replace(/\\/g, '/'),
      feedbackRules,
      metadata: part.generationMetadata,
      policyMode: policy.mode,
    });
    report.promotion = canPromotePart(report, { mode: policy.mode });
    // Persist qualityMetadata on a sidecar report only (do not rewrite source JSON)
    rows.push(report);

    const outName = path.basename(file, '.json') + '.qualityReport.json';
    fs.writeFileSync(path.join(outDir, outName), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const counts = printTable(rows, policy.mode);
  const summaryPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        policyMode: policy.mode,
        counts,
        files: rows.length,
        reports: rows.map((r) => ({
          partId: r.partId,
          source: r.source,
          status: r.status,
          stagingStatus: r.stagingStatus,
          promoteAllowed: r.promotion?.allowed,
          qualityMetadata: r.qualityMetadata || null,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const dashPath = path.join(ROOT, 'generation-evaluation', 'reports', 'QUALITY-DASHBOARD.json');
  writeQualityDashboard(rows, dashPath);
  console.log(`Reports → ${path.relative(ROOT, outDir).replace(/\\/g, '/')}`);
  console.log(`Dashboard → ${path.relative(ROOT, dashPath).replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
