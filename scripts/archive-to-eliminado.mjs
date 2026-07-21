#!/usr/bin/env node
/**
 * Mueve artefactos obsoletos / one-shot a eliminado/ (sin borrar).
 *   node scripts/archive-to-eliminado.mjs           # dry-run
 *   node scripts/archive-to-eliminado.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
const ARCHIVE_ROOT = path.join(ROOT, 'eliminado');
const manifest = [];

/** @param {string} rel — path relative to ROOT */
function moveRel(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(ARCHIVE_ROOT, rel.replace(/\\/g, '/'));
  manifest.push({ from: rel.replace(/\\/g, '/'), to: path.relative(ROOT, dest).replace(/\\/g, '/') });
  if (!apply) return true;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    throw new Error(`destino ya existe: ${path.relative(ROOT, dest)}`);
  }
  const stat = fs.statSync(src);
  try {
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } else {
      fs.renameSync(src, dest);
    }
  } catch (err) {
    if (stat.isDirectory()) throw err;
    if (err.code === 'EPERM' || err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
  return true;
}

/** Move entire directory tree */
function moveDir(rel) {
  return moveRel(rel);
}

/** Move files matching glob-like patterns in a directory (non-recursive unless recursive) */
function moveFilesInDir(dirRel, { pattern = null, recursive = false, exclude = [] } = {}) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d, base) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = path.join(base, ent.name).replace(/\\/g, '/');
      if (exclude.some((e) => rel.endsWith(e) || rel.includes(e))) continue;
      const full = path.join(ROOT, rel);
      if (ent.isDirectory()) {
        if (recursive) walk(full, rel);
        continue;
      }
      if (pattern && !pattern.test(ent.name)) continue;
      if (moveRel(rel)) n++;
    }
  };
  walk(dir, dirRel.replace(/\\/g, '/'));
  return n;
}

// ── 1. Whole directories ─────────────────────────────────────────────────────
const WHOLE_DIRS = [
  '_archive',
  'claude-audit-pack',
  'para-claude-revision',
  'para-claude-verificacion',
  '.review-bundle-staging',
  'generation-evaluation',
  'lab',
  'export',
  'backups',
  'queue',
  'docs/audit',
  'data/snapshots',
  '.venv-pos-check',
  // batches experiments / junk
  'batches/pilot-holdout',
  'batches/generated/experiment-t1-fewshot-ab',
  'batches/generated/pilot-gate-control',
  'batches/generated/sem2-calibration',
  'batches/generated/.rejected',
  'batches/.rejected',
  'batches/rejected',
  'batches/reports',
  'batches/.staging',
  'batches/_fixtures',
  'batches/fixtures',
  'batches/ready/canary-all-staging-2026-07-11',
  'batches/ready/horen-t1-staging-2026-07-11',
  'batches/ready/horen-t3-staging-2026-07-11-canary',
  'batches/ready/lesen-t4-staging-2026-07-11-canary',
  'batches/ready/lesen-t5-staging-2026-07-11-canary',
  'batches/ready/assembled-review',
  'batches/ready/assembled-from-verified',
  'library/reusable-seed/backups',
  'library/de/B1/backups',
];

// ── 2. Top-level files (audit artifacts, logs, zips) ─────────────────────────
const TOP_FILES = [
  'ARQUITECTURA-SISTEMA-ANALISIS.md',
  'AUDIT-B1-PIPELINE.md',
  'AUDIT-BRIEFING-PARA-CLAUDE.md',
  'PARA-CLAUDE-auditoria-learning-loop-PASO4-13.md',
  'PARA-CLAUDE-auditoria-pipeline-completo.md',
  'PROMPT-auditoria-claude-final.md',
  'diagnostico-t4-t5.md',
  'exam-tagging-extension.md',
  'migration-certification-report.md',
  'MIGRATION_SUMMARY.md',
  'assembled-exam-b1-clean.json',
  'assembled-exam-b1-e1.json',
  'audit-de_B1.json',
  'audit-pass2-report.json',
  'pool-sample-audit.json',
  'sem1-findings-baseline.json',
  'tmp-audit-now.json',
  'informe.json',
  '.tmp-seed-1870963.json',
  '_tmp_health.json',
  '_debug_cases.py',
  'pub-err.txt',
  'pub-out.txt',
  'publish-rejected.log',
  'test-engine-out.txt',
  'test-engine-output.txt',
  'repro-chrome-err.txt',
  'lesen-t2-review.txt',
  'query',
  'export.zip',
  'lexicoil-trust-refactor-dist.zip',
  'pool-test.html',
  'para-claude-auditoria.zip',
  'para-claude-revision.zip',
  'para-claude-verificacion.zip',
  'review-bundle-2026-07-09.zip',
  'GUIA-GENERACION-MUESTRAS.md',
];

// ── 3. Historical decision docs in batches/ready ─────────────────────────────
const READY_MD_ARCHIVE = [
  'SPRECHEN-F1A-DECISIONS-2026-07-10.md',
  'SPRECHEN-F3-EVAL-AUDIT-2026-07-10.md',
  'SPRECHEN-AUDIT-2026-07-10.md',
  'SPRECHEN-PREMISE-DUPES-2026-07-10.md',
  'SPRECHEN-TESTGEN-PROMPT-DRYRUN-2026-07-10.md',
  'VOCAB-A2-BANK-CLEAN-2026-07-15.md',
  'VOCAB-B1-BANK-CLEAN-2026-07-10.md',
  'VOCAB-COST-ANALYSIS-2026-07-13.md',
  'VOCAB-WHITELIST-B1-2026-07-10.md',
  'POOL-METADATA-BACKFILL-2026-07-10.md',
  'PHASE1-RESULTS.md',
  'PHASE1-G2-DRYRUN.md',
  'PHASE1-G2-6-NEW-FINDINGS-ANALYSIS.md',
  'PHASE1-PRODUCTION-15-DRYRUN.md',
  'G2-DECAP-ONLY-ITERATION2-ANALYSIS.md',
  'G2-DECAP-ONLY-ITERATION3-RESULTS.md',
  'G2-DECAP-ONLY-IMPACT.md',
  'g2-simulation-G1.1.md',
  'g2-pool-fp-analysis.md',
  'g1-impl-diff-v6.1-B-to-G1.md',
  'g1-simulation-diff-v6.1-B.md',
  'german-caps-normalize-cal-pool-decap-only-impact.md',
  'german-caps-normalize-cal-pool-impact.md',
  'adj-before-noun-report-v6.1-B.md',
  'Q-DRYRUN-WAVE1.md',
  'Q-DRYRUN-WAVE1b.md',
  'V3-POST-HUMAN-REVIEW-15.md',
  'V3-PRODUCTION-15-GENERATED.md',
  'HOREN-BACKLOG-REPROCESS.md',
];

// ── 4. One-off scripts (not in package.json pipeline) ────────────────────────
const SCRIPT_KEEP = new Set([
  'archive-to-eliminado.mjs',
  'migrate-staging-by-level.mjs',
  'generate-cli.mjs',
  'audit-pass-2.mjs',
  'blacklist.mjs',
  'netlify-dev.mjs',
  'netlify-dev-hybrid.mjs',
]);

const SCRIPT_PATTERNS = [
  /-2026-\d{2}-\d{2}\.mjs$/i,
  /^reprocess-.*\.mjs$/i,
  /^pilot-.*\.mjs$/i,
  /^sem\d.*\.mjs$/i,
  /^diagnose-.*\.mjs$/i,
  /^diag.*\.mjs$/i,
  /^experiment-.*\.mjs$/i,
  /^build-review-bundle-.*\.mjs$/i,
  /^prepare-generation-evaluation\.mjs$/i,
  /^pilot-holdout-caps-validation\.mjs$/i,
  /^_[^/\\]+\.mjs$/i,
  /^probe-.*\.mjs$/i,
  /^verify-opt-.*\.mjs$/i,
  /^remediate-.*\.mjs$/i,
  /^execute-staging-.*\.mjs$/i,
  /^staging-surgical-.*\.mjs$/i,
  /^prelaunch-verify-.*\.mjs$/i,
  /^promote-lesen-t2-.*\.mjs$/i,
  /^run-german-caps-v32-.*\.mjs$/i,
  /^run-q2-answer-key-dryrun\.mjs$/i,
  /^run-quality-gates-dryrun\.mjs$/i,
];

function shouldArchiveScript(name) {
  if (SCRIPT_KEEP.has(name)) return false;
  return SCRIPT_PATTERNS.some((re) => re.test(name));
}

// gate-logs: archive bulk, keep active jsonl
const GATE_LOGS_KEEP = new Set([
  'g2-findings-log.jsonl',
  'generation-cost.jsonl',
]);

function main() {
  let count = 0;
  if (apply) fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });

  for (const d of WHOLE_DIRS) {
    if (moveDir(d)) count++;
  }

  for (const f of TOP_FILES) {
    if (moveRel(f)) count++;
  }

  for (const md of READY_MD_ARCHIVE) {
    if (moveRel(`batches/ready/${md}`)) count++;
  }

  // gate-logs bulk
  const gateDir = path.join(ROOT, 'batches/ready/gate-logs');
  if (fs.existsSync(gateDir)) {
    for (const name of fs.readdirSync(gateDir)) {
      if (GATE_LOGS_KEEP.has(name)) continue;
      const rel = `batches/ready/gate-logs/${name}`;
      if (moveRel(rel)) count++;
    }
  }

  // one-off scripts
  const scriptsDir = path.join(ROOT, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    for (const name of fs.readdirSync(scriptsDir)) {
      if (!name.endsWith('.mjs')) continue;
      if (!shouldArchiveScript(name)) continue;
      if (moveRel(`scripts/${name}`)) count++;
    }
  }

  // generated reports (not exam batches)
  const genReports = [
    'batches/generated/B1/experiment-generator-quality-report.json',
    'batches/generated/B1/german-caps-gate-report-v2.json',
    'batches/generated/B1/german-caps-gate-report.json',
  ];
  for (const r of genReports) {
    if (moveRel(r)) count++;
  }

  const mode = apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n══ archive-to-eliminado (${mode}) ══`);
  console.log(`Items a mover: ${manifest.length}`);

  if (apply) {
    fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
    const readme = [
      '# eliminado/',
      '',
      `Archivado automáticamente el ${new Date().toISOString().slice(0, 10)}.`,
      'Contenido movido (no borrado) desde lexiloop. Rutas relativas preservadas.',
      '',
      `Total items: ${manifest.length}`,
      '',
      'Para restaurar: mover de vuelta a la ruta original bajo la raíz del repo.',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(ARCHIVE_ROOT, 'README.md'), readme, 'utf8');
    fs.writeFileSync(
      path.join(ARCHIVE_ROOT, 'MANIFEST.json'),
      `${JSON.stringify({ archivedAt: new Date().toISOString(), items: manifest }, null, 2)}\n`,
      'utf8',
    );
    console.log(`Manifest → eliminado/MANIFEST.json`);
  } else {
    console.log('\nPrimeros 25:');
    for (const m of manifest.slice(0, 25)) {
      console.log(`  ${m.from}`);
    }
    if (manifest.length > 25) console.log(`  … +${manifest.length - 25} más`);
    console.log('\nDry-run. Usá --apply para mover.');
  }
}

main();
