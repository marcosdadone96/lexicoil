#!/usr/bin/env node
/**
 * Grammar error categories → mastery weak areas (Schreiben/Sprechen + Lesen/Hören).
 * Run: node scripts/lib/__tests__/grammar-error-mastery.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GrammarCategories = require(path.join(ROOT, 'js/library/grammarCategories.js'));
const {
  normalizeSchreibenItem,
  normalizeSprechenItem,
  writingCorrectionPrompt,
  writingCorrectionSystem,
} = require(path.join(ROOT, 'netlify/functions/lib/productionEval.js'));

const ctx = { console, window: {}, GrammarCategories };
vm.createContext(ctx);
// Minimal Goethe question walker for objective tag stats in Node tests
ctx.forEachGoetheQ = (examData, fn) => {
  if (examData?.lesen?.questions) examData.lesen.questions.forEach((q) => fn('lesen', q));
  if (examData?.horen?.questions) examData.horen.questions.forEach((q) => fn('horen', q));
};
ctx.goetheAnswersMatch = (user, correct) => user === correct;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/library/AnalyticsStore.js'), 'utf8'), ctx);
const AnalyticsStore = ctx.AnalyticsStore || ctx.window?.AnalyticsStore;

let passed = 0;
let failed = 0;

function assertOk(label, cond) {
  if (cond) {
    console.log('  ✅', label);
    passed += 1;
  } else {
    console.log('  ❌', label);
    failed += 1;
  }
}

function assertEq(label, a, b) {
  assertOk(label, a === b);
}

function formatTagLabel(tag) {
  const tail = String(tag)
    .replace(/^g-[^-]+-[^-]+-/, '')
    .replace(/^t-[^-]+-[^-]+-/, '');
  return tail.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

console.log('\n── P1: prompts include grammarCategory + grammarErrorSummary ──');
const schPrompt = writingCorrectionPrompt('de', 'B1', 60, 'full');
const batchPrompt = writingCorrectionSystem('de', 'B1', 60, 'full');
assertOk('single-task prompt has grammarCategory', schPrompt.includes('grammarCategory'));
assertOk('single-task prompt has grammarErrorSummary', schPrompt.includes('grammarErrorSummary'));
assertOk('single-task prompt lists passiv', schPrompt.includes('passiv'));
assertOk('single-task prompt lists wortstellung', schPrompt.includes('wortstellung'));
assertOk('batch prompt has grammarCategory', batchPrompt.includes('grammarCategory'));
assertOk('batch prompt has grammarErrorSummary', batchPrompt.includes('grammarErrorSummary'));

console.log('\n── P2: normalize sample Schreiben eval (Passiv + Wortstellung) ──');
const sampleRaw = {
  id: 'sch-t1',
  totalScore: 62,
  passed: true,
  rubric: { erfuellung: 18, kohaerenz: 16, wortschatz: 14, strukturen: 14 },
  correctedText: 'Das Haus wird gebaut. Deshalb fahre ich oft mit dem Bus.',
  errors: [
    {
      original: 'Man hat das Haus gebaut',
      correction: 'Das Haus wurde gebaut',
      type: 'grammar',
      grammarCategory: 'passiv',
      explanation: 'Passiv statt Aktiv für Berichtssprache.',
    },
    {
      original: 'Ich fahre oft mit dem Bus deshalb',
      correction: 'Deshalb fahre ich oft mit dem Bus',
      type: 'grammar',
      grammarCategory: 'wortstellung',
      explanation: 'Nachsatz-Konnektor „deshalb“ → Verb an Position 2.',
    },
    {
      original: 'gut',
      correction: 'gut',
      type: 'vocab',
      explanation: 'OK',
    },
  ],
  grammarErrorSummary: [
    { category: 'passiv', count: 1, severity: 'major' },
    { category: 'wortstellung', count: 1, severity: 'major' },
  ],
  summary: 'Zwei Grammatikfehler.',
  grammarPoints: [],
};

const normalized = normalizeSchreibenItem(sampleRaw, 60, 'full', 1);
assertOk('normalized has 3 errors', normalized?.errors?.length === 3);
assertEq('passiv error category', normalized?.errors?.[0]?.grammarCategory, 'passiv');
assertEq('wortstellung error category', normalized?.errors?.[1]?.grammarCategory, 'wortstellung');
assertOk('no grammarCategory on vocab error', normalized?.errors?.[2]?.grammarCategory == null);
assertEq('summary passiv count', normalized?.grammarErrorSummary?.find((r) => r.category === 'passiv')?.count, 1);
assertEq('summary wortstellung count', normalized?.grammarErrorSummary?.find((r) => r.category === 'wortstellung')?.count, 1);

console.log('\n── P3: additive schema — legacy fields preserved ──');
assertOk('correctedText preserved', normalized.correctedText.includes('wird gebaut'));
assertOk('totalScore preserved', normalized.totalScore === 62);
assertOk('rubric preserved', normalized.rubric?.erfuellung === 18);
assertOk('summary preserved', normalized.summary.includes('Grammatikfehler'));

console.log('\n── P4: AnalyticsStore merge → weak grammar tags ──');
const goal = { subject: 'de', level: 'B1', id: 'test-goal' };
const entry = {
  lang: 'de',
  level: 'B1',
  writingEvals: [normalized],
  speakingEvals: [],
  savedWords: [],
};
const examData = {
  lesen: {
    questions: [
      {
        id: 'q1',
        correct: 'A',
        grammarTags: ['g-de-b1-passiv'],
        explanation: 'x',
      },
      {
        id: 'q2',
        correct: 'B',
        grammarTags: ['g-de-b1-konjunktiv'],
        explanation: 'x',
      },
    ],
  },
};
const answers = { lesen_q1: 'B', lesen_q2: 'B' };

const storage = {};
ctx.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => {
    storage[k] = v;
  },
};

AnalyticsStore.recordExamResult(goal, entry, examData, answers);
AnalyticsStore.recordExamResult(goal, entry, examData, answers);

const summary = AnalyticsStore.getMasterySummary(goal, { minAttempts: 2 });
const weakTags = (summary.weakGrammar || []).map((r) => r.tag);
const weakLabels = weakTags.map(formatTagLabel);

assertOk('passiv tag in weak areas', weakTags.includes('g-de-b1-passiv'));
assertOk('wortstellung tag in weak areas', weakTags.includes('g-de-b1-wortstellung'));
assertOk('UI label Passiv', weakLabels.some((l) => /passiv/i.test(l)));
assertOk('UI label Wortstellung', weakLabels.some((l) => /wortstellung/i.test(l)));

const profile = AnalyticsStore.getProfile(goal);
assertEq('passiv total includes production+objective', profile.grammarTags['g-de-b1-passiv']?.total, 4);
assertEq('wortstellung total from production', profile.grammarTags['g-de-b1-wortstellung']?.total, 2);

console.log('\n── P5: Sprechen normalize (same schema) ──');
const spNorm = normalizeSprechenItem(
  {
    id: 'sp1',
    totalScore: 70,
    errors: [
      {
        original: 'Ich habe gestern gekauft ein Buch',
        correction: 'Ich habe gestern ein Buch gekauft',
        type: 'grammar',
        grammarCategory: 'wortstellung',
        explanation: 'TEKAMOLO',
      },
    ],
  },
  60,
  'full',
);
assertEq('sprechen wortstellung', spNorm?.errors?.[0]?.grammarCategory, 'wortstellung');
assertEq('sprechen summary category', spNorm?.grammarErrorSummary?.[0]?.category, 'wortstellung');

console.log('\n── P7: productionGrammar profile + drill re-eval ──');
AnalyticsStore.recordExamResult(goal, entry, examData, answers);
const prod = AnalyticsStore.getProductionGrammarOverview(goal, 6);
assertOk('production passiv row', prod.some((r) => r.category === 'passiv' && r.errors >= 1));
assertOk('production weak passiv', prod.some((r) => r.category === 'passiv' && r.weak));
AnalyticsStore.recordGrammarDrillResult(goal, 'passiv', 85);
const prod2 = AnalyticsStore.getProductionGrammarOverview(goal, 6);
const passivRow = prod2.find((r) => r.category === 'passiv');
assertOk('drill score stored', passivRow && passivRow.lastDrillScore === 85);
assertOk('passiv no longer weak after drill', passivRow && !passivRow.weak);

console.log('\n── P6: Personalizado Via B — design hook (not implemented) ──');
console.log(`  📋  In PromptBuilder.buildPersonalExamChunkPrompt(), after weak-tag lookup:
      const weakCat = AnalyticsStore.getWeakGrammarTags(spec.goal, 1)[0];
      // e.g. "g-de-b1-passiv" → "passiv"
      if (weakCat && /schreiben|sprechen/.test(modId)) {
        lines.push(\`Learner weakness focus: include a natural prompt angle that elicits \${formatTagLabel(weakCat)} (category \${weakCat}) — do not name the grammar rule explicitly.\`);
      }
      // Schreiben: model letter/email that rewards correct Passiv production
      // Sprechen: discussion topic where Konjunktiv II would be natural`);

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
