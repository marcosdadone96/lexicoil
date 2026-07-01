/**
 * Saved vocab quiz store — filter by goal, merge, retake stats.
 * Run: node scripts/test-saved-vocab-quizzes.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadModule(relPath, extra = {}) {
  const code = readFileSync(join(root, relPath), 'utf8');
  const ctx = {
    window: {},
    console,
    localStorage: {
      _d: {},
      getItem(k) {
        return this._d[k] ?? null;
      },
      setItem(k, v) {
        this._d[k] = v;
      },
    },
    ...extra,
  };
  ctx.window = ctx;
  vm.runInNewContext(code, ctx);
  return ctx;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Minimal normalizeGoalLevel
function normalizeGoalLevel(l) {
  return String(l || '').trim().toUpperCase();
}

const ctx = loadModule('js/data/savedVocabQuizzes.js', {
  S: {
    savedQuizzes: [],
    deletedSavedQuizzes: [],
    flashcards: [{ word: 'Haus', sourceLang: 'de', id: 'fc1' }],
  },
  normalizeGoalLevel,
  SubjectMeta: { langName: (l) => (l === 'de' ? 'German' : l) },
  formatAppDate: () => '1 Jan 2026',
  esc: (s) => String(s),
  goalLabel: (g) => `${g.level} ${g.subject}`,
  getActiveGoal: () => null,
  Auth: { pushSync: () => {} },
});

const SVQ = ctx.SavedVocabQuizzes;

const goalDe = { id: 'goal_de_b1', subject: 'de', level: 'B1' };
const goalEn = { id: 'goal_en_b2', subject: 'en', level: 'B2' };

const id = SVQ.persistAfterGeneration({
  goal: goalDe,
  subject: 'de',
  level: 'B1',
  hintLang: 'en',
  hintLanguageMode: 'interface',
  questions: [{ word: 'Haus', hint: 'dwelling', options: ['Haus', 'Auto', 'Baum', 'Stuhl'] }],
  pool: [{ word: 'Haus', sourceLang: 'de', id: 'fc1' }],
  questionCount: 1,
});

assert(id, 'persistAfterGeneration returns id');
assert(ctx.S.savedQuizzes.length === 1, 'quiz stored in S.savedQuizzes');

const forDe = SVQ.quizzesForGoal(goalDe);
assert(forDe.length === 1, 'quiz matches goal by goalId/lang/level');

const forEn = SVQ.quizzesForGoal(goalEn);
assert(forEn.length === 0, 'quiz does not match other goal');

SVQ.recordResult(id, 1, 1);
const updated = SVQ.getById(id);
assert(updated.playCount === 1, 'playCount incremented');
assert(updated.bestScore === 1, 'bestScore set');
assert(updated.lastScore === 1, 'lastScore set');

const merged = SVQ.mergeSavedQuizzes(
  ctx.S.savedQuizzes,
  [
    {
      id,
      lang: 'de',
      level: 'B1',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() + 5000,
      lastScore: 0,
      playCount: 2,
      questions: [],
    },
  ],
  [],
);
assert(merged.length === 1, 'merge keeps one quiz');
assert(merged[0].playCount === 2, 'merge prefers newer server copy');

const tomb = SVQ.mergeSavedQuizzes(ctx.S.savedQuizzes, [], [{ id, deletedAt: Date.now() + 9999 }]);
assert(tomb.length === 0, 'tombstone removes quiz');

console.log('test-saved-vocab-quizzes.mjs: all passed');
