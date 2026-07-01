#!/usr/bin/env node
/**
 * Pre-build guard — validate curated→served BEFORE accepting a build.
 * On failure: revert data/exams/<lang>_<level>.json from snapshot (no corrupt served).
 *
 *   node scripts/pre-build-guard.mjs --lang de --level B1 --snapshot data/exams/_snapshots/de_B1....json
 *   node scripts/pre-build-guard.mjs --lang de --level B1 --dry-run   # validate curated only, no write
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT, loadEnvFile } from './lib/loadEnv.mjs';
import {
  comboKey,
  curatedDir,
  listCuratedFiles,
  servedExamPath,
  fidelityAuditPath,
} from './lib/examPipeline.mjs';
import { validateCrossExamPassageUniqueness } from './lib/passageDedupe.mjs';
import { restoreServedSnapshot, snapshotServedExam } from './snapshot-served.mjs';
import { collectCuratedCapViolations } from './lib/blueprintCaps.mjs';

loadEnvFile();

const require = createRequire(import.meta.url);
const { validateExamAgainstBlueprint } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintFidelity.js',
));

function parseArgs(argv) {
  const out = { lang: null, level: null, snapshot: null, dryRun: false, apply: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i] || '').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
    } else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function blueprintPath(lang, level) {
  const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
  return path.join(ROOT, 'library', 'blueprints', `${type}_${level}.json`);
}

function loadServedExams(lang, level) {
  const file = servedExamPath(lang, level);
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) return [];
  return raw.map((exam, i) => ({
    id: exam.topic || exam.id || `#${i + 1}`,
    exam,
  }));
}

function validateCuratedFidelity(lang, level, blueprint) {
  const dir = curatedDir(lang, level);
  const files = listCuratedFiles(lang, level);
  const exams = [];
  let failed = 0;
  for (const f of files) {
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const exam = w.exam || w;
    const topic = w.topic || exam.topic || f;
    const r = validateExamAgainstBlueprint(exam, blueprint);
    exams.push({ id: topic, exam });
    if (!r.ok) {
      failed += 1;
      console.error(`  ✗ curated ${topic}: ${r.errors.slice(0, 2).join('; ')}`);
    }
  }
  const dedupe = exams.length >= 2 ? validateCrossExamPassageUniqueness(exams) : { ok: true, violations: [] };
  if (!dedupe.ok) {
    dedupe.violations.slice(0, 5).forEach((v) => console.error(`  ✗ dedupe: ${v.message}`));
  }
  return {
    ok: failed === 0 && dedupe.ok,
    examCount: files.length,
    fidelityFailed: failed,
    dedupeOk: dedupe.ok,
    dedupeViolations: dedupe.violations?.length || 0,
  };
}

function runScript(script, args) {
  const rel = script.startsWith('scripts/') ? script : `scripts/${script}`;
  const r = spawnSync(process.execPath, [path.join(ROOT, rel), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  return r.status === 0;
}

/**
 * @returns {{ ok: boolean, snapshotPath: string|null, reverted: boolean }}
 */
export function runPreBuildGuard({ lang, level, snapshotPath = null, apply = true, dryRun = false } = {}) {
  if (!lang || !level) throw new Error('runPreBuildGuard requires lang and level');

  const combo = comboKey(lang, level);
  console.log(`\n══ pre-build-guard ══ ${combo} ══`);

  if (!listCuratedFiles(lang, level).length) {
    console.warn('  skip — no curated exams');
    return { ok: true, snapshotPath, reverted: false };
  }

  if (!fs.existsSync(blueprintPath(lang, level))) {
    console.error(`  ✗ missing blueprint for ${combo}`);
    return { ok: false, snapshotPath, reverted: false };
  }
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath(lang, level), 'utf8'));

  const capViolations = collectCuratedCapViolations(lang, level, blueprint, curatedDir, listCuratedFiles);
  if (capViolations.length) {
    console.error(`  ✗ blueprint cap violations (${capViolations.length})`);
    capViolations.slice(0, 5).forEach((v) => console.error(`    · ${v}`));
    return { ok: false, snapshotPath, reverted: false };
  }

  const curatedCheck = validateCuratedFidelity(lang, level, blueprint);
  if (!curatedCheck.ok) {
    console.error(
      `  ✗ curated check failed (fidelity ${curatedCheck.examCount - curatedCheck.fidelityFailed}/${curatedCheck.examCount}, dedupe ${curatedCheck.dedupeOk ? 'OK' : 'FAIL'})`,
    );
    return { ok: false, snapshotPath, reverted: false };
  }
  console.log(`  ✓ curated ${curatedCheck.examCount}/${curatedCheck.examCount} fidelity + dedupe`);

  if (dryRun || !apply) {
    console.log('  dry-run — served not written');
    return { ok: true, snapshotPath, reverted: false };
  }

  let snap = snapshotPath;
  if (!snap) snap = snapshotServedExam(lang, level, { quiet: true });

  if (!runScript('curated-to-served.mjs', ['--lang', lang, '--level', level])) {
    if (snap) restoreServedSnapshot(snap, lang, level);
    return { ok: false, snapshotPath: snap, reverted: !!snap };
  }

  const served = loadServedExams(lang, level);
  let servedFailed = 0;
  for (const { id, exam } of served) {
    const r = validateExamAgainstBlueprint(exam, blueprint);
    if (!r.ok) {
      servedFailed += 1;
      console.error(`  ✗ served ${id}: ${r.errors.slice(0, 2).join('; ')}`);
    }
  }
  const dedupe = served.length >= 2 ? validateCrossExamPassageUniqueness(served) : { ok: true };
  const ok = servedFailed === 0 && dedupe.ok && served.length > 0;

  if (!ok) {
    console.error('  ✗ served validation failed — reverting snapshot');
    if (snap) restoreServedSnapshot(snap, lang, level);
    else console.warn('  ⚠ no snapshot to restore');
    return { ok: false, snapshotPath: snap, reverted: !!snap };
  }

  runScript('validate-exam-fidelity.mjs', ['--lang', lang, '--level', level, '--strict']);
  console.log(`  ✓ served ${served.length} exams — fidelity + dedupe OK`);
  return { ok: true, snapshotPath: snap, reverted: false };
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.lang || !opts.level) {
    console.log(`Usage: node scripts/pre-build-guard.mjs --lang de --level B1 [--snapshot path] [--dry-run]`);
    process.exit(opts.help ? 0 : 2);
  }
  const result = runPreBuildGuard({
    lang: opts.lang,
    level: opts.level,
    snapshotPath: opts.snapshot,
    apply: opts.apply,
    dryRun: opts.dryRun,
  });
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
