/**
 * Shared paths and blueprint resolution for content pipeline scripts.
 * Provider mapping: de → goethe, en → cambridge, es → dele.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './loadEnv.mjs';

const require = createRequire(import.meta.url);
const {
  resolveBlueprintByType,
  loadBlueprintFileSync,
  BLUEPRINT_INDEX,
  EXAM_TYPE_BY_PROVIDER,
} = require(path.join(ROOT, 'js/engine/validation/blueprintResolver.js'));

export const LANGS = ['de', 'en', 'es'];
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function examTypeForLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l === 'de') return 'goethe';
  if (l === 'es') return 'dele';
  return 'cambridge';
}

export function normalizeLang(lang) {
  return String(lang || '').toLowerCase();
}

export function normalizeLevel(level) {
  return String(level || '').toUpperCase();
}

export function comboKey(lang, level) {
  return `${normalizeLang(lang)}_${normalizeLevel(level)}`;
}

export function parseLangLevelArgs(argv, defaults = {}) {
  const opts = {
    lang: defaults.lang ?? null,
    level: defaults.level ?? null,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') opts.lang = normalizeLang(argv[++i]);
    else if (a === '--level') opts.level = normalizeLevel(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

export function requireLangLevel(opts, usageLines = []) {
  if (opts.help) {
    console.log(usageLines.join('\n'));
    process.exit(0);
  }
  if (!opts.lang || !opts.level) {
    console.error('Required: --lang (de|en|es) and --level (A1–C2)');
    if (usageLines.length) console.log(usageLines.join('\n'));
    process.exit(2);
  }
}

export function resolveBlueprintForLangLevel(lang, level) {
  const examType = examTypeForLang(lang);
  try {
    return resolveBlueprintByType(examType, level);
  } catch {
    const fileId = BLUEPRINT_INDEX[comboKey(lang, level)];
    return fileId ? loadBlueprintFileSync(fileId) : null;
  }
}

export function blueprintFilePath(lang, level) {
  const examType = examTypeForLang(lang);
  return path.join(ROOT, 'library/blueprints', `${examType}_${normalizeLevel(level)}.json`);
}

export function bankPath(lang, level) {
  return path.join(ROOT, 'library', normalizeLang(lang), normalizeLevel(level), 'questions.json');
}

export function passagesPath(lang, level) {
  return path.join(ROOT, 'library', normalizeLang(lang), normalizeLevel(level), 'passages.json');
}

export function curatedDir(lang, level) {
  return path.join(ROOT, 'library/curated', normalizeLang(lang), normalizeLevel(level));
}

export function poolSeedPath(lang, level) {
  return path.join(ROOT, 'library/pool-seed', `${comboKey(lang, level)}.json`);
}

export function servedExamPath(lang, level) {
  return path.join(ROOT, 'data/exams', `${comboKey(lang, level)}.json`);
}

export function servedExamRel(lang, level) {
  return path.join('data/exams', `${comboKey(lang, level)}.json`);
}

export function auditDir() {
  return path.join(ROOT, 'docs/audit');
}

export function residualGapsPath(lang, level) {
  return path.join(auditDir(), `residual-gaps.${comboKey(lang, level)}.json`);
}

/** @deprecated legacy B1-only filename — use residualGapsPath */
export function legacyB1ResidualGapsPath() {
  return path.join(auditDir(), 'b1-residual-gaps.json');
}

export function unfilledPartsPath(lang, level) {
  return path.join(auditDir(), `unfilled.${comboKey(lang, level)}.json`);
}

/** @deprecated legacy B1-only filename */
export function legacyB1UnfilledPath() {
  return path.join(auditDir(), 'b1-unfilled.json');
}

export function fidelityAuditPath(lang, level) {
  return path.join(auditDir(), `validate-exam-fidelity.${comboKey(lang, level)}.json`);
}

export function loadJsonFile(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

export function loadBlueprint(lang, level) {
  const bp = resolveBlueprintForLangLevel(lang, level);
  if (!bp) {
    throw new Error(`No blueprint for ${comboKey(lang, level)} (${examTypeForLang(lang)})`);
  }
  return bp;
}

export function listCuratedFiles(lang, level) {
  const dir = curatedDir(lang, level);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith('curated') && f.endsWith('.json')).sort();
}

export function shortCuratedId(examId, lang, level) {
  const prefix = `curated_${comboKey(lang, level)}_`;
  return String(examId || '').startsWith(prefix) ? examId.slice(prefix.length) : examId;
}

export { ROOT, EXAM_TYPE_BY_PROVIDER, BLUEPRINT_INDEX };
