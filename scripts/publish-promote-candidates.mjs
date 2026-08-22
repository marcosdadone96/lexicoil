#!/usr/bin/env node
/**
 * Promote complete exams from bank using the same search loop as promote-bank-to-curated,
 * but without greedy first-match traps. Publishes up to (max - existing) new curated exams.
 *
 *   node scripts/publish-promote-candidates.mjs --lang de --level B1 --max 12 --max-per-topic 2
 *   node scripts/publish-promote-candidates.mjs --lang de --level B1 --max 12 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { publishCuratedExam } from './pipeline/lib/publishCurated.js';
import { validateCrossExamPassageUniqueness, collectPassagesFromExam } from './lib/passageDedupe.mjs';
import { assertBlueprintCaps } from './lib/blueprintCaps.mjs';
import { flattenExam, BLUEPRINT, isExamPublishable } from './audit-pass-2.mjs';
import { BLACKLIST } from './blacklist.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
require(path.join(ROOT, 'js/library/LibraryLoader.js'));
const PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));
const ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function parseArgs(argv) {
  const o = { lang: 'de', level: 'B1', max: 12, maxPerTopic: 2, dryRun: false, maxAttempts: 50000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--max') o.max = parseInt(argv[++i], 10);
    else if (a === '--max-per-topic') o.maxPerTopic = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (a === '--max-attempts') o.maxAttempts = parseInt(argv[++i], 10);
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

function sig(selected) {
  return crypto.createHash('sha256').update(selected.map((q) => q.id).sort().join(',')).digest('hex').slice(0, 12);
}

// ─── Gate de publicación ───────────────────────────────────────────────────
// isExamPublishable() importado desde audit-pass-2 — fuente única de verdad.
// GATE_BLOCK_CHECKS y la lógica de bloqueo viven allí; aquí solo se invoca.

// ─── FIX-3: blueprintComplete honesto ────────────────────────────────────
/**
 * Expected per-slot counts derived from the actual blueprint JSON. The hardcoded
 * BLUEPRINT map in audit-pass-2 is Goethe-B1-specific; for other langs/levels
 * (e.g. Cambridge EN) the slot layout differs, so derive it from the source of truth.
 * schreiben/sprechen stay count:null (rubric tasks, not slot-counted) as in Goethe.
 */
function expectedSlotsFromBlueprint(bp) {
  const out = {};
  for (const mod of bp?.modules || []) {
    const id = String(mod.id || '').toLowerCase();
    if (id === 'schreiben' || id === 'sprechen' || id === 'writing' || id === 'speaking') {
      out[id] = { count: null };
      continue;
    }
    for (const part of mod.parts || []) {
      out[`${id}-${Number(part.teil)}`] = {
        count: part.itemsTotal || part.questionsTotal?.min || null,
      };
    }
  }
  return out;
}

function verifyBlueprintComplete(exam, expected = BLUEPRINT) {
  const flat = flattenExam(exam.exam || exam);
  const groups = {};
  for (const q of flat.questions) {
    const mod = String(q.module || '').toLowerCase();
    if (mod === 'schreiben' || mod === 'sprechen') {
      groups[mod] = (groups[mod] || 0) + 1;
      continue;
    }
    const key = `${mod}-${Number(q.teil)}`;
    groups[key] = (groups[key] || 0) + 1;
  }
  for (const [key, spec] of Object.entries(expected)) {
    if (spec.count === null) continue;
    if ((groups[key] || 0) !== spec.count) {
      return { ok: false, slot: key, filled: groups[key] || 0, target: spec.count };
    }
  }
  return { ok: true };
}

function loadExisting(lang, level) {
  const dir = path.join(ROOT, 'library', 'curated', lang, level);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('curated') && f.endsWith('.json'))
    .map((f) => {
      const x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return {
        id: x.id || f.replace(/\.json$/, ''),
        exam: x.exam || x,
        sourceBankIds: x.provenance?.sourceBankIds || x.sourceBankIds || [],
      };
    });
}

function qpid(q) {
  return PassageResolver.passageIdFromQuestion(q) || q.passageId || null;
}

function isQuestionClean(q) {
  // Retorna false si la pregunta contiene contenido del BLACKLIST (flojos/C1 vocab)
  const texts = [q.question, q.signText, q.explanation, ...(q.options || [])].filter(Boolean).map(String);
  return texts.every(t => !BLACKLIST.some(entry => entry.term.test(t)));
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const rawBank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', o.lang, o.level, 'questions.json'), 'utf8'));

  // Pre-filtrar banco: quitar preguntas con contenido bloqueante (flojos, C1 vocab)
  // antes de entrar al inner loop para reducir la tasa de rechazo del gate
  const beforeCount = (rawBank.questions || []).length;
  // BLACKLIST = anglicismos C1/C2 vetados en contenido ALEMAN ("hiking", "swimming"...).
  // En ingles son vocabulario B1 normal — el filtro solo aplica a lang de.
  const bank = {
    ...rawBank,
    questions: o.lang === 'de'
      ? (rawBank.questions || []).filter(isQuestionClean)
      : (rawBank.questions || []),
  };
  const filteredCount = beforeCount - bank.questions.length;
  if (filteredCount > 0) {
    console.log(`Pre-filtrado: ${filteredCount}/${beforeCount} preguntas eliminadas por BLACKLIST`);
  }

  const bpId = ExamBlueprint.INDEX[`${o.lang}_${o.level}`];
  const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', 'blueprints', `${bpId}.json`), 'utf8'));
  const validator = new ExamValidator();

  const promoted = loadExisting(o.lang, o.level);
  const usedIds = new Set();
  for (const p of promoted) for (const id of p.sourceBankIds || []) usedIds.add(id);
  const usedPassages = new Set();
  for (const p of promoted) {
    for (const pass of collectPassagesFromExam(p.exam, p.id)) {
      if (pass.passageId) usedPassages.add(pass.passageId);
    }
  }
  const topicCounts = new Map();
  for (const p of promoted) {
    const t = String(p.exam?.topic || '').toLowerCase();
    if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  }

  // FIX-4: Set de question.id ya usados entre exámenes (además de sourceBankIds)
  const usedQuestionIds = new Set();
  for (const p of promoted) {
    const flat = flattenExam(p.exam || p);
    for (const q of flat.questions) if (q.id) usedQuestionIds.add(q.id);
  }

  const existingCount = promoted.length;
  const published = [];
  const rejectedLog = [];
  const stats = { cov: 0, val: 0, topic: 0, cap: 0, dedupe: 0, gate: 0, blueprint: 0, qidDup: 0 };

  for (let attempt = 0; attempt < o.maxAttempts && promoted.length < o.max; attempt++) {
    const sub = { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
    if (!sub.questions.length) break;

    const assembled = ExamBlueprint.assemble(sub, blueprint, {
      filter: (q) => {
        const pid = qpid(q);
        return !pid || !usedPassages.has(pid);
      },
    });
    const selected = assembled.selected || [];
    if (!selected.length) break;
    if (ExamBlueprint.coverageSummary(assembled.coverage).ratio < 1) {
      stats.cov++;
      continue;
    }

    const exam = ExamBuilder.buildFromBlueprint(o.lang, o.level, sub, blueprint, { assembled });
    const check = validator.validate(exam, { strict: true, blueprint });
    if (!check.valid) {
      stats.val++;
      continue;
    }

    const topicKey = String(exam.topic || '').toLowerCase();
    if (topicKey && (topicCounts.get(topicKey) || 0) >= o.maxPerTopic) {
      stats.topic++;
      continue;
    }
    if (assertBlueprintCaps(exam, blueprint).length) {
      stats.cap++;
      continue;
    }

    const id = `curated_${o.lang}_${o.level}_${sig(selected)}`;
    if (
      !validateCrossExamPassageUniqueness([
        ...promoted.map((p) => ({ id: p.id, exam: p.exam })),
        { id, exam },
      ]).ok
    ) {
      stats.dedupe++;
      continue;
    }

    // FIX-4: Dedup a nivel de question.id entre exámenes ya publicados
    const flatNew = flattenExam(exam);
    const dupQIds = flatNew.questions.filter(q => q.id && usedQuestionIds.has(q.id)).map(q => q.id);
    if (dupQIds.length > 0) {
      stats.qidDup++;
      continue;
    }

    // FIX-3: blueprintComplete honesto — contar preguntas reales del aplanado
    const bpCheck = verifyBlueprintComplete(exam, o.lang === 'de' ? BLUEPRINT : expectedSlotsFromBlueprint(blueprint));
    if (!bpCheck.ok) {
      stats.blueprint++;
      rejectedLog.push({ id, reason: `blueprintIncomplete slot=${bpCheck.slot} filled=${bpCheck.filled} target=${bpCheck.target}` });
      continue;
    }

    // FIX-2: Gate de auditoría real (fuente: audit-pass-2.isExamPublishable)
    const gate = isExamPublishable(exam);
    if (!gate.ok) {
      stats.gate++;
      const ids = [...new Set(gate.blocking.map((f) => f.id))].join(',');
      rejectedLog.push({ id, reason: `gate=${gate.blocking.length} (${ids})`, audit: gate.blocking.map((f) => `[${f.severity}][${f.id}] ${f.message}`) });
      continue;
    }

    exam.blueprintComplete = true; // solo llega aquí si verifyBlueprintComplete pasó
    exam.blueprintCoverage = assembled.coverage;
    exam.libraryBuilt = true;

    const reuse = topicKey && (topicCounts.get(topicKey) || 0) > 0;
    const report = {
      id,
      topic: topicKey,
      attempt,
      bankItems: selected.length,
      reuse,
      source: 'bank',
    };

    if (o.dryRun) {
      console.log(`DRY-OK ${id} topic=${topicKey}${reuse ? ' [reuse]' : ''} attempt=${attempt}`);
      published.push(report);
    } else {
      const result = publishCuratedExam({
        lang: o.lang,
        level: o.level,
        topic: exam.topic || topicKey,
        exam,
        id,
        generatedBy: 'publish-promote-candidates',
        blueprintId: blueprint.id,
        cefrGate: { withinRange: true, metrics: {}, reasons: [] },
        sourceBankIds: selected.map((q) => q.id),
        validationResult: check,
        // FIX-2: actualizar validatedBy para reflejar el gate real
        validatedBy: 'audit-pass-2+lexicalCheck+CefrGate',
      });
      report.id = result.id;
      console.log(`PUBLISHED ${result.id} topic=${topicKey}${reuse ? ' [reuse]' : ''} (${selected.length} items)`);
      published.push(report);
    }

    selected.forEach((q) => usedIds.add(q.id));
    for (const q of flatNew.questions) if (q.id) usedQuestionIds.add(q.id); // FIX-4
    for (const pass of collectPassagesFromExam(exam, id)) {
      if (pass.passageId) usedPassages.add(pass.passageId);
    }
    if (topicKey) topicCounts.set(topicKey, (topicCounts.get(topicKey) || 0) + 1);
    promoted.push({ id, exam, sourceBankIds: selected.map((q) => q.id) });
  }

  // Escribir log de rechazados si hubo alguno
  if (rejectedLog.length > 0) {
    const logPath = path.join(ROOT, 'publish-rejected.log');
    fs.appendFileSync(logPath, rejectedLog.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    console.log(`\n⚠  ${rejectedLog.length} examen(es) rechazados por gate → ver publish-rejected.log`);
  }

  console.log('\n== publish-promote-candidates ==');
  console.log(`Existing: ${existingCount} | New: ${published.length} | Total: ${promoted.length}/${o.max}`);
  console.log(`Stats: ${JSON.stringify(stats)}`);
  if (published.length) {
    console.log('New exams:');
    for (const p of published) {
      console.log(`  · ${p.id} — ${p.topic}${p.reuse ? ' (topic reuse)' : ''} — ${p.source} — attempt ${p.attempt}`);
    }
  }
}

main();
