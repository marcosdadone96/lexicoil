/**
 * Build generation job lists from bank coverage (gaps or one full exam).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';

const require = createRequire(import.meta.url);
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));

function modulePool(bank, moduleId) {
  const mod = String(moduleId).toLowerCase();
  return (bank.questions || []).filter((q) => {
    const m = String(q.module || '').toLowerCase();
    if (mod === 'lesen' || mod === 'reading') return m === 'lesen' || m === 'reading';
    if (mod === 'horen' || mod === 'listening') return m === 'horen' || m === 'listening';
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

export function getTeilInventory(lang, level, targetExams = 5) {
  const bank = loadBank(lang, level);
  const blueprint = loadBlueprint(lang, level);
  if (!bank || !blueprint) return [];

  const inventory = [];
  for (const mod of blueprint.modules || []) {
    const pool = modulePool(bank, mod.id);
    const teilCounts = {};
    for (const q of pool) {
      const t = q.teil ?? 0;
      teilCounts[t] = (teilCounts[t] || 0) + 1;
    }
    for (const part of mod.parts || []) {
      const teil = part.teil;
      const perExam = partTarget(part);
      const count = teilCounts[teil] || 0;
      inventory.push({
        module: mod.id,
        teil,
        count,
        perExam,
        disjointCapacity: perExam ? Math.floor(count / perExam) : 0,
        gapToTarget: Math.max(0, perExam * targetExams - count),
      });
    }
  }
  return inventory;
}

/** One batch per Teil = 11 API calls (Goethe B1). */
export const ONE_EXAM_JOBS = [
  ...[1, 2, 3, 4, 5].map((teil) => ({ module: 'lesen', teil })),
  ...[1, 2, 3, 4].map((teil) => ({ module: 'horen', teil })),
  { module: 'schreiben' },
  { module: 'sprechen' },
];

const MULTI_TEIL_MODULES = new Set(['schreiben', 'sprechen', 'writing', 'speaking']);

/**
 * @param {'gaps'|'one-exam'} mode
 * @param {number} maxRepeatsPerTeil cap batches per Teil in gaps mode
 */
export function getGenerationJobs(lang, level, { mode = 'gaps', targetExams = 5, maxRepeatsPerTeil = 2 } = {}) {
  if (mode === 'one-exam') return [...ONE_EXAM_JOBS];

  const inventory = getTeilInventory(lang, level, targetExams);
  const jobs = [];
  const needMulti = { schreiben: false, sprechen: false };

  const sorted = [...inventory].sort((a, b) => b.gapToTarget - a.gapToTarget);
  for (const row of sorted) {
    if (row.gapToTarget <= 0) continue;
    if (MULTI_TEIL_MODULES.has(row.module)) {
      needMulti[row.module] = true;
      continue;
    }
    const repeats = Math.min(Math.ceil(row.gapToTarget / row.perExam), maxRepeatsPerTeil);
    for (let i = 0; i < repeats; i++) {
      jobs.push({ module: row.module, teil: row.teil, gap: row.gapToTarget });
    }
  }
  if (needMulti.schreiben) jobs.push({ module: 'schreiben' });
  if (needMulti.sprechen) jobs.push({ module: 'sprechen' });

  return jobs;
}
