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
function sig(selected) {
  return crypto.createHash('sha256').update(selected.map((q) => q.id).sort().join(',')).digest('hex').slice(0, 12);
}

function main() {
  const o = args(process.argv.slice(2));
  const bank = loadBank(o.lang, o.level);
  const blueprint = loadBlueprint(o.lang, o.level);
  const usedIds = new Set();
  const seeds = [];
  const moduleCov = {};
  let attempts = 0;

  while (seeds.length < o.max && attempts < o.max + 5) {
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
      // Skip invalid; still burn its ids so we don't loop on the same pick.
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }
    selected.forEach((q) => usedIds.add(q.id));
    assembled.coverage.forEach((c) => {
      moduleCov[c.module] = moduleCov[c.module] || { target: 0, filled: 0 };
      moduleCov[c.module].target += c.target || 0;
      moduleCov[c.module].filled += c.filled || 0;
    });
    seeds.push({
      id: `seed_${o.lang}_${o.level}_${sig(selected)}`,
      lang: o.lang,
      level: o.level,
      topic: exam.topic || `${o.lang.toUpperCase()} ${o.level} practice`,
      exam,
      itemCount: selected.length,
      coverageRatio: Number(cov.ratio.toFixed(2)),
      disjoint: true,
      createdAt: Date.now(),
    });
  }

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
