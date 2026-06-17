/**
 * Strategy B feature flag — library-first per servable level (Phase 2).
 * When a level passes catalogThresholds, live AI is blocked for standard exams.
 */
function levelAvailabilityRef() {
  if (typeof LevelAvailability !== 'undefined') return LevelAvailability;
  if (typeof module !== 'undefined') {
    try {
      return require('../library/levelAvailability.js');
    } catch (_) {
      return null;
    }
  }
  return null;
}

function isLevelServable(subject, level) {
  if (!subject || !level) return false;
  const la = levelAvailabilityRef();
  if (la) return la.isLevelServable(subject, level);
  if (typeof LibraryLoader !== 'undefined' && typeof LibraryLoader.hasLibrary === 'function') {
    return LibraryLoader.hasLibrary(subject, level);
  }
  return false;
}

/**
 * Strategy-A direct pool: when LC_DIRECT_POOL=1, AI exams may enter the served pool
 * without human review (quality gate only). Moderation is a posteriori via admin.
 */
function directPoolContribEnabled() {
  if (typeof process !== 'undefined' && process.env && process.env.LC_DIRECT_POOL === '1') return true;
  if (typeof window !== 'undefined' && window.LC_DIRECT_POOL === '1') return true;
  return false;
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
  const la = levelAvailabilityRef();
  if (la) return la.liveAiDisabled(subject, level);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = { strategyBEnabled, isPersonalVocabExamRequest, isLevelServable, liveAiDisabled, directPoolContribEnabled };
}

if (typeof window !== 'undefined') {
  window.strategyBEnabled = strategyBEnabled;
  window.isLevelServable = isLevelServable;
  window.liveAiDisabled = liveAiDisabled;
  window.directPoolContribEnabled = directPoolContribEnabled;
  window.LC_COOLDOWN_DAYS = window.LC_COOLDOWN_DAYS ?? 15;
}
