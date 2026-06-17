#!/usr/bin/env node
/**
 * Build COMPLETE exams from the question bank and publish to library/curated + pool-seed.
 * Only exams with blueprint coverage >= minCoverage (default 1.0) are promoted.
 *
 * Usage:
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1 --max 5 --min-coverage 1.0
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { publishCuratedExam } from './pipeline/lib/publishCurated.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
globalThis.ExamValidator = ExamValidator;

function args(argv) {
  const o = { lang: 'de', level: 'B1', minCoverage: 1.0, max: 10, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--min-coverage') o.minCoverage = parseFloat(argv[++i]);
    else if (a === '--max') o.max = parseInt(argv[++i], 10);
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

function loadBank(lang, level) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
}

function loadBlueprint(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint index for ${lang}_${level}`);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library', 'blueprints', `${id}.json`), 'utf8'));
}

function filteredBank(bank, usedIds) {
  return { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
}

function sig(selected) {
  return crypto.createHash('sha256').update(selected.map((q) => q.id).sort().join(',')).digest('hex').slice(0, 12);
}

function main() {
  const o = args(process.argv.slice(2));
  const bank = loadBank(o.lang, o.level);
  const blueprint = loadBlueprint(o.lang, o.level);
  const usedIds = new Set();
  const promoted = [];
  let attempts = 0;

  while (promoted.length < o.max && attempts < o.max + 5) {
    attempts++;
    const sub = filteredBank(bank, usedIds);
    if (!(sub.questions || []).length) break;

    const assembled = ExamBlueprint.assemble(sub, blueprint);
    const selected = assembled.selected || [];
    if (!selected.length) break;

    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < o.minCoverage) break;

    const exam = ExamBuilder.buildFromBlueprint(o.lang, o.level, sub, blueprint, { assembled });
    exam.blueprintComplete = cov.ratio >= 1;
    exam.blueprintCoverage = assembled.coverage;
    exam.libraryBuilt = true;

    const check = new ExamValidator().validate(exam, { strict: false, blueprint });
    if (!check.valid) {
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }

    selected.forEach((q) => usedIds.add(q.id));

    const entry = {
      id: `curated_${o.lang}_${o.level}_${sig(selected)}`,
      lang: o.lang,
      level: o.level,
      topic: exam.topic || `${o.lang.toUpperCase()} ${o.level} practice`,
      coverageRatio: Number(cov.ratio.toFixed(2)),
      itemCount: selected.length,
      exam,
    };

    if (o.dryRun) {
      console.log(
        `DRY-OK complete exam ${entry.id} — coverage ${entry.coverageRatio} (${entry.itemCount} items)`,
      );
      promoted.push(entry);
      continue;
    }

    const result = publishCuratedExam({
      lang: o.lang,
      level: o.level,
      topic: entry.topic,
      exam,
      generatedBy: 'promote-bank-to-curated',
      blueprintId: blueprint.id,
      cefrGate: { withinRange: true, metrics: {}, reasons: [] },
      sourceBankIds: selected.map((q) => q.id),
      validationResult: check,
    });

    console.log(`PROMOTED ${result.id} → curated + pool-seed (${entry.itemCount} items, cov=${entry.coverageRatio})`);
    promoted.push({ ...entry, id: result.id });
  }

  console.log(`\n== Promote bank → curated ${o.lang}_${o.level} ==`);
  console.log(`Bank questions: ${(bank.questions || []).length}`);
  console.log(`Complete exams ${o.dryRun ? 'would promote' : 'promoted'}: ${promoted.length}`);
  console.log(`Items consumed: ${usedIds.size}`);
  if (!promoted.length) {
    console.log('\nNo complete exams could be built. Add more staging content or lower --min-coverage.');
  }
}

main();
