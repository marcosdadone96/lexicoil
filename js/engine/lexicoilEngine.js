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

  async function generatePersonalExam(subject, level, words, skills, hooks, options = {}) {
    const Domain = window.LexiCoilDomain;
    const KE = window.KnowledgeEngine;
    const provider = { de: 'goethe', en: 'cambridge', es: 'dele' }[subject];
    let targetWords = [...(words || [])];
    if (typeof ManualVocab !== 'undefined' && ManualVocab.canonicalizeForGeneration) {
      const canon = await ManualVocab.canonicalizeForGeneration(targetWords, subject, level);
      targetWords = canon.words;
      if (canon.corrections?.length && typeof notify === 'function') {
        const sample = canon.corrections.slice(0, 2).map((c) => `"${c.from}"→"${c.to}"`).join(', ');
        notify(`Spelling corrected for generation: ${sample}${canon.corrections.length > 2 ? '…' : ''}`, 'info', 5000);
      }
      if (canon.excluded?.length && typeof notify === 'function') {
        notify(
          `Words skipped (not in the library): ${canon.excluded.slice(0, 3).join(', ')}${canon.excluded.length > 3 ? '…' : ''}`,
          'warn',
          6000,
        );
      }
    }
    const spec = await KE.buildSpec({
      language: Domain.languageFromSubjectCode(subject),
      level,
      provider,
      contentType: 'VocabularyExercise',
      targetWords,
      topic: 'Personal vocabulary review',
      skills: skills || ['lesen'],
      vocabPolicy: { targetWords, maximizeCoverage: true, ensureDensePart: true },
    });
    let blueprint = options.blueprint;
    if (
      !blueprint &&
      typeof ExamBlueprint !== 'undefined' &&
      ExamBlueprint.hasBlueprint?.(subject, level)
    ) {
      try {
        blueprint = await ExamBlueprint.load(subject, level);
      } catch (e) {
        if (typeof lcDebug !== 'undefined') lcDebug.warn('[personal] blueprint load failed:', e);
      }
    }
    if (blueprint) {
      spec.metadata = { ...(spec.metadata || {}), blueprint };
    }
    if (options.teilFilter != null) {
      spec.personalTeilFilter = options.teilFilter;
    }
    return window.ExamGenerator.generatePersonal(spec, hooks, { ...options, blueprint });
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
