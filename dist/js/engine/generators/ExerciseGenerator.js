/**
 * ExerciseGenerator — Phase 07
 * Quick modules and skill-specific exercises
 */
const ExerciseGenerator = (() => {
  const CONTENT_TYPES = [
    'ReadingExercise',
    'ListeningExercise',
    'WritingExercise',
    'SpeakingExercise',
    'GrammarExercise',
    'VocabularyExercise',
    'Quiz',
  ];

  const QUICK_MAP = {
    reading: 'ReadingExercise',
    listening: 'ListeningExercise',
    writing: 'WritingExercise',
    gapfill: 'GrammarExercise',
    speaking: 'SpeakingExercise',
  };

  function getPromptBuilder() {
    if (typeof PromptBuilder !== 'undefined') return PromptBuilder;
    return require('../prompts/PromptBuilder.js');
  }

  function quickModFromSpec(spec, options) {
    if (options?.quickMod) return options.quickMod;
    const ct = spec.contentType;
    if (ct === 'ReadingExercise') return 'reading';
    if (ct === 'ListeningExercise') return 'listening';
    if (ct === 'WritingExercise') return 'writing';
    if (ct === 'GrammarExercise') return 'gapfill';
    if (ct === 'SpeakingExercise') return 'writing';
    return 'reading';
  }

  async function generate(spec, hooks, options) {
    const PB = getPromptBuilder();
    const quickMod = quickModFromSpec(spec, options);
    const built = PB.buildPrompt(spec, { quickMod });
    const raw = await hooks.callAI(built.prompt, built.maxTokens, {
      consumeQuota: false,
      ...(options?.aiOptions || {}),
    });
    const text = String(raw).replace(/```json|```/g, '').trim();
    const parsed = hooks.parseExamJson(text);
    return typeof hooks.normalizeExam === 'function' ? hooks.normalizeExam(parsed) : parsed;
  }

  function contentTypeForQuickMod(mod) {
    return QUICK_MAP[mod] || 'ReadingExercise';
  }

  return Object.freeze({
    contentTypes: CONTENT_TYPES,
    generate,
    contentTypeForQuickMod,
    QUICK_MAP,
  });
})();

if (typeof window !== 'undefined') window.ExerciseGenerator = ExerciseGenerator;
if (typeof module !== 'undefined') module.exports = ExerciseGenerator;
