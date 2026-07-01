#!/usr/bin/env node
/**
 * Deterministic repair for Hören issues after pool fill:
 *   - Normalize MCQ options (plain strings -> a)/b)/c) format)
 *   - Normalize AI-generated question field names
 *   - Replace Hören T1 when segment/item counts are wrong (5 segments, 10 items)
 *
 *   node scripts/repair-b1-horen.mjs --lang de --level B1 [--dry-run] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { normalizeExamQuestions } from './lib/normalizeMcq.mjs';
import {
  PoolIndex,
  UsageTracker,
  replaceHorenT1Segments,
  examTokenFromFile,
} from './fill-gaps-from-pool.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { validateExamAgainstBlueprint, countScorableItems, countPassagesInPart } = require(
  path.join(ROOT, 'js/engine/validation/blueprintFidelity.js'),
);
const ExamRenumber = require(path.join(ROOT, 'js/engine/examRenumber.js'));
const AnswerKeyVerifier = require(path.join(ROOT, 'js/engine/validation/AnswerKeyVerifier.js'));

function parseArgs(argv) {
  const opts = { lang: 'de', level: 'B1', apply: false, dryRun: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') {
      opts.apply = true;
      opts.dryRun = false;
    } else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--level') opts.level = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (opts.apply) opts.dryRun = false;
  return opts;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function blueprintPath(lang, level) {
  const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
  return path.join(ROOT, 'library/blueprints', `${type}_${level}.json`);
}

function curatedDir(lang, level) {
  return path.join(ROOT, 'library/curated', lang, level);
}

function bankPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'questions.json');
}

function passagesPath(lang, level) {
  return path.join(ROOT, 'library', lang, level, 'passages.json');
}

function bpPart(blueprint, modId, teil) {
  const mod = blueprint.modules.find((m) => m.id === modId);
  return (mod?.parts || []).find((p) => Number(p.teil) === Number(teil)) || null;
}

function horenT1NeedsRebuild(part, bp) {
  const expSeg = bp?.segmentsTotal ?? 5;
  const expItems = bp?.itemsTotal ?? 10;
  const segs = part.segments || [];
  const haveItems = countScorableItems(part, 'horen');
  const havePassages = countPassagesInPart(part, bp);
  return segs.length !== expSeg || haveItems !== expItems || havePassages !== expSeg;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/repair-b1-horen.mjs --lang de --level B1 [--dry-run] [--apply]');
    process.exit(0);
  }

  const lang = opts.lang;
  const level = opts.level;
  const blueprint = loadJson(blueprintPath(lang, level));
  const bank = loadJson(bankPath(lang, level));
  const extraPassages = fs.existsSync(passagesPath(lang, level))
    ? loadJson(passagesPath(lang, level))
    : { passages: [] };
  const pool = new PoolIndex(bank, extraPassages);
  const bpT1 = bpPart(blueprint, 'horen', 1);

  const dir = curatedDir(lang, level);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json')).sort();
  const wrappers = files.map((f) => {
    const w = loadJson(path.join(dir, f));
    w._file = f;
    return w;
  });

  let written = 0;
  console.log(`\n══ repair-b1-horen (${opts.apply ? 'apply' : 'dry-run'}) ══ ${lang}/${level} ══\n`);

  for (const wrapper of wrappers) {
    const examId = wrapper.id || wrapper._file;
    const exam = structuredClone(wrapper.exam);
    const short = examId.replace(`curated_${lang}_${level}_`, '');
    const beforeJson = JSON.stringify(exam);

    const beforeVal = validateExamAgainstBlueprint(exam, blueprint);
    const beforeStruct = new AnswerKeyVerifier().collectStructuralKeyErrors(exam);

    normalizeExamQuestions(exam);

    const horenT1 = (exam.horenParts || []).find((p) => Number(p.teil) === 1);
    if (horenT1 && horenT1NeedsRebuild(horenT1, bpT1)) {
      const tracker = new UsageTracker();
      for (const other of wrappers) {
        if (other.id === wrapper.id) continue;
        tracker.absorbExam(other.exam || {});
      }
      const set = pool.findHorenT1Set(tracker, bpT1?.segmentsTotal ?? 5);
      if (set) {
        const token = examTokenFromFile(wrapper._file);
        const result = replaceHorenT1Segments(horenT1, set, pool, token, tracker);
        console.log(`▶ ${short}: T1 rebuilt → ${result.segments} segs, ${result.items} items`);
      } else {
        console.log(`▶ ${short}: T1 still broken — no unused pool set`);
      }
    }

    ExamRenumber.renumberExam(exam, blueprint);
    normalizeExamQuestions(exam);

    const afterVal = validateExamAgainstBlueprint(exam, blueprint);
    const afterStruct = new AnswerKeyVerifier().collectStructuralKeyErrors(exam);

    if (!beforeVal.ok && afterVal.ok) {
      console.log(`  ✓ ${short}: fidelity OK`);
    } else if (!afterVal.ok) {
      const sample = [...afterVal.errors, ...afterStruct].slice(0, 3).join('; ');
      console.log(`  · ${short}: ${beforeVal.ok ? 'OK' : 'FAIL'} → ${afterVal.ok ? 'OK' : 'FAIL'} — ${sample || 'no errors listed'}`);
    } else {
      console.log(`  · ${short}: already OK`);
    }

    if (opts.apply && JSON.stringify(exam) !== beforeJson) {
      wrapper.exam = exam;
      fs.writeFileSync(path.join(dir, wrapper._file), JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
      written++;
    }
  }

  const passed = wrappers.filter((w) => {
    const e = opts.apply ? w.exam : w.exam;
    return validateExamAgainstBlueprint(e, blueprint).ok;
  }).length;

  console.log(`\n── Summary: ${passed}/${wrappers.length} pass fidelity | ${written} file(s) written ──\n`);
  if (opts.dryRun) console.log('DRY-RUN — use --apply to write curated files.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
