#!/usr/bin/env node
/**
 * Verifies ensureLesenT3Example via the same curated Official path (normalizeExam → sanitizeGoetheParts).
 * Run: node scripts/verify-t3-beispiel-official.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const curatedPath = path.join(
  ROOT,
  'library/curated/de/B1/curated_de_B1_4ef471830279.json',
);
const raw = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));
const examIn = structuredClone(raw.exam);
const t3Before = examIn.lesenParts.find((p) => Number(p.teil) === 3);
assert.ok(t3Before, 'fixture has lesen T3');
assert.ok(!t3Before.example && !t3Before.solvedExample, 'curated T3 starts without Beispiel');

// Minimal browser globals for examGeneration.js
const sandbox = {
  console,
  require,
  module: { exports: {} },
  exports: {},
  window: {},
  globalThis: {},
  S: { subject: 'de', level: 'B1' },
  setTimeout,
  clearTimeout,
  PersonalLesenPoolFallback: require('../js/engine/personalLesenPoolFallback.js'),
  AdsMatching: require('../js/library/adsMatching.js'),
  LesenPassageIntegrity: undefined,
  PartPostprocess: undefined,
  PersonalExamCoverage: undefined,
  QuestionLibrary: undefined,
  ManualVocab: undefined,
  ExamBlueprint: undefined,
  ExamRenumber: undefined,
  ExamRefill: undefined,
  VocabBatching: undefined,
  LcAnalytics: undefined,
  ChunkRunner: undefined,
  lcDebug: { log() {}, warn() {}, error() {} },
  lcToast() {},
  lcApiFetch: null,
  fetch: null,
  getActiveGoal: () => null,
  saveGoals() {},
  saveFC() {},
  hideAll() {},
  show() {},
  renderExam() {},
  goHome() {},
  normalizeSpanishExam: (d) => d,
  normalizeCambridgeExam: (d) => d,
  resolveExamLang: (d, fb) => d.lang || fb || 'de',
  sanitizeExamText: (t) => t,
  isLesenAdsMatchingPart: undefined,
  isLesenForumOpinionsPart: undefined,
  inferLesenT3HasNoMatch: undefined,
  normalizeGoetheQuestion: undefined,
  ensureLesenPartInstruction: () => {},
  coalesceLesenPartQuestions: () => {},
  coalesceHorenPartSegments: () => {},
  applyPersonalExamPostprocess: (d) => d,
  directPoolContribEnabled: () => false,
  lcStrategyBEnabled: () => false,
  isExamPoolOnly: () => true,
  isAllowLiveGenEnabled: () => false,
  isPersonalLesenHybridEnabled: () => false,
  canGenerate: () => true,
  getProfileFlashcards: () => [],
  certLbl: () => 'Goethe',
  aiAuthHeaders: () => ({}),
  deliverExamGeneration: async () => {},
  logAiGeneration: () => {},
  attachPersonalCoverage: () => {},
  showPersonalCoverageToast: () => {},
  examCopyForPoolIngest: (d) => d,
  lcExamPassesStructuralGate: () => false,
  contributeExamToPool: async () => {},
  contributeExamToStaging: async () => {},
  storePersonalGenRetry: () => {},
  personalModuleTeilsComplete: () => true,
  repairPersonalExamAnswerability: (d) => d,
  pruneBrokenExamParts: (d) => d,
  reconcileChunkMetaWithExam: () => {},
  fillMissingModuleTeileFromPool: async (d) => d,
  retryMissingPartsBeforePrune: async (d) => d,
  pruneEmptyGoetheParts: (d) => d,
  examHasUnanswerableQuestions: () => false,
  isExamRenderable: () => true,
  lcExamPassesValidator: () => true,
  lcVocabCoverage: () => ({ ratio: 1 }),
  lcExamHasPlaceholders: () => false,
  buildPoolExamCopy: (d) => d,
  saveExamToPool: async () => {},
  saveExamPartsToStaging: async () => {},
  applyPersonalTargetUsage: (d) => d,
  applyPersonalExamPostprocess: (d) => d,
  stripExamToSkills: (d) => d,
  normalizeMode: (m) => m,
  BurnedRegistry: undefined,
  QuestionLibrary: undefined,
  ExamLibrary: undefined,
  fetchExamFromPool: null,
  validateExamCandidate: null,
  setLoaderStep: () => {},
  lcExamPassesQualityGate: () => false,
  POOL_CONTRIBUTE_COVERAGE: 0.3,
  _examConfig: {},
  _MODULE_PART_KEY: {},
  orderedPersonalSkills: (s) => s,
  goethePartHasContent: (part, mod) =>
    mod === 'lesen' &&
    !!(part.items?.length || part.ads?.length || part.questions?.length),
  lesenT2PartIsValid: () => true,
  lesenTeil3IsUsable: () => true,
  lesenTeil4IsUsable: () => true,
  personalPartIsUsable: () => true,
  getPoolFallbackHelpers: () => require('../js/engine/personalLesenPoolFallback.js'),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const egPath = path.join(ROOT, 'js/ui/exam/examGeneration.js');
const egSrc = fs.readFileSync(egPath, 'utf8');
vm.runInNewContext(egSrc, sandbox, { filename: 'examGeneration.js' });

const normalizeExam = sandbox.normalizeExam || sandbox.window?.normalizeExam;
assert.equal(typeof normalizeExam, 'function', 'normalizeExam loaded');

const out = normalizeExam(structuredClone(examIn));
const t3 = out.lesenParts.find((p) => Number(p.teil) === 3);
assert.ok(t3?.example, 'T3 has example after normalizeExam');
assert.equal(String(t3.example.correct), '0', 'Beispiel correct is 0');
assert.match(String(t3.example.situation || ''), /Sprachkurs/i, 'Modellsatz Beispiel text');

// Existing example must not be overwritten
const withCustom = structuredClone(examIn);
const customT3 = withCustom.lesenParts.find((p) => Number(p.teil) === 3);
customT3.example = { number: 0, situation: 'Custom Beispiel Situation', correct: '0' };
const out2 = normalizeExam(withCustom);
const t3custom = out2.lesenParts.find((p) => Number(p.teil) === 3);
assert.match(String(t3custom.example.situation || ''), /Custom Beispiel/, 'preserves existing example');

// Renderer snippet (examRunner.js logic)
const ex = t3.example || t3.solvedExample;
const renderBlock =
  ex && (ex.situation || ex.question || ex.text)
    ? `Beispiel ${ex.number ?? ''} … Lösung: 0`
    : null;
assert.ok(renderBlock, 'examRunner would render Beispiel block');

console.log('✓ curated Official T3 gains Beispiel via sanitizeGoetheParts');
console.log('✓ existing example preserved when present');
console.log('✓ render preview:', renderBlock.slice(0, 60) + '…');
