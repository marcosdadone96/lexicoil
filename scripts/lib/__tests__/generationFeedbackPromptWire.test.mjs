/**
 * PASO 7 — wire generation feedback into prompt builders.
 *   node scripts/lib/__tests__/generationFeedbackPromptWire.test.mjs
 */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { buildLesenPrompt, pickTargetWords } from '../lesenTemplatePrompt.mjs';
import { buildExamPrompt } from '../examTemplatePrompt.mjs';
import {
  appendGenerationFeedback,
  selectRulesForPrompt,
  isGenerationFeedbackEnabled,
} from '../resolveGenerationFeedback.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const resolver = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const prevFlag = process.env.GENERATION_FEEDBACK_ENABLED;
delete process.env.GENERATION_FEEDBACK_ENABLED;

const words = pickTargetWords(8, { lang: 'de', level: 'B1' });

function makeRule(partial) {
  return {
    id: partial.id || `gf-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type || 'naturalness',
    rule: partial.rule || 'Avoid artificial phrases',
    avoid: partial.avoid,
    prefer: partial.prefer,
    priority: partial.priority || 'high',
    status: partial.status || 'active',
    module: partial.module || 'lesen',
    level: partial.level || 'B1',
    reason: partial.reason || 'test rule',
  };
}

// ── Caso 5 first: flag false → unchanged ──────────────────────────────────
{
  delete process.env.GENERATION_FEEDBACK_ENABLED;
  const base = buildLesenPrompt(1, words, { idSuffix: 'testflag' });
  const withRules = buildLesenPrompt(1, words, {
    idSuffix: 'testflag',
    feedbackRules: [makeRule({ avoid: 'Ein Bericht zeigt', prefer: 'natural opening' })],
  });
  assert(base === withRules, 'c5 flag off → prompt identical even with rules');
  assert(!/QUALITY RULES FROM PREVIOUS REVIEWS/.test(withRules), 'c5 no quality block');
}

// ── Caso 1: feedback activo + flag on ─────────────────────────────────────
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const meta = {};
  const prompt = buildLesenPrompt(1, words, {
    idSuffix: 'test1',
    topicTag: 'Umwelt',
    feedbackRules: [
      makeRule({
        id: 'gf-active-1',
        type: 'naturalness',
        avoid: 'Ein Bericht zeigt',
        prefer: 'natural B1 opening',
        rule: 'Avoid artificial newspaper phrases.',
        status: 'active',
        priority: 'high',
      }),
      makeRule({
        id: 'gf-active-2',
        type: 'lexical',
        avoid: 'eingetreten bei einem Programm',
        prefer: 'eingeführt',
        rule: 'Prefer natural B1 German collocations.',
        status: 'approved',
        priority: 'medium',
      }),
    ],
    feedbackMetaOut: meta,
  });
  assert(/QUALITY RULES FROM PREVIOUS REVIEWS/.test(prompt), 'c1 has QUALITY RULES');
  assert(/Avoid artificial newspaper phrases/.test(prompt), 'c1 has rule text');
  assert(meta.usedFeedback === true, 'c1 meta usedFeedback');
  assert(meta.feedbackRulesApplied === 2, 'c1 feedbackRulesApplied');
  assert(Array.isArray(meta.feedbackRules) && meta.feedbackRules.includes('gf-active-1'), 'c1 ids');
  assert(meta.feedbackVersion === 'v1', 'c1 version');
}

// ── Caso 2: sin feedback → idéntico ───────────────────────────────────────
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const a = buildLesenPrompt(1, words, { idSuffix: 'same', feedbackRules: [] });
  const b = buildLesenPrompt(1, words, { idSuffix: 'same' });
  assert(a === b, 'c2 empty rules → identical');
  assert(!/QUALITY RULES FROM PREVIOUS REVIEWS/.test(a), 'c2 no block');
}

// ── Caso 3: Hören rules no aparecen en Lesen (filter at resolve; builder uses prefiltered) ─
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const horenRule = makeRule({
    id: 'gf-horen',
    module: 'horen',
    avoid: 'lautsprechertechnisch',
    prefer: 'einfache Hörsprache',
  });
  // Builder trusts caller-supplied feedbackRules (already filtered by resolve).
  // Simulate resolve filter:
  const resolved = await resolver.getActiveGenerationFeedback(null, {
    module: 'lesen',
    level: 'B1',
    feedback: [
      {
        id: 'gf-horen',
        type: 'naturalness',
        status: 'active',
        reason: 'Hören speech',
        avoid: 'lautsprechertechnisch',
        preferred: 'einfache Hörsprache',
        module: 'horen',
        level: 'B1',
      },
      {
        id: 'gf-lesen',
        type: 'naturalness',
        status: 'active',
        reason: 'Lesen naturalness',
        avoid: 'Ein Bericht zeigt',
        preferred: 'natural opening',
        module: 'lesen',
        level: 'B1',
      },
    ],
  });
  assert(!resolved.rules.some((r) => (r.avoid || '').includes('lautsprecher')), 'c3 horen filtered');
  assert(resolved.rules.some((r) => (r.avoid || '').includes('Bericht')), 'c3 lesen kept');

  const lesenPrompt = buildLesenPrompt(1, words, {
    idSuffix: 'c3',
    feedbackRules: resolved.rules,
  });
  assert(!/lautsprechertechnisch/.test(lesenPrompt), 'c3 not in lesen prompt');
  assert(/QUALITY RULES/.test(lesenPrompt), 'c3 lesen still has block');

  const examMeta = {};
  const horenPrompt = buildExamPrompt('horen', 1, words, {
    idSuffix: 'c3h',
    feedbackRules: [
      makeRule({
        id: 'gf-horen-2',
        module: 'horen',
        avoid: 'lautsprechertechnisch',
        prefer: 'einfache Hörsprache',
        rule: 'Keep spoken Hören language simple.',
      }),
    ],
    feedbackMetaOut: examMeta,
  });
  assert(/lautsprechertechnisch|Keep spoken Hören/.test(horenPrompt), 'c3 horen prompt has rule');
  assert(examMeta.usedFeedback === true, 'c3 exam meta');
}

// ── Caso 4: 10 reglas → solo prioritarias (cap) ───────────────────────────
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const many = [];
  for (let i = 0; i < 4; i++) {
    many.push(makeRule({ id: `gf-ah-${i}`, status: 'active', priority: 'high', rule: `AH${i}` }));
  }
  for (let i = 0; i < 3; i++) {
    many.push(makeRule({ id: `gf-am-${i}`, status: 'active', priority: 'medium', rule: `AM${i}` }));
  }
  for (let i = 0; i < 3; i++) {
    many.push(makeRule({ id: `gf-low-${i}`, status: 'approved', priority: 'low', rule: `LOW${i}` }));
  }
  const selected = selectRulesForPrompt(many, { maxRules: 5 });
  assert(selected.length === 5, 'c4 capped at 5');
  assert(selected.every((r) => r.priority !== 'low' || selected.filter((x) => x.priority === 'low').length === 0), 'c4 prefer non-low');
  // With 4 high + 3 medium, first 5 should be high/medium only
  assert(selected.every((r) => r.priority === 'high' || r.priority === 'medium'), 'c4 no low when enough higher');

  const meta = {};
  const prompt = buildLesenPrompt(1, words, {
    idSuffix: 'c4',
    feedbackRules: many,
    maxFeedbackRules: 5,
    feedbackMetaOut: meta,
  });
  assert(meta.feedbackRulesApplied === 5, 'c4 applied count 5');
  assert(/AH0/.test(prompt) && !/LOW0/.test(prompt), 'c4 highs present, lows dropped');
}

// ── Caso 6: metadata usedFeedback ─────────────────────────────────────────
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const meta = {};
  buildLesenPrompt(1, words, {
    idSuffix: 'c6',
    feedbackRules: [makeRule({ id: 'gf-meta', rule: 'Use correct verb-preposition combinations.' })],
    feedbackMetaOut: meta,
  });
  assert(meta.usedFeedback === true, 'c6 usedFeedback true');
  assert(meta.feedbackRules.includes('gf-meta'), 'c6 rule id');
  assert(meta.feedbackVersion === 'v1', 'c6 version');

  const emptyMeta = {};
  buildLesenPrompt(1, words, { idSuffix: 'c6b', feedbackRules: [], feedbackMetaOut: emptyMeta });
  assert(emptyMeta.usedFeedback === false, 'c6 empty usedFeedback false');
}

// appendGenerationFeedback unit
{
  process.env.GENERATION_FEEDBACK_ENABLED = 'true';
  const r = appendGenerationFeedback('BASE PROMPT HERE', {
    rules: [makeRule({ rule: 'Prefer natural B1 German collocations.' })],
  });
  assert(r.prompt.startsWith('BASE PROMPT HERE'), 'append keeps base');
  assert(r.usedFeedback && r.feedbackRulesApplied === 1, 'append counts');
}

// restore env
if (prevFlag === undefined) delete process.env.GENERATION_FEEDBACK_ENABLED;
else process.env.GENERATION_FEEDBACK_ENABLED = prevFlag;

assert(isGenerationFeedbackEnabled(false) === false, 'explicit false');
assert(isGenerationFeedbackEnabled(true) === true, 'explicit true');

console.log('generationFeedbackPromptWire tests passed.');
