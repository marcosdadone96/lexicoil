/**
 * Strategy B feature flag — library-first per servable level (Phase 2).
 * When a level passes catalogThresholds, live AI is blocked for standard exams.
 */
function isLevelServable(subject, level) {
  if (!subject || !level) return false;
  if (typeof LibraryLoader !== 'undefined' && typeof LibraryLoader.hasLibrary === 'function') {
    return LibraryLoader.hasLibrary(subject, level);
  }
  if (typeof module === 'undefined') return false;
  try {
    const fs = require('fs');
    const path = require('path');
    const ContentServable = require('../library/contentServable.js');
    const LibraryCatalog = require('../library/libraryCatalog.js');
    const root = process.cwd();
    const base = path.join(root, 'library', subject, level);
    const qPath = path.join(base, 'questions.json');
    if (!fs.existsSync(qPath)) return false;
    const questionsBank = JSON.parse(fs.readFileSync(qPath, 'utf8'));
    const passagesPath = path.join(base, 'passages.json');
    const wsPath = path.join(base, 'writing-speaking.json');
    const passagesFile = fs.existsSync(passagesPath) ? JSON.parse(fs.readFileSync(passagesPath, 'utf8')) : null;
    const wsFile = fs.existsSync(wsPath) ? JSON.parse(fs.readFileSync(wsPath, 'utf8')) : null;
    const bpId = LibraryCatalog.blueprintId(subject, level);
    const bpPath = bpId ? path.join(root, 'library/blueprints', `${bpId}.json`) : null;
    const blueprint = bpPath && fs.existsSync(bpPath) ? JSON.parse(fs.readFileSync(bpPath, 'utf8')) : null;
    ContentServable.loadThresholdsSync(fs.readFileSync, root);
    const passages = ContentServable.mergePassages(questionsBank.passages, passagesFile?.passages);
    return ContentServable.assessLevel({
      lang: subject,
      level,
      questions: questionsBank.questions,
      passages,
      writingSpeaking: wsFile || { writing: [], speaking: [] },
      blueprint,
    }).servable;
  } catch (_) {
    return false;
  }
}

function strategyBEnabled(options = {}) {
  if (options && typeof options.strategyB === 'boolean') return options.strategyB;
  const subject = options?.subject;
  const level = options?.level;
  if (subject && level) {
    return isLevelServable(subject, level);
  }
  if (typeof process !== 'undefined' && process.env && process.env.STRATEGY_B === '1') return true;
  if (typeof window !== 'undefined' && window.LC_STRATEGY_B === '1') return true;
  return false;
}

function isPersonalVocabExamRequest(opts = {}) {
  if (opts.personalVocab === true) return true;
  if (opts.words?.length >= 4) return true;
  if (opts.vocabPersonal === true) return true;
  return false;
}

function liveAiDisabled(subject, level) {
  if (typeof window !== 'undefined') {
    if (window.LC_DISABLE_LIVE_AI === false) return false;
    if (window.LC_DISABLE_LIVE_AI === true) return true;
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.LC_DISABLE_LIVE_AI === '0') return false;
    if (process.env.LC_DISABLE_LIVE_AI === '1') return true;
  }
  if (!subject || !level) return true;
  const hasBank = isLevelServable(subject, level);
  let hasStatic = false;
  if (typeof ExamLibrary !== 'undefined' && typeof ExamLibrary.hasLibrary === 'function') {
    hasStatic = ExamLibrary.hasLibrary(subject, level);
  }
  return !(hasBank || hasStatic);
}

if (typeof module !== 'undefined') {
  module.exports = { strategyBEnabled, isPersonalVocabExamRequest, isLevelServable, liveAiDisabled };
}

if (typeof window !== 'undefined') {
  window.strategyBEnabled = strategyBEnabled;
  window.isLevelServable = isLevelServable;
  window.liveAiDisabled = liveAiDisabled;
  window.LC_COOLDOWN_DAYS = window.LC_COOLDOWN_DAYS ?? 15;
}
