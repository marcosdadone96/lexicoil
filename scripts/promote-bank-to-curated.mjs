#!/usr/bin/env node
/**
 * Build COMPLETE exams from the question bank and publish to library/curated + pool-seed.
 * Only exams with blueprint coverage >= minCoverage (default 1.0) are promoted.
 *
 * Usage:
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1 --max 12 --min-coverage 1.0
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1 --max 12 --max-per-topic 2
 *   node scripts/promote-bank-to-curated.mjs --lang de --level B1 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { publishCuratedExam } from './pipeline/lib/publishCurated.js';
import { validateCrossExamPassageUniqueness, collectPassagesFromExam } from './lib/passageDedupe.mjs';
import { assertBlueprintCaps } from './lib/blueprintCaps.mjs';
import { buildValidatedT3Part } from './make-t3.mjs';
import { buildValidatedT4Part } from './make-t4.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Register coherent-part generators so ExamBlueprint.assemble() can call them as fallback
// when no complete coherent T3/T4 set exists in the question bank.
globalThis.LesenPartGenerators = { buildValidatedT3Part, buildValidatedT4Part };

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const PassageResolver = globalThis.PassageResolver;
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));
globalThis.ExamValidator = ExamValidator;
const CefrGate = require(path.join(ROOT, 'js/engine/validation/CefrGate.js'));

function args(argv) {
  const o = { lang: 'de', level: 'B1', minCoverage: 1.0, max: 10, maxPerTopic: 2, dryRun: false, verbose: false, allowAuditFailures: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--min-coverage') o.minCoverage = parseFloat(argv[++i]);
    else if (a === '--max') o.max = parseInt(argv[++i], 10);
    else if (a === '--max-per-topic') o.maxPerTopic = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--allow-audit-failures') o.allowAuditFailures = true;
  }
  if (o.allowAuditFailures) {
    process.stderr.write('\n\x1b[31m⚠  --allow-audit-failures activo: el gate de auditoría no bloqueará publicación.\x1b[0m\n\n');
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

function topicCountMap(corpus) {
  const counts = new Map();
  for (const p of corpus) {
    const t = String(p.exam?.topic || p.topic || '').toLowerCase();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function topicAtLimit(counts, topicKey, maxPerTopic) {
  if (!topicKey) return false;
  return (counts.get(topicKey) || 0) >= maxPerTopic;
}

function loadExistingCurated(lang, level) {
  const dir = path.join(ROOT, 'library', 'curated', lang, level);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('curated') && f.endsWith('.json'))
    .sort()
    .map((f) => {
      const x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const id = x.id || f.replace(/\.json$/, '');
      return {
        id,
        exam: x.exam || x,
        fromDisk: true,
        sourceBankIds: x.provenance?.sourceBankIds || x.sourceBankIds || [],
      };
    });
}

function passageDedupeOk(corpus, candidateId, candidateExam) {
  const exams = [
    ...corpus.map((p) => ({ id: p.id, exam: p.exam })),
    { id: candidateId, exam: candidateExam },
  ];
  return validateCrossExamPassageUniqueness(exams).ok;
}

function collectCorpusPassageIds(corpus) {
  const ids = new Set();
  for (const { id, exam } of corpus) {
    for (const p of collectPassagesFromExam(exam, id)) {
      if (p.passageId) ids.add(p.passageId);
    }
  }
  return ids;
}

function questionPassageId(q) {
  return PassageResolver.passageIdFromQuestion(q) || q.passageId || null;
}

function registerExamPassages(corpusEntry, usedPassages) {
  for (const p of collectPassagesFromExam(corpusEntry.exam, corpusEntry.id)) {
    if (p.passageId) usedPassages.add(p.passageId);
  }
}

function passageFilter(usedPassages) {
  return (q) => {
    const pid = questionPassageId(q);
    return !pid || !usedPassages.has(pid);
  };
}

/** Reject candidates that leave almost no room for another full exam (common T4 forum bottleneck). */
function poolContinuationOk(bank, blueprint, usedIds, usedPassages, selected, exam, { trials = 12, minFullRatio = 0.25 } = {}) {
  const trialUsed = new Set(usedIds);
  for (const q of selected) trialUsed.add(q.id);
  const trialPassages = new Set(usedPassages);
  for (const p of collectPassagesFromExam(exam, 'probe')) {
    if (p.passageId) trialPassages.add(p.passageId);
  }
  const filter = (q) => {
    const pid = questionPassageId(q);
    return !pid || !trialPassages.has(pid);
  };
  let full = 0;
  for (let i = 0; i < trials; i++) {
    const sub = { ...bank, questions: (bank.questions || []).filter((q) => !trialUsed.has(q.id)) };
    const a = ExamBlueprint.assemble(sub, blueprint, { filter });
    if (ExamBlueprint.coverageSummary(a.coverage).ratio >= 1) full++;
  }
  return full / trials >= minFullRatio;
}

function blockConflictingPassages(violations, candidateId, usedPassages) {
  for (const v of violations) {
    if (v.type === 'duplicate_passageId' && v.examB === candidateId && v.passageId) {
      usedPassages.add(v.passageId);
    }
    if (v.type === 'similar_passage_text') {
      if (v.examB === candidateId && v.passageIdB) usedPassages.add(v.passageIdB);
      if (v.examA === candidateId && v.passageIdA) usedPassages.add(v.passageIdA);
    }
  }
}

function main() {
  const o = args(process.argv.slice(2));
  const bank = loadBank(o.lang, o.level);
  const blueprint = loadBlueprint(o.lang, o.level);
  const existing = loadExistingCurated(o.lang, o.level);
  const usedIds = new Set();
  for (const p of existing) {
    for (const bid of p.sourceBankIds || []) usedIds.add(bid);
  }
  const existingBankIds = usedIds.size;
  const promoted = [...existing];
  const usedPassages = collectCorpusPassageIds(promoted);
  const usedTopics = topicCountMap(promoted);
  let attempts = 0;
  const slotsNeeded = Math.max(0, o.max - existing.length);
  const maxAttempts = Math.max(slotsNeeded * 8000, 50000);
  const skipStats = { coverage: 0, validate: 0, topic: 0, cap: 0, dedupe: 0, continuation: 0, empty: 0, gate: 0 };

  while (promoted.length < o.max && attempts < maxAttempts) {
    attempts++;
    const sub = { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
    if (!(sub.questions || []).length) {
      skipStats.empty++;
      break;
    }

    const assembled = ExamBlueprint.assemble(sub, blueprint, {
      filter: (q) => {
        const pid = questionPassageId(q);
        return !pid || !usedPassages.has(pid);
      },
    });
    const selected = assembled.selected || [];
    if (!selected.length) continue;

    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < o.minCoverage) {
      skipStats.coverage++;
      if (o.verbose && promoted.length > existing.length && skipStats.coverage <= 3) {
        console.warn(`DEBUG coverage fail ratio=${cov.ratio} selected=${selected.length}`, assembled.coverage?.filter?.((p) => !p.complete)?.slice?.(0, 2));
      }
      continue;
    }

    const exam = ExamBuilder.buildFromBlueprint(o.lang, o.level, sub, blueprint, { assembled });

    const check = new ExamValidator().validate(exam, { strict: true, blueprint });
    if (!check.valid) {
      skipStats.validate++;
      continue;
    }

    exam.blueprintComplete = cov.ratio >= 1;
    exam.blueprintCoverage = assembled.coverage;
    exam.libraryBuilt = true;

    const topicKey = String(exam.topic || '').toLowerCase();
    if (topicAtLimit(usedTopics, topicKey, o.maxPerTopic)) {
      skipStats.topic++;
      continue;
    }

    const capV = assertBlueprintCaps(exam, blueprint);
    if (capV.length) {
      skipStats.cap++;
      console.warn(`SKIP cap: ${capV.slice(0, 2).join('; ')}`);
      continue;
    }

    const entry = {
      id: `curated_${o.lang}_${o.level}_${sig(selected)}`,
      lang: o.lang,
      level: o.level,
      topic: exam.topic || `${o.lang.toUpperCase()} ${o.level} practice`,
      coverageRatio: Number(cov.ratio.toFixed(2)),
      itemCount: selected.length,
      exam,
    };

    const dedupe = validateCrossExamPassageUniqueness([
      ...promoted.map((p) => ({ id: p.id, exam: p.exam })),
      { id: entry.id, exam },
    ]);
    if (!dedupe.ok) {
      skipStats.dedupe++;
      continue;
    }

    selected.forEach((q) => usedIds.add(q.id));
    const topicReuse = topicKey && (usedTopics.get(topicKey) || 0) > 0;
    registerExamPassages({ id: entry.id, exam }, usedPassages);
    if (topicKey) usedTopics.set(topicKey, (usedTopics.get(topicKey) || 0) + 1);

    const corpusEntry = {
      id: entry.id,
      exam,
      topic: topicKey,
      sourceBankIds: selected.map((q) => q.id),
    };

    if (o.dryRun) {
      console.log(
        `DRY-OK complete exam ${entry.id} — coverage ${entry.coverageRatio} (${entry.itemCount} items) topic=${topicKey || '?'}${topicReuse ? ' [topic reuse]' : ''}`,
      );
      promoted.push(corpusEntry);
      continue;
    }

    const result = publishCuratedExam({
      lang: o.lang,
      level: o.level,
      topic: entry.topic,
      exam,
      id: entry.id,
      generatedBy: 'promote-bank-to-curated',
      blueprintId: blueprint.id,
      cefrGate: CefrGate.validateExam(exam, { lang: o.lang, level: o.level }),
      sourceBankIds: selected.map((q) => q.id),
      validationResult: check,
      allowAuditFailures: o.allowAuditFailures,
    });

    if (result.blocked) {
      skipStats.gate++;
      continue;
    }

    console.log(`PROMOTED ${result.id} → curated + pool-seed (${entry.itemCount} items, cov=${entry.coverageRatio}, topic=${topicKey || '?'})`);
    promoted.push({ ...corpusEntry, id: result.id });
  }

  console.log(`\n== Promote bank → curated ${o.lang}_${o.level} ==`);
  console.log(`Bank questions: ${(bank.questions || []).length}`);
  console.log(`Existing curated: ${existing.length} (${existingBankIds} bank items already allocated)`);
  console.log(`Max per topic: ${o.maxPerTopic}`);
  console.log(`Complete exams ${o.dryRun ? 'would promote' : 'promoted'} this run: ${promoted.length - existing.length}`);
  console.log(`Total curated (target ${o.max}): ${promoted.length}`);
  console.log(`Items consumed: ${usedIds.size}`);
  if (attempts >= maxAttempts && promoted.length < o.max) {
    console.log(`Attempts exhausted (${attempts}/${maxAttempts}) — skip stats: ${JSON.stringify(skipStats)}`);
  }
  if (!promoted.length) {
    console.log('\nNo complete exams could be built. Add more staging content or lower --min-coverage.');
  }
}

main();
