#!/usr/bin/env node
/**
 * End-to-end level builder: Gemini bulk → pool fill → Claude residual → served (beta).
 *
 *   node scripts/build-level.mjs --lang de --level B1 --target 9 [--apply] [--yes]
 *   npm run build:level -- --lang de --level B1 --target 9 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { loadEnvFile, ROOT } from './lib/loadEnv.mjs';
import {
  comboKey,
  curatedDir,
  passagesPath,
  bankPath,
  servedExamPath,
  fidelityAuditPath,
  residualGapsPath,
  listCuratedFiles,
} from './lib/examPipeline.mjs';
import { getGenerationJobs } from './lib/coverageJobs.mjs';
import {
  buildAuditPath,
  costSnapshot,
  costDelta,
  curatedCount,
  defaultAudit,
  loadAudit,
  markPhase,
  phaseDone,
  saveAudit,
} from './lib/buildLevelStats.mjs';
import { validateCrossExamPassageUniqueness } from './lib/passageDedupe.mjs';
import { snapshotServedExam } from './snapshot-served.mjs';
import { assertCuratedCapsOrExit } from './lib/blueprintCaps.mjs';
import { runPreBuildGuard } from './pre-build-guard.mjs';

loadEnvFile();

const MERGED = path.join(ROOT, 'batches', 'merged');

function parseArgs(argv) {
  const out = {
    lang: null,
    level: null,
    target: 9,
    apply: false,
    yes: false,
    resume: true,
    bulkProvider: (process.env.GEN_PROVIDER || 'gemini').trim().toLowerCase(),
    residualProvider: 'claude',
    escalateAfter: 2,
    maxPerTopic: 2,
    dryRun: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') out.lang = String(argv[++i] || '').toLowerCase();
    else if (a === '--level') out.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--target') out.target = Math.max(1, Number(argv[++i]) || 9);
    else if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--yes') out.yes = true;
    else if (a === '--no-resume') out.resume = false;
    else if (a === '--bulk-provider') out.bulkProvider = String(argv[++i] || 'gemini').toLowerCase();
    else if (a === '--residual-provider') out.residualProvider = String(argv[++i] || 'claude').toLowerCase();
    else if (a === '--escalate-after') out.escalateAfter = Math.max(0, Number(argv[++i]) || 2);
    else if (a === '--max-per-topic') out.maxPerTopic = Math.max(1, Number(argv[++i]) || 2);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  if (out.apply) out.dryRun = false;
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/build-level.mjs --lang de --level B1 --target 9 [--apply] [--yes]

Options:
  --apply              Write curated/served (default: dry-run for fill/residual)
  --yes                Skip confirmations (generate-residual-parts)
  --bulk-provider      gemini | claude (default: gemini / GEN_PROVIDER)
  --residual-provider  claude (default)
  --escalate-after N   Extra Gemini gap rounds before Claude (default: 2)
  --no-resume          Ignore prior build audit checkpoints`);
}

function childEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32' && !env.NODE_OPTIONS?.includes('use-system-ca')) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');
  }
  return env;
}

function run(script, args, { allowFail = false, quiet = false } = {}) {
  const rel = script.startsWith('scripts/') ? script : `scripts/${script}`;
  const cmdPath = path.join(ROOT, rel);
  if (!quiet) console.log(`\n$ node ${rel} ${args.join(' ')}\n`);
  const r = spawnSync(process.execPath, [cmdPath, ...args], {
    cwd: ROOT,
    stdio: quiet ? 'pipe' : 'inherit',
    env: childEnv(),
    encoding: 'utf8',
  });
  if (r.status !== 0 && !allowFail) {
    console.error(`\n✗ Failed: ${rel} (exit ${r.status ?? 1})`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function batchHasNewContent(file, lang, level) {
  const full = path.join(MERGED, file);
  try {
    const out = execSync(
      `node scripts/merge-bank-batch.mjs --lang ${lang} --level ${level} --file "${full.replace(/\\/g, '/')}" --dry-run`,
      { cwd: ROOT, encoding: 'utf8', env: childEnv() },
    );
    const addP = parseInt(out.match(/Pasajes: \+(\d+) nuevos/)?.[1] || '0', 10);
    const addQ = parseInt(out.match(/Preguntas: \+(\d+) nuevas/)?.[1] || '0', 10);
    return addP + addQ > 0;
  } catch {
    return false;
  }
}

/**
 * batches/merged/ is shared across languages. A batch belongs to opts.lang if its
 * questions/passages declare that lang; entries without a lang field are legacy
 * German content (engine default), so they only match lang 'de'.
 */
function batchLangMatches(file, lang) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(MERGED, file), 'utf8'));
    const langs = new Set(
      [...(j.questions || []), ...(j.passages || [])]
        .map((x) => String(x.lang || x.language || 'de').toLowerCase()),
    );
    if (!langs.size) return false;
    return langs.has(String(lang).toLowerCase());
  } catch {
    return false;
  }
}

function ingestNewBatches(opts, audit) {
  if (!fs.existsSync(MERGED)) return;
  for (const file of fs.readdirSync(MERGED).filter((f) => f.endsWith('.json')).sort()) {
    if (!batchLangMatches(file, opts.lang)) continue;
    if (!batchHasNewContent(file, opts.lang, opts.level)) continue;
    const full = path.join(MERGED, file);
    const r = run(
      'ingest-to-staging.mjs',
      ['--lang', opts.lang, '--level', opts.level, '--file', full, '--auto-approve', ...(opts.dryRun ? ['--dry-run'] : [])],
      { allowFail: true, quiet: true },
    );
    if (r.status === 0) audit.stats.gemini.ingestAccepted += 1;
    else audit.stats.gemini.ingestRejected += 1;
  }
}

function assembleCurated(opts) {
  const dir = curatedDir(opts.lang, opts.level);
  fs.mkdirSync(dir, { recursive: true });
  const bank = bankPath(opts.lang, opts.level);
  const pass = passagesPath(opts.lang, opts.level);

  run('normalize-bank.mjs', ['--lang', opts.lang, '--level', opts.level, ...(opts.dryRun ? ['--dry-run'] : [])], {
    allowFail: !opts.apply,
  });
  run('fix-horen-t4-match-keys.mjs', [
    '--lang',
    opts.lang,
    '--level',
    opts.level,
    ...(opts.apply && !opts.dryRun ? ['--apply'] : []),
  ]);
  run('sync-passages-mirror.mjs', ['--lang', opts.lang, '--level', opts.level]);

  run('publish-promote-candidates.mjs', [
    '--lang',
    opts.lang,
    '--level',
    opts.level,
    '--max',
    String(opts.target),
    '--max-per-topic',
    String(opts.maxPerTopic ?? 2),
    ...(opts.dryRun ? ['--dry-run'] : []),
  ]);

  if (!listCuratedFiles(opts.lang, opts.level).length) return;

  run('sanitize-curated.mjs', ['--dir', dir, ...(opts.apply ? ['--write'] : [])], { allowFail: true });
  run('fix-exam-coherence.mjs', ['--dir', dir, '--bank', bank, ...(opts.apply ? ['--write'] : [])], {
    allowFail: true,
  });
  if (fs.existsSync(pass)) {
    run(
      'fill-missing-questions.mjs',
      ['--dir', dir, '--bank', bank, '--passages', pass, ...(opts.apply ? ['--write'] : [])],
      { allowFail: true },
    );
    run('sanitize-curated.mjs', ['--dir', dir, ...(opts.apply ? ['--write'] : [])], { allowFail: true });
  }
  run('dedupe-curated-passages.mjs', ['--lang', opts.lang, '--level', opts.level, ...(opts.apply ? ['--apply'] : ['--dry-run'])], {
    allowFail: true,
  });
}

function assertCuratedBlueprintCaps(opts) {
  if (!listCuratedFiles(opts.lang, opts.level).length) return;
  const blueprint = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'library', 'blueprints', `${opts.lang === 'de' ? 'goethe' : opts.lang === 'es' ? 'dele' : 'cambridge'}_${opts.level}.json`),
      'utf8',
    ),
  );
  assertCuratedCapsOrExit(opts.lang, opts.level, blueprint, curatedDir, listCuratedFiles);
}

function fillFromPool(opts, audit) {
  const args = ['--lang', opts.lang, '--level', opts.level, opts.apply ? '--apply' : '--dry-run'];
  run('fill-gaps-from-pool.mjs', args, { allowFail: true });
  const gapsFile = residualGapsPath(opts.lang, opts.level);
  if (fs.existsSync(gapsFile)) {
    try {
      const gaps = JSON.parse(fs.readFileSync(gapsFile, 'utf8'));
      audit.stats.pool.residualGaps = Array.isArray(gaps) ? gaps.length : 0;
    } catch {
      /* ignore */
    }
  }
}

function runResidualClaude(opts) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠ ANTHROPIC_API_KEY missing — skipping Claude residual generation.');
    return false;
  }
  const args = ['--lang', opts.lang, '--level', opts.level];
  if (opts.apply) {
    args.push('--apply');
    if (opts.yes) args.push('--yes');
  } else args.push('--dry-run');
  run('generate-residual-parts.mjs', args, { allowFail: true });
  return true;
}

function parseFidelitySummary(lang, level) {
  const auditPath = fidelityAuditPath(lang, level);
  if (!fs.existsSync(auditPath)) return { passed: 0, failed: 0, total: 0 };
  try {
    const raw = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const exams = raw.targets?.[0]?.exams || raw.exams || [];
    const passed = exams.filter((e) => e.ok).length;
    return { passed, failed: exams.length - passed, total: exams.length };
  } catch {
    return { passed: 0, failed: 0, total: 0 };
  }
}

function loadServedExams(lang, level) {
  const file = servedExamPath(lang, level);
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) {
    return raw.map((exam, i) => ({
      id: exam.topic || exam.id || `#${i + 1}`,
      exam,
    }));
  }
  return [];
}

function validateServedPassageDedupe(lang, level, { fail = false } = {}) {
  const exams = loadServedExams(lang, level);
  if (exams.length < 2) return { ok: true, violations: [] };
  const dedupe = validateCrossExamPassageUniqueness(exams);
  if (!dedupe.ok) {
    console.error(`\n✗ Cross-exam passage dedupe FAILED (${dedupe.violations.length} violation(s))`);
    dedupe.violations.slice(0, 8).forEach((v) => console.error(`  · ${v.message}`));
    if (fail) process.exit(1);
  } else {
    console.log(`\n✓ Cross-exam passage dedupe OK (${dedupe.passageCount} passages)`);
  }
  return dedupe;
}

function validateServedFidelity(lang, level) {
  run(
    'validate-exam-fidelity.mjs',
    ['--lang', lang, '--level', level, '--source', 'data/exams', '--strict'],
    { allowFail: true },
  );
  return parseFidelitySummary(lang, level);
}

function runGenerateWave(opts, round, audit, costBefore) {
  console.log(`\n══ Generate round ${round + 1} (${opts.bulkProvider}) ══\n`);
  process.env.GEN_PROVIDER = opts.bulkProvider;
  const jobs = getGenerationJobs(opts.lang, opts.level, { mode: 'gaps', targetExams: opts.target });
  if (!jobs.length) {
    console.log('No gap jobs — bank coverage sufficient for target.');
    return;
  }
  run(
    'generate-parallel.mjs',
    [
      '--lang',
      opts.lang,
      '--level',
      opts.level,
      '--provider',
      opts.bulkProvider,
      '--mode',
      'gaps',
      '--target',
      String(opts.target),
      '--no-merge',
      '--retries',
      String(Math.max(1, opts.escalateAfter)),
    ],
    { allowFail: true },
  );
  const delta = costDelta(costBefore, costSnapshot());
  audit.stats.gemini.estimatedUSD += delta.geminiUSD;
  if (opts.bulkProvider === 'claude') audit.stats.claude.estimatedUSD += delta.claudeUSD;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (!opts.lang || !opts.level) {
    console.error('Required: --lang and --level');
    usage();
    process.exit(2);
  }

  let audit = loadAudit(opts.lang, opts.level);
  if (!audit || !opts.resume) audit = defaultAudit(opts.lang, opts.level, opts.target);
  else audit.target = opts.target;

  console.log('\n═══════════════════════════════════════════════════');
  console.log(` build-level — ${comboKey(opts.lang, opts.level)} → ${opts.target} exams`);
  console.log(` mode: ${opts.apply ? 'APPLY' : 'dry-run'} | bulk: ${opts.bulkProvider}`);
  console.log('═══════════════════════════════════════════════════\n');

  let servedSnapshotPath = null;
  if (opts.apply) {
    servedSnapshotPath = snapshotServedExam(opts.lang, opts.level);
  }

  if (!phaseDone(audit, 'preflight')) {
    if (opts.bulkProvider === 'gemini') {
      run('gemini-doctor.mjs', [
        '--lang',
        opts.lang,
        '--level',
        opts.level,
        '--target',
        String(opts.target),
        '--ping',
      ]);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠ ANTHROPIC_API_KEY not set — Claude residual phase will be skipped.');
    }
    markPhase(audit, 'preflight');
    saveAudit(audit);
  }

  const roundLog = { at: new Date().toISOString(), curatedBefore: curatedCount(opts.lang, opts.level) };

  for (let round = 0; round <= opts.escalateAfter; round++) {
    const needMore = curatedCount(opts.lang, opts.level) < opts.target;
    const hasJobs = getGenerationJobs(opts.lang, opts.level, { mode: 'gaps', targetExams: opts.target }).length > 0;
    if (!needMore && round > 0) break;
    if (round > 0 && !hasJobs && needMore) break;

    if (needMore && hasJobs) {
      runGenerateWave(opts, round, audit, costSnapshot());
      ingestNewBatches(opts, audit);
      run('promote-approved.mjs', ['--lang', opts.lang, '--level', opts.level, ...(opts.dryRun ? ['--dry-run'] : [])], {
        allowFail: true,
      });
    }

    assembleCurated(opts);
    fillFromPool(opts, audit);
    roundLog[`round${round}`] = { curated: curatedCount(opts.lang, opts.level) };
    saveAudit(audit);
    if (curatedCount(opts.lang, opts.level) >= opts.target) break;
  }

  if (opts.apply) {
    assertCuratedBlueprintCaps(opts);
  }

  const claudeBefore = costSnapshot();
  if (runResidualClaude(opts)) {
    audit.stats.claude.estimatedUSD += costDelta(claudeBefore, costSnapshot()).claudeUSD;
    markPhase(audit, 'residual_claude');
  }

  if (opts.apply && listCuratedFiles(opts.lang, opts.level).length) {
    run('sanitize-curated.mjs', ['--dir', curatedDir(opts.lang, opts.level), '--write'], { allowFail: true });
  }

  if (listCuratedFiles(opts.lang, opts.level).length) {
    if (opts.apply) {
      const guard = runPreBuildGuard({
        lang: opts.lang,
        level: opts.level,
        snapshotPath: servedSnapshotPath,
        apply: true,
      });
      audit.stats.curated.count = curatedCount(opts.lang, opts.level);
      if (!guard.ok) {
        markPhase(audit, 'pre_build_guard', { ok: false, reverted: guard.reverted });
        saveAudit(audit);
        console.error('\n✗ build-level aborted — pre-build-guard failed (served reverted)');
        process.exit(1);
      }
      const fid = parseFidelitySummary(opts.lang, opts.level);
      const exams = loadServedExams(opts.lang, opts.level);
      const dedupe =
        exams.length >= 2
          ? validateCrossExamPassageUniqueness(exams)
          : { ok: true, violations: [] };
      audit.stats.curated.passageDedupeOk = dedupe.ok;
      audit.stats.curated.passageDedupeViolations = dedupe.violations?.length || 0;
      audit.stats.curated.fidelityPassed = fid.passed;
      audit.stats.curated.fidelityFailed = fid.failed;
      markPhase(audit, 'fidelity', { ...fid, passageDedupe: dedupe.ok });
      markPhase(audit, 'pre_build_guard', { ok: true });
    } else {
      run('curated-to-served.mjs', ['--lang', opts.lang, '--level', opts.level], { allowFail: true });
      validateServedPassageDedupe(opts.lang, opts.level, { fail: false });
      validateServedFidelity(opts.lang, opts.level);
    }
  }

  run('build-availability.mjs', ['--cap-status', 'beta', '--cap-lang', opts.lang, '--cap-level', opts.level]);
  markPhase(audit, 'availability', { capped: 'beta' });

  if (opts.apply && !process.env.SKIP_PREGENERATE_TTS) {
    console.log('\n══ Hören TTS cache (served exams) ══\n');
    run('pregenerate-tts.mjs', ['--lang', opts.lang, '--level', opts.level, '--verify'], {
      allowFail: true,
    });
    markPhase(audit, 'pregenerate_tts', { lang: opts.lang, level: opts.level });
  }

  roundLog.curatedAfter = curatedCount(opts.lang, opts.level);
  audit.rounds.push(roundLog);
  saveAudit(audit);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' build-level summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Curated:      ${audit.stats.curated.count}/${opts.target}`);
  console.log(`  Fidelity:     ${audit.stats.curated.fidelityPassed} ok / ${audit.stats.curated.fidelityFailed} fail`);
  console.log(`  Gemini est.:  $${audit.stats.gemini.estimatedUSD.toFixed(4)}`);
  console.log(`  Claude est.:  $${audit.stats.claude.estimatedUSD.toFixed(4)}`);
  console.log(`  Availability: beta (manual live after validate:fidelity ${opts.target}/${opts.target})`);
  console.log(`  Audit:        ${path.relative(ROOT, buildAuditPath(opts.lang, opts.level))}`);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
