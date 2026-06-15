/**
 * Central blueprint resolver — library/blueprints/{examType}_{LEVEL}.json
 * Used by ExamValidator, PromptBuilder (AI path), and tests.
 */
const EXAM_TYPE_BY_PROVIDER = Object.freeze({
  goethe: 'goethe',
  cambridge: 'cambridge',
  dele: 'dele',
});

const BLUEPRINT_INDEX = Object.freeze(
  typeof LibraryCatalog !== 'undefined'
    ? LibraryCatalog.buildBlueprintIndex()
    : (() => {
        const idx = {};
        for (const lang of ['de', 'en', 'es']) {
          const type = lang === 'de' ? 'goethe' : lang === 'es' ? 'dele' : 'cambridge';
          for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
            idx[`${lang}_${level}`] = `${type}_${level}`;
          }
        }
        return idx;
      })(),
);

const CACHE = {};

function examBlueprintKey(exam) {
  if (!exam?.level) return null;
  const lang = exam.lang === 'de' ? 'de' : exam.lang === 'es' ? 'es' : 'en';
  return `${lang}_${exam.level}`;
}

function blueprintFileId(examType, level) {
  const lv = String(level || '').toUpperCase();
  const type = String(examType || '').toLowerCase();
  if (!type || !lv) return null;
  const id = `${type}_${lv}`;
  return Object.values(BLUEPRINT_INDEX).includes(id) ? id : null;
}

function blueprintFileIdFromSpec(spec) {
  if (!spec?.level) return null;
  const examType = EXAM_TYPE_BY_PROVIDER[spec.provider];
  if (examType) return blueprintFileId(examType, spec.level);
  const langKey =
    spec.language === 'german' ? 'de' : spec.language === 'spanish' ? 'es' : 'en';
  return BLUEPRINT_INDEX[`${langKey}_${spec.level}`] || null;
}

function loadBlueprintFileSync(fileId) {
  if (!fileId) return null;
  if (CACHE[fileId]) return CACHE[fileId];
  try {
    const fs = require('fs');
    const path = require('path');
    const candidates = [
      path.join(process.cwd(), 'library', 'blueprints', `${fileId}.json`),
      path.join(__dirname, '../../../library/blueprints', `${fileId}.json`),
    ];
    let file = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        file = c;
        break;
      }
    }
    if (!file) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    CACHE[fileId] = data;
    return data;
  } catch {
    return null;
  }
}

function resolveBlueprintByType(examType, level) {
  const fileId = blueprintFileId(examType, level);
  if (!fileId) {
    const err = new Error(`No blueprint for examType=${examType} level=${level}`);
    err.code = 'blueprint_not_found';
    throw err;
  }
  const bp = loadBlueprintFileSync(fileId);
  if (!bp) {
    const err = new Error(`Blueprint file missing: ${fileId}.json`);
    err.code = 'blueprint_not_found';
    throw err;
  }
  return bp;
}

function resolveBlueprintForSpec(spec) {
  const fileId = blueprintFileIdFromSpec(spec);
  if (!fileId) return null;
  return loadBlueprintFileSync(fileId);
}

function loadBlueprintSync(exam) {
  const k = examBlueprintKey(exam);
  const fileId = k ? BLUEPRINT_INDEX[k] : null;
  return fileId ? loadBlueprintFileSync(fileId) : null;
}

function resolveBlueprint(exam, explicit) {
  if (explicit) return explicit;
  if (typeof require === 'undefined') return null;
  return loadBlueprintSync(exam);
}

function cacheBlueprint(fileId, blueprint) {
  if (fileId && blueprint) CACHE[fileId] = blueprint;
}

function aiPathBlueprintsEnabled() {
  if (typeof process !== 'undefined' && process.env?.AI_PATH_BLUEPRINTS === '1') return true;
  if (typeof window !== 'undefined' && window.LC_AI_PATH_BLUEPRINTS === '1') return true;
  return false;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EXAM_TYPE_BY_PROVIDER,
    BLUEPRINT_INDEX,
    examBlueprintKey,
    blueprintFileId,
    blueprintFileIdFromSpec,
    loadBlueprintFileSync,
    resolveBlueprintByType,
    resolveBlueprintForSpec,
    loadBlueprintSync,
    resolveBlueprint,
    cacheBlueprint,
    aiPathBlueprintsEnabled,
  };
}

if (typeof window !== 'undefined') {
  window.BlueprintResolver = {
    EXAM_TYPE_BY_PROVIDER,
    BLUEPRINT_INDEX,
    blueprintFileIdFromSpec,
    resolveBlueprintForSpec,
    aiPathBlueprintsEnabled,
    cacheBlueprint,
  };
}
