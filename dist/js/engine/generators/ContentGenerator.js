/**
 * Routes ContentSpecification → appropriate generator
 */
const ContentGenerator = (() => {
  const REGISTRY = () => {
    const g = (name) => {
      if (typeof window !== 'undefined' && window[name]) return window[name];
      return require('./' + name + '.js');
    };
    return {
      Exam: g('ExamGenerator'),
      MiniExam: g('ExamGenerator'),
      ReadingExercise: g('ExerciseGenerator'),
      ListeningExercise: g('ExerciseGenerator'),
      WritingExercise: g('ExerciseGenerator'),
      SpeakingExercise: g('ExerciseGenerator'),
      GrammarExercise: g('ExerciseGenerator'),
      VocabularyExercise: g('ExerciseGenerator'),
      Quiz: g('ExerciseGenerator'),
      Flashcards: g('FlashcardGenerator'),
      Story: g('StoryGenerator'),
      Dialogue: g('DialogueGenerator'),
    };
  };

  async function generate(spec, hooks, options) {
    const map = REGISTRY();
    const ct = spec.contentType;
    const gen = map[ct];
    if (!gen) {
      const err = new Error('No generator for contentType: ' + ct);
      err.code = 'unknown_content_type';
      throw err;
    }

    if (ct === 'Exam' || ct === 'MiniExam') {
      return gen.generate(spec, hooks, options);
    }

    if (ct === 'VocabularyExercise' && spec.targetWords?.length >= 3) {
      const ExamGen = map.Exam;
      return ExamGen.generatePersonal(spec, hooks);
    }

    return gen.generate(spec, hooks, options);
  }

  return Object.freeze({ generate, REGISTRY });
})();

if (typeof window !== 'undefined') window.ContentGenerator = ContentGenerator;
if (typeof module !== 'undefined') module.exports = ContentGenerator;
