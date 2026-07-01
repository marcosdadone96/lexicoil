#!/usr/bin/env node
/**
 * Strict exam vs blueprint fidelity gate.
 * Usage:
 *   node scripts/validate-exam-fidelity.mjs --lang de --level B1 --strict
 *   node scripts/validate-exam-fidelity.mjs --all --strict
 *   node scripts/validate-exam-fidelity.mjs --lang de --level B1 --source library/curated/de/B1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  resolveBlueprintForLangLevel,
  fidelityAuditPath,
  servedExamRel,
  comboKey,
  ROOT as PIPE_ROOT,
} from './lib/examPipeline.mjs';
import {
  validateCrossExamPassageUniqueness,
  formatPassageDedupeReport,
} from './lib/passageDedupe.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { validateExamAgainstBlueprint } = require(path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'));

function parseArgs(argv) {
  const opts = {
    lang: null,
    level: null,
    source: 'data/exams',
    strict: false,
    all: false,
    liveOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') opts.strict = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--live-only') opts.liveOnly = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--source') opts.source = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node scripts/validate-exam-fidelity.mjs --lang de --level B1 [--source data/exams] [--strict]
  node scripts/validate-exam-fidelity.mjs --all [--strict] [--live-only]

Options:
  --lang     Language code (de, en, es)
  --level    CEFR level (A1–C2)
  --source   Exam root (default: data/exams)
  --all      Validate every data/exams/<lang>_<LEVEL>.json file
  --strict   Exit 1 when any exam fails (respects --live-only when set)
  --live-only  With --all: fail CI only for availability status "live"; beta levels report only`);
}

function loadAvailabilityManifest() {
  const p = path.join(ROOT, 'data/exams/availability.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function availabilityStatus(manifest, lang, level) {
  return manifest?.[lang]?.[level]?.status || 'hidden';
}

function loadExamsFromPath(absPath, relLabel) {
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  if (Array.isArray(raw)) {
    return raw.map((exam, i) => ({
      id: exam.id || exam.topic || `${relLabel}#${i + 1}`,
      exam,
    }));
  }
  if (raw.exam) return [{ id: raw.id || relLabel, exam: raw.exam }];
  if (raw.lesenParts || raw.modules) return [{ id: relLabel, exam: raw }];
  return [];
}

function discoverTargets(opts) {
  const targets = [];
  if (opts.all) {
    const dir = path.join(ROOT, 'data/exams');
    if (!fs.existsSync(dir)) return targets;
    for (const f of fs.readdirSync(dir).sort()) {
      const m = f.match(/^([a-z]{2})_([A-C][12])\.json$/i);
      if (!m) continue;
      targets.push({
        lang: m[1],
        level: m[2].toUpperCase(),
        file: path.join(dir, f),
        rel: path.join('data/exams', f),
      });
    }
    return targets;
  }
  if (!opts.lang || !opts.level) return targets;
  const rel =
    opts.source === 'data/exams'
      ? servedExamRel(opts.lang, opts.level)
      : path.join(opts.source, `${comboKey(opts.lang, opts.level)}.json`);
  const abs = path.isAbsolute(opts.source)
    ? path.join(opts.source, `${comboKey(opts.lang, opts.level)}.json`)
    : path.join(PIPE_ROOT || ROOT, rel);
  targets.push({ lang: opts.lang, level: opts.level, file: abs, rel });
  return targets;
}

function printExamReport(entry) {
  console.log(`\n── ${entry.examLabel} (${entry.lang}_${entry.level})`);
  if (entry.warnings?.length) {
    entry.warnings.slice(0, 4).forEach((w) => console.log(`   WARN — ${w}`));
    if (entry.warnings.length > 4) console.log(`   WARN — … +${entry.warnings.length - 4} more`);
  }
  if (entry.ok) {
    console.log('   OK — blueprint fidelity');
    return;
  }
  console.log(`   FAIL — ${entry.errors.length} issue(s)`);
  for (const d of entry.details || []) {
    if (!d.issues?.length) continue;
    const bits = [];
    if (d.itemsTotal) bits.push(`items ${d.itemsTotal.received}/${d.itemsTotal.expected}`);
    if (d.passagesPerPart) bits.push(`passages ${d.passagesPerPart.received}/${d.passagesPerPart.expected}`);
    console.log(`   · ${d.module} Teil ${d.teil} (${d.slotType})${bits.length ? ': ' + bits.join(', ') : ''}`);
    d.issues.slice(0, 6).forEach((msg) => console.log(`       - ${msg}`));
    if (d.issues.length > 6) console.log(`       … +${d.issues.length - 6} more`);
  }
  const unattributed = entry.errors.filter((e) =>
    !(entry.details || []).some((d) => d.issues?.includes(e)),
  );
  unattributed.slice(0, 8).forEach((msg) => console.log(`   · ${msg}`));
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const targets = discoverTargets(opts);
  if (!targets.length) {
    console.error('Specify --lang and --level, or --all');
    usage();
    process.exit(2);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    strict: opts.strict,
    liveOnly: opts.liveOnly,
    targets: [],
    summary: { exams: 0, passed: 0, failed: 0, totalErrors: 0, passageDedupeFailed: 0, betaReported: 0 },
  };

  let exitCode = 0;
  const availability = opts.liveOnly ? loadAvailabilityManifest() : null;
  if (opts.liveOnly && !availability) {
    console.warn('Warning: --live-only set but data/exams/availability.json missing — treating all as live');
  }

  for (const target of targets) {
    const levelStatus = availability
      ? availabilityStatus(availability, target.lang, target.level)
      : 'live';
    const enforceStrict = opts.strict && (!opts.liveOnly || levelStatus === 'live');
    if (!fs.existsSync(target.file)) {
      console.error(`Missing exam file: ${target.rel}`);
      if (enforceStrict) exitCode = 1;
      continue;
    }

    const blueprint = resolveBlueprintForLangLevel(target.lang, target.level);
    if (!blueprint) {
      console.error(`No blueprint for ${target.lang}_${target.level}`);
      if (enforceStrict) exitCode = 1;
      continue;
    }

    let exams;
    try {
      exams = loadExamsFromPath(target.file, target.rel);
    } catch (e) {
      console.error(`Failed to parse ${target.rel}: ${e.message}`);
      if (enforceStrict) exitCode = 1;
      continue;
    }

    const outJson = fidelityAuditPath(target.lang, target.level);
    fs.mkdirSync(path.dirname(outJson), { recursive: true });

    const targetReport = {
      lang: target.lang,
      level: target.level,
      source: target.rel,
      blueprintId: blueprint.id,
      availabilityStatus: levelStatus,
      exams: [],
    };

    const statusTag =
      opts.liveOnly && levelStatus !== 'live'
        ? ` [${levelStatus} — report only]`
        : '';
    console.log(`\n=== ${target.lang.toUpperCase()} ${target.level}${statusTag} — ${target.rel} (${exams.length} exam(s)) ===`);

    for (const { id, exam } of exams) {
      const examLabel = `${target.rel} :: ${id}`;
      const result = validateExamAgainstBlueprint(exam, blueprint, { examLabel });
      const row = {
        examLabel,
        id,
        topic: exam.topic,
        ok: result.ok,
        errorCount: result.errors.length,
        warningCount: result.warnings?.length || 0,
        errors: result.errors,
        warnings: result.warnings || [],
        details: result.details,
      };
      targetReport.exams.push(row);
      report.summary.exams += 1;
      if (result.ok) report.summary.passed += 1;
      else {
        report.summary.failed += 1;
        report.summary.totalErrors += result.errors.length;
        if (enforceStrict) exitCode = 1;
        else if (opts.liveOnly && levelStatus !== 'live') report.summary.betaReported += 1;
      }
      printExamReport({ ...row, lang: target.lang, level: target.level });
    }

    const dedupe = validateCrossExamPassageUniqueness(
      exams.map(({ id, exam }) => ({
        id,
        exam,
        label: `${target.rel} :: ${id}`,
      })),
    );
    targetReport.passageDedupe = dedupe;
    console.log(`\n── Cross-exam passage dedupe (${exams.length} exams)`);
    formatPassageDedupeReport(dedupe).forEach((line) => console.log(line));
    if (!dedupe.ok) {
      report.summary.passageDedupeFailed += 1;
      report.summary.totalErrors += dedupe.violations.length;
      if (enforceStrict) exitCode = 1;
      else if (opts.liveOnly && levelStatus === 'beta') report.summary.betaReported += 1;
    }

    fs.writeFileSync(outJson, JSON.stringify(targetReport, null, 2) + '\n', 'utf8');
    console.log(`\nAudit JSON: ${path.relative(ROOT, outJson)}`);
    report.targets.push(targetReport);
  }

  console.log('\n=== Summary ===');
  console.log(`  Exams: ${report.summary.exams}`);
  console.log(`  Passed: ${report.summary.passed}`);
  console.log(`  Failed: ${report.summary.failed}`);
  if (report.summary.passageDedupeFailed) {
    console.log(`  Passage dedupe failed: ${report.summary.passageDedupeFailed} level(s)`);
  }
  if (report.summary.betaReported) {
    console.log(`  Beta levels with failures (report only): ${report.summary.betaReported}`);
  }
  console.log(`  Total errors: ${report.summary.totalErrors}`);

  if (opts.strict && exitCode !== 0) {
    console.error('\nStrict mode: fidelity validation FAILED');
    process.exit(1);
  }
  if (!opts.strict && report.summary.failed) {
    console.log('\n(non-strict: exit 0 despite failures)');
  }
}

main();
