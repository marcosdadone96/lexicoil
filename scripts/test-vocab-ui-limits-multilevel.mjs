/**
 * Vocab UI limits + translation + fallback quiz — A2/B1/B2 (level-agnostic logic).
 */
import { createRequire } from 'module';
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

function loadScript(rel) {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  return code;
}

// VocabBatching
const batchCode = loadScript('js/library/VocabBatching.js');
const batchCtx = { console, window: {} };
vm.createContext(batchCtx);
vm.runInContext(batchCode, batchCtx);
const VocabBatching = batchCtx.VocabBatching || batchCtx.window.VocabBatching;

const levels = ['A2', 'B1', 'B2'];
let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else console.log('ok', msg);
}

console.log('── ACTIVITY_CAPACITY (all levels) ──');
for (const lv of levels) {
  ok(VocabBatching.ACTIVITY_CAPACITY.vocab_quiz === 10, `${lv} quiz cap 10`);
  ok(VocabBatching.ACTIVITY_CAPACITY.listening_game === 6, `${lv} listen cap 6`);
  ok(VocabBatching.ACTIVITY_CAPACITY.vocab_phrases === 7, `${lv} phrases cap 7`);
}

console.log('\n── capacityFor personal (Lesen/Hören) ──');
for (const lv of levels) {
  ok(VocabBatching.capacityFor(['lesen']) === 10, `${lv} lesen-only cap 10`);
  ok(VocabBatching.capacityFor(['horen']) === 6, `${lv} horen-only cap 6`);
  ok(VocabBatching.capacityFor(['lesen', 'horen']) === 6, `${lv} combined min cap 6`);
}

// fcCardTranslation (no EN leak for ES UI)
const flashCode = loadScript('js/ui/vocabulary/flashcards.js');
const localeCode = loadScript('js/i18n/vocabModuleLocale.js');
const fcCtx = vm.createContext({
  console,
  S: { subject: 'de', vocabCache: {}, fcLang: 'es' },
  localStorage: { getItem: () => 'es', setItem: () => {} },
});
vm.runInContext(localeCode, fcCtx);
vm.runInContext(flashCode, fcCtx);

console.log('\n── fcCardTranslation ES UI ──');
const fc = {
  word: 'sinken',
  translations: { en: 'decreases' },
  sourceLang: 'de',
};
const tr = fcCtx.fcCardTranslation(fc, 'es');
ok(tr === '—' || tr !== 'decreases', 'ES UI must not show English gloss from translations.en');
const fc2 = {
  word: 'Haus',
  translations: { es: 'casa' },
  sourceLang: 'de',
};
ok(fcCtx.fcCardTranslation(fc2, 'es') === 'casa', 'ES translation shown when present');
const fcPolluted = {
  word: 'Approver',
  translations: { en: 'Approver', es: 'Approver' },
  sourceLang: 'de',
};
ok(fcCtx.fcCardTranslation(fcPolluted, 'es') === '—', 'ES must not reuse English duplicate in translations.es');

// VocabQuizUtils fallback
const quizCode = loadScript('js/data/vocabQuizUtils.js');
const quizCtx = vm.createContext({ console, VerbConjugation: undefined, SeparableResolve: undefined, globalThis: {} });
quizCtx.globalThis = quizCtx;
vm.runInContext(quizCode, quizCtx);
const VocabQuizUtils = quizCtx.VocabQuizUtils;

console.log('\n── buildFallbackVocabQuiz ──');
const words = ['laufen', 'Haus', 'groß', 'schnell'];
const meta = words.map((w, i) => ({
  word: w,
  type: i === 0 ? 'verb' : 'noun',
  translation: ['run', 'house', 'big', 'fast'][i],
}));
const qs = VocabQuizUtils.buildFallbackVocabQuiz(words, {
  count: 4,
  hintLang: 'es',
  lang: 'de',
  wordMeta: meta,
});
ok(qs.length >= 4, 'fallback produces 4+ questions');
ok(qs.every((q) => q.options.length === 4), 'each question has 4 options');
ok(qs[0].hint.includes('Significa') || qs[0].hint.includes('palabra'), 'Spanish hint when hintLang=es');

console.log('\n── examConfig cap helpers (simulated) ──');
function examConfigVocabCap(skills) {
  if (skills.includes('schreiben') || skills.includes('sprechen')) return null;
  return VocabBatching.capacityFor(skills);
}
for (const lv of levels) {
  ok(examConfigVocabCap(['lesen']) === 10, `${lv} examConfig lesen cap`);
  ok(examConfigVocabCap(['horen']) === 6, `${lv} examConfig horen cap`);
  ok(examConfigVocabCap(['schreiben']) === null, `${lv} schreiben disables cap UI`);
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll vocab UI limit checks passed (A2/B1/B2).');
