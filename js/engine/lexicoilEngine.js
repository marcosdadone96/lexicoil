/**
 * LexiCoil Content Engine facade — browser entry point
 */
const LexiCoilEngine = (() => {
  async function buildExamSpec(subject, level, topic, extra) {
    const Domain = window.LexiCoilDomain;
    const KE = window.KnowledgeEngine;
    const lang = Domain.languageFromSubjectCode(subject);
    const provider = { de: 'goethe', en: 'cambridge', es: 'dele' }[subject];
    return KE.buildSpec({
      language: lang,
      level,
      provider,
      contentType: 'Exam',
      topic,
      ...(extra || {}),
    });
  }

  async function generateExam(subject, level, topic, hooks, options) {
    const spec = await buildExamSpec(subject, level, topic, options?.specExtra);
    return window.ExamGenerator.generate(spec, hooks, options);
  }

  async function generateQuickExercise(subject, level, mod, topic, hooks) {
    const Domain = window.LexiCoilDomain;
    const KE = window.KnowledgeEngine;
    const ct = window.ExerciseGenerator.contentTypeForQuickMod(mod);
    const spec = await KE.buildSpec({
      language: Domain.languageFromSubjectCode(subject),
      level,
      contentType: ct,
      topic,
    });
    return window.ExerciseGenerator.generate(spec, hooks, { quickMod: mod });
  }

  async function generatePersonalExam(subject, level, words, skills, hooks) {
    const Domain = window.LexiCoilDomain;
    const KE = window.KnowledgeEngine;
    const provider = { de: 'goethe', en: 'cambridge', es: 'dele' }[subject];
    const spec = await KE.buildSpec({
      language: Domain.languageFromSubjectCode(subject),
      level,
      provider,
      contentType: 'VocabularyExercise',
      targetWords: words,
      topic: 'Personal vocabulary review',
      skills: skills || ['lesen', 'horen'],
      vocabPolicy: { targetWords: words, maximizeCoverage: true, ensureDensePart: true },
    });
    return window.ExamGenerator.generatePersonal(spec, hooks);
  }

  async function generateFromSpec(spec, hooks, options) {
    return window.ContentGenerator.generate(spec, hooks, options);
  }

  /** Random exam topic from knowledge/languages/{lang}.json */
  async function pickTopic(subject, level) {
    return window.KnowledgeEngine.pickRandomTopic(subject, level);
  }

  async function listTopics(subject, level) {
    return window.KnowledgeEngine.listTopics(subject, level);
  }

  return Object.freeze({
    buildExamSpec,
    generateExam,
    generateQuickExercise,
    generatePersonalExam,
    generateFromSpec,
    pickTopic,
    listTopics,
  });
})();

if (typeof window !== 'undefined') window.LexiCoilEngine = LexiCoilEngine;
