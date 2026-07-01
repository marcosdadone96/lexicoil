#!/usr/bin/env node
/**
 * Build a DISJOINT exam pool: no item/passage is reused across the generated
 * exams, so under per-user dedup a user can consume many of them before
 * exhausting. Offline, no AI. Self-contained (filters the bank per iteration,
 * so it works whether or not ExamBlueprint supports excludeIds).
 *
 * Usage:
 *   node scripts/build-disjoint-pool.mjs --lang de --level B1 --min-coverage 0.6 --max 20 [--out FILE] [--append] [--dry-run] [--report]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getTopicStats, TOPICS } from './lib/topicRotation.mjs';
import { flattenExam, BLUEPRINT, isExamPublishable } from './audit-pass-2.mjs';
import { BLACKLIST } from './blacklist.mjs';

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
  const o = { lang: 'de', level: 'B1', minCoverage: 0.6, max: 20, out: null, append: false, dryRun: false, report: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i];
    else if (a === '--level') o.level = String(argv[++i]).toUpperCase();
    else if (a === '--min-coverage') o.minCoverage = parseFloat(argv[++i]);
    else if (a === '--max') o.max = parseInt(argv[++i], 10);
    else if (a === '--target') {
      o.max = parseInt(argv[++i], 10);
      o.minCoverage = 1.0;
    }
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--append') o.append = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--report') o.report = true;
  }
  return o;
}

function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function loadBank(lang, level) {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
  const pp = path.join(ROOT, 'library', lang, level, 'passages.json');
  if (fs.existsSync(pp)) {
    const pf = JSON.parse(fs.readFileSync(pp, 'utf8'));
    const ids = new Set((bank.passages || []).map((p) => p.id));
    const extra = (pf.passages || []).filter((p) => !ids.has(p.id));
    bank.passages = [...(bank.passages || []), ...extra];
  }
  return bank;
}
function loadBlueprint(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint index for ${lang}_${level}`);
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'library', 'blueprints', `${id}.json`), 'utf8'));
}
function filteredBank(bank, usedIds) {
  return { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
}

// Gate de calidad — usa isExamPublishable() importado desde audit-pass-2 (fuente única).
// La definición de qué bloquea publicación vive en GATE_BLOCK_CHECKS allí.

// blueprintComplete honesto: contar preguntas reales
function verifyBlueprintComplete(exam) {
  const flat = flattenExam(exam.exam || exam);
  const groups = {};
  for (const q of flat.questions) {
    const mod = String(q.module || '').toLowerCase();
    const key = (mod === 'schreiben' || mod === 'sprechen') ? mod : `${mod}-${Number(q.teil)}`;
    groups[key] = (groups[key] || 0) + 1;
  }
  for (const [key, spec] of Object.entries(BLUEPRINT)) {
    if (spec.count === null) continue;
    if ((groups[key] || 0) !== spec.count) {
      return { ok: false, slot: key, filled: groups[key] || 0, target: spec.count };
    }
  }
  return { ok: true };
}
function sig(selected) {
  return crypto.createHash('sha256').update(selected.map((q) => q.id).sort().join(',')).digest('hex').slice(0, 12);
}

function textHash(text) {
  const norm = String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-zäöüß0-9 ]/g, '').trim();
  return crypto.createHash('sha1').update(norm).digest('hex');
}

function main() {
  const o = args(process.argv.slice(2));
  const rawBank = loadBank(o.lang, o.level);

  // Pre-filtrar banco: quitar preguntas con contenido bloqueante (flojos, C1)
  const beforeCount = (rawBank.questions || []).length;
  const bank = {
    ...rawBank,
    questions: (rawBank.questions || []).filter(q => {
      const texts = [q.question, q.signText, q.explanation, ...(q.options || [])].filter(Boolean).map(String);
      return texts.every(t => !BLACKLIST.some(entry => entry.term.test(t)));
    }),
  };
  const filteredCount = beforeCount - bank.questions.length;
  if (filteredCount > 0) console.log(`Pre-filtrado: ${filteredCount}/${beforeCount} preguntas eliminadas por BLACKLIST`);

  const blueprint = loadBlueprint(o.lang, o.level);
  const usedIds = new Set();
  /** Track T4 forum text fingerprints across the batch for real disjoint detection. */
  const usedT4Texts = new Set();
  const seeds = [];
  const moduleCov = {};
  let attempts = 0;
  let skippedGate = 0;
  let skippedBp = 0;

  while (seeds.length < o.max && attempts < o.max * 5 + 20) {
    attempts++;
    const sub = filteredBank(bank, usedIds);
    if (!(sub.questions || []).length) break;
    const assembled = ExamBlueprint.assemble(sub, blueprint);
    const selected = assembled.selected || [];
    if (!selected.length) break;
    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < o.minCoverage) {
      // Bank can no longer fill a sufficiently-complete disjoint exam.
      break;
    }
    const exam = ExamBuilder.buildFromBlueprint(o.lang, o.level, sub, blueprint, { assembled });
    if (exam.needsCuration) {
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }
    const check = new ExamValidator().validate(exam, { strict: false });
    if (!check.valid) {
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }

    // FIX-3: blueprintComplete honesto
    const bpCheck = verifyBlueprintComplete(exam);
    if (!bpCheck.ok) {
      skippedBp++;
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }

    // FIX-2: Gate de calidad (fuente: audit-pass-2.isExamPublishable)
    const gate = isExamPublishable(exam);
    if (!gate.ok) {
      skippedGate++;
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }

    selected.forEach((q) => usedIds.add(q.id));
    assembled.coverage.forEach((c) => {
      moduleCov[c.module] = moduleCov[c.module] || { target: 0, filled: 0 };
      moduleCov[c.module].target += c.target || 0;
      moduleCov[c.module].filled += c.filled || 0;
    });

    // ── P1 fix: Normalize Hören T1 segment labels to Aufnahme 1…N by position ──
    const h1 = (exam.horenParts || []).find(p => p.teil === 1);
    if (h1 && Array.isArray(h1.segments)) {
      h1.segments.forEach((seg, idx) => { seg.label = `Aufnahme ${idx + 1}`; });
    }

    // ── P2 fix: Compute real disjoint flag based on T4 forum text uniqueness ──
    const t4 = (exam.lesenParts || []).find(p => p.teil === 4);
    const t4TextKey = t4
      ? (t4.text || t4.textTitle || '').slice(0, 150)
      : '';
    const isDisjoint = !t4TextKey || !usedT4Texts.has(t4TextKey);
    if (t4TextKey) usedT4Texts.add(t4TextKey);
    const disjointNote = isDisjoint ? undefined
      : 'T4 forum text shared with another exam in batch (bank limitation)';

    // ── P4 fix: Ensure schreibenParts have a `teil` field ──
    (exam.schreibenParts || []).forEach((p, idx) => {
      if (p.teil == null) p.teil = (typeof p.aufgabe === 'number') ? p.aufgabe : idx + 1;
    });

    // ── P2 fix: Assign content-based passageId to T4 ──────────────────────
    if (t4) {
      const items = t4.items || [];
      const contentKey = [
        (t4.text || t4.textTitle || '').slice(0, 200),
        ...items.slice(0, 3).map(it => (it.signText || it.text || '').slice(0, 80)),
      ].join('||');
      t4.passageId = `gen-l4-${crypto.createHash('sha1').update(contentKey).digest('hex').slice(0, 8)}`;
      (t4.items || []).forEach(it => { if (it.passageId) it.passageId = t4.passageId; });
    }

    // FIX-3: marcar blueprintComplete honestamente
    exam.blueprintComplete = true;

    seeds.push({
      id: `seed_${o.lang}_${o.level}_${sig(selected)}`,
      lang: o.lang,
      level: o.level,
      topic: exam.topic || `${o.lang.toUpperCase()} ${o.level} practice`,
      exam,
      itemCount: selected.length,
      coverageRatio: Number(cov.ratio.toFixed(2)),
      disjoint: isDisjoint,
      ...(disjointNote ? { disjointNote } : {}),
      createdAt: Date.now(),
      provenance: {
        generatedBy: 'build-disjoint-pool',
        validatedBy: 'audit-pass-2+lexicalCheck+CefrGate',
        gateFindings: {
          critical: gate.audit.critical,
          important: gate.audit.important,
          minor: gate.audit.minor,
        },
      },
    });
  }
  if (skippedGate > 0) console.log(`Gate rechazó: ${skippedGate} examen(es) (CHK-1/2/3/6/8/10)`);
  if (skippedBp > 0) console.log(`Blueprint incompleto: ${skippedBp} examen(es)`);

  const totalBank = (bank.questions || []).length;
  console.log(`\n== Disjoint pool ${o.lang}_${o.level} ==`);
  console.log(`Bank questions: ${totalBank} | disjoint exams built: ${seeds.length} | items consumed: ${usedIds.size}/${totalBank}`);
  console.log('Per-module coverage (sum target vs filled across built exams):');
  for (const [m, c] of Object.entries(moduleCov)) console.log(`  ${m}: ${c.filled}/${c.target}`);
  if (seeds.length) console.log(`Avg coverage ratio: ${(seeds.reduce((a, s) => a + s.coverageRatio, 0) / seeds.length).toFixed(2)}`);

  if (o.report || o.dryRun) {
    console.log('\n(dry-run/report: nothing written)');
    return;
  }

  // Topic balance report
  const generatedDir = path.join(ROOT, 'batches', 'generated');
  if (fs.existsSync(generatedDir)) {
    const topicStats = getTopicStats(generatedDir);
    const total = Object.values(topicStats).reduce((a, b) => a + b, 0);
    if (total > 0) {
      console.log('\nDistribución temática del banco:');
      const sorted = Object.entries(topicStats).sort((a, b) => b[1] - a[1]);
      for (const [topic, count] of sorted) {
        const pct = Math.round((count / total) * 100);
        const bar = '█'.repeat(Math.round(pct / 5));
        const warn = pct > 25 ? ' ⚠ SOBRE-REPRESENTADO' : '';
        console.log(`  ${topic.padEnd(12)} ${String(count).padStart(3)} (${String(pct).padStart(2)}%) ${bar}${warn}`);
      }
      const underused = TOPICS.filter(t => (topicStats[t] || 0) === 0);
      if (underused.length) console.log(`  Sin uso aún: ${underused.join(', ')}`);
    }
  }

  const outFile = o.out || path.join(ROOT, 'library', 'pool-seed', `${o.lang}_${o.level}.json`);

  if (!seeds.length) {
    console.log('\nNo se construyó ningún examen; pool anterior conservado.');
    process.exit(1);
  }

  let existing = [];
  if (o.append && fs.existsSync(outFile)) {
    try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8')) || []; } catch (_) { existing = []; }
  }
  const merged = [...existing, ...seeds];
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  atomicWriteJson(outFile, merged);
  console.log(`\nWrote ${seeds.length} exams (${merged.length} total) → ${path.relative(ROOT, outFile)}`);
}

main();
