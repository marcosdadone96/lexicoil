#!/usr/bin/env node
/**
 * Coverage report: bank stats, blueprint gaps, disjoint exam capacity.
 * Teil counts derived from blueprint modules (Goethe, Cambridge, DELE).
 *
 * Usage:
 *   node scripts/bank-coverage-report.mjs
 *   node scripts/bank-coverage-report.mjs --lang de --levels B1,B2,C1 --json
 *   node scripts/bank-coverage-report.mjs --detail
 */
import fs from 'node:fs';
import path from 'node:path';
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

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const langs = (arg('--lang') || 'de,en,es').split(',').map((s) => s.trim());
const levels = (arg('--levels') || 'B1,B2,C1').split(',').map((s) => s.trim().toUpperCase());
const asJson = process.argv.includes('--json');
const showDetail = process.argv.includes('--detail');
const TARGET_EXAMS = Math.max(1, Number(arg('--target', '5')) || 5);

/** Mirror ExamBlueprint.modulePool for reporting. */
function modulePool(bank, moduleId) {
  const mod = String(moduleId).toLowerCase();
  return (bank.questions || []).filter((q) => {
    const m = String(q.module || '').toLowerCase();
    if (mod === 'lesen' || mod === 'reading') return m === 'lesen' || m === 'reading';
    if (mod === 'horen' || mod === 'listening') return m === 'horen' || m === 'listening';
    if (mod === 'grammatik' || mod === 'use_of_english') {
      return m === 'grammatik' || m === 'grammar' || m === 'use_of_english';
    }
    if (mod === 'schreiben' || mod === 'writing') return m === 'schreiben' || m === 'writing';
    if (mod === 'sprechen' || mod === 'speaking') return m === 'sprechen' || m === 'speaking';
    return m === mod;
  });
}

function partTarget(partSpec) {
  return partSpec.itemsTotal || partSpec.questionsTotal?.max || partSpec.questionsTotal?.min || 1;
}

function loadBank(lang, level) {
  const file = path.join(ROOT, 'library', lang, level, 'questions.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint(lang, level) {
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) return null;
  const file = path.join(ROOT, 'library', 'blueprints', `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function poolSeedStats(lang, level) {
  const file = path.join(ROOT, 'library', 'pool-seed', `${lang}_${level}.json`);
  if (!fs.existsSync(file)) return { entries: 0, validShape: 0 };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data)) return { entries: 0, validShape: 0 };
    const validShape = data.filter((e) => e && (e.id || e.exam)).length;
    return { entries: data.length, validShape };
  } catch {
    return { entries: 0, validShape: 0 };
  }
}

function countDisjointExams(lang, level, bank, blueprint, max = 15) {
  const usedIds = new Set();
  let built = 0;
  for (let attempt = 0; attempt < max + 5 && built < max; attempt++) {
    const sub = { ...bank, questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)) };
    if (!sub.questions.length) break;
    const assembled = ExamBlueprint.assemble(sub, blueprint);
    const selected = assembled.selected || [];
    if (!selected.length) break;
    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < 1.0) break;
    const exam = ExamBuilder.buildFromBlueprint(lang, level, sub, blueprint, { assembled });
    const check = new ExamValidator().validate(exam, { strict: false });
    if (!check.valid) {
      selected.forEach((q) => usedIds.add(q.id));
      continue;
    }
    selected.forEach((q) => usedIds.add(q.id));
    built++;
  }
  return { built, itemsUsed: usedIds.size, total: (bank.questions || []).length };
}

function blueprintTeilInventory(bank, blueprint) {
  const inventory = [];
  let minDisjointCapacity = Infinity;
  let bindingTeil = null;

  for (const mod of blueprint.modules || []) {
    const pool = modulePool(bank, mod.id);
    const teilCounts = {};
    for (const q of pool) {
      const t = q.teil ?? 0;
      teilCounts[t] = (teilCounts[t] || 0) + 1;
    }
    for (const part of mod.parts || []) {
      const teil = part.teil;
      const target = partTarget(part);
      const count = teilCounts[teil] || 0;
      const disjointCapacity = target ? Math.floor(count / target) : 0;
      if (disjointCapacity < minDisjointCapacity) {
        minDisjointCapacity = disjointCapacity;
        bindingTeil = `${mod.id}T${teil}`;
      }
      inventory.push({
        module: mod.id,
        teil,
        count,
        perExam: target,
        disjointCapacity,
        gapToTarget: Math.max(0, target * TARGET_EXAMS - count),
      });
    }
  }

  return {
    inventory,
    bindingTeil: minDisjointCapacity === Infinity ? null : bindingTeil,
    theoreticalDisjointMax: minDisjointCapacity === Infinity ? 0 : minDisjointCapacity,
  };
}

function reportCombo(lang, level) {
  const bank = loadBank(lang, level);
  const blueprint = loadBlueprint(lang, level);
  if (!bank || !blueprint) {
    return { lang, level, error: 'missing bank or blueprint' };
  }
  const assembled = ExamBlueprint.assemble(bank, blueprint);
  const cov = ExamBlueprint.coverageSummary(assembled.coverage);
  const disjoint = countDisjointExams(lang, level, bank, blueprint);
  const pool = poolSeedStats(lang, level);
  const teil = blueprintTeilInventory(bank, blueprint);
  const gaps = (assembled.coverage || [])
    .filter((c) => !c.complete)
    .map((c) => `${c.module}T${c.teil} ${c.filled}/${c.target}`);

  const teilCountsByModule = {};
  for (const row of teil.inventory) {
    if (!teilCountsByModule[row.module]) teilCountsByModule[row.module] = {};
    teilCountsByModule[row.module][row.teil] = row.count;
  }

  return {
    lang,
    level,
    examType: blueprint.examType,
    questions: bank.questions.length,
    passages: bank.passages.length,
    poolSeedEntries: pool.entries,
    poolSeedValidShape: pool.validShape,
    poolVsDisjointGap: pool.entries - disjoint.built,
    blueprintCoverage: Number(cov.ratio.toFixed(2)),
    completeParts: `${cov.complete}/${cov.total}`,
    disjointExamsCertified: disjoint.built,
    theoreticalDisjointMax: teil.theoreticalDisjointMax,
    bindingTeil: teil.bindingTeil,
    itemsPerExam: disjoint.built ? Math.round(disjoint.itemsUsed / disjoint.built) : null,
    gapToTarget: Math.max(0, TARGET_EXAMS - disjoint.built),
    gaps,
    teilInventory: teil.inventory,
    teilCounts: teilCountsByModule,
  };
}

const rows = [];
for (const lang of langs) {
  for (const level of levels) {
    rows.push(reportCombo(lang, level));
  }
}

if (asJson) {
  console.log(JSON.stringify({ targetExams: TARGET_EXAMS, rows }, null, 2));
  process.exit(0);
}

console.log('\n# LexiCoil — Bank coverage report');
console.log(`Target: ${TARGET_EXAMS} disjoint complete exams per lang/level (B1, B2, C1)`);
console.log('Pool = entries in pool-seed; Disjoint = certified non-overlapping exams\n');
console.log(
  '| Lang | Level | Type | Q | P | Pool | Disjoint | Theo.max | Binding | Gap→target |',
);
console.log(
  '|------|-------|------|---:|---:|-----:|---------:|---------:|---------|----:|',
);
for (const r of rows) {
  if (r.error) {
    console.log(`| ${r.lang} | ${r.level} | — | — | — | — | — | — | ${r.error} | — |`);
    continue;
  }
  const poolWarn = r.poolVsDisjointGap > 2 ? ` (+${r.poolVsDisjointGap})` : '';
  console.log(
    `| ${r.lang} | ${r.level} | ${r.examType} | ${r.questions} | ${r.passages} | ${r.poolSeedEntries}${poolWarn} | ${r.disjointExamsCertified} | ${r.theoreticalDisjointMax} | ${r.bindingTeil || '—'} | ${r.gapToTarget} |`,
  );
}

console.log('\n## Gaps by combo (blueprint assembly)\n');
for (const r of rows) {
  if (r.error || !r.gaps?.length) continue;
  console.log(
    `**${r.lang}/${r.level}** (${r.gaps.length} incomplete Teile): ${r.gaps.slice(0, 12).join(', ')}${r.gaps.length > 12 ? '…' : ''}`,
  );
}

if (showDetail) {
  console.log(`\n## Teil inventory (count / perExam / disjointCapacity / gap→${TARGET_EXAMS})\n`);
  for (const r of rows) {
    if (r.error || !r.teilInventory?.length) continue;
    console.log(`### ${r.lang}/${r.level}\n`);
    console.log(`| Module | Teil | Count | Per exam | Capacity | Gap→${TARGET_EXAMS} |`);
    console.log('|--------|-----:|------:|---------:|---------:|-------:|');
    for (const t of r.teilInventory) {
      console.log(
        `| ${t.module} | ${t.teil} | ${t.count} | ${t.perExam} | ${t.disjointCapacity} | ${t.gapToTarget} |`,
      );
    }
    console.log('');
  }
}
