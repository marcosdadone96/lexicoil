/**
 * PASO 8 — feedback quality gate, modes, audit.
 *   node scripts/lib/__tests__/generationFeedbackPaso8.test.mjs
 */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { buildLesenPrompt, pickTargetWords } from '../lesenTemplatePrompt.mjs';
import {
  appendGenerationFeedback,
  resolveFeedbackMode,
} from '../resolveGenerationFeedback.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { validateGenerationFeedbackRule } = require(
  path.join(ROOT, 'netlify/functions/lib/validateGenerationFeedbackRule.js'),
);
const { auditGenerationFeedbackStore } = require(
  path.join(ROOT, 'netlify/functions/lib/auditGenerationFeedback.js'),
);
const storeLib = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, val) {
      map.set(key, val);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

const prevEnabled = process.env.GENERATION_FEEDBACK_ENABLED;
const prevMode = process.env.GENERATION_FEEDBACK_MODE;
delete process.env.GENERATION_FEEDBACK_ENABLED;
delete process.env.GENERATION_FEEDBACK_MODE;

// ── validateGenerationFeedbackRule ────────────────────────────────────────
{
  const good = validateGenerationFeedbackRule({
    type: 'naturalness',
    reason: 'Avoid translating Spanish structures literally into German',
    avoid: 'Konsum von Mobilität',
    preferred: 'Nutzung von Verkehrsmitteln',
    sourceCorrection: 'cc-1',
  });
  assert(good.accepted === true, 'good naturalness accepted');
  assert(good.category === 'naturalness', 'category naturalness');

  const badHaus = validateGenerationFeedbackRule({
    type: 'lexical_preference',
    reason: 'No usar palabra Haus',
    avoid: 'Haus',
  });
  assert(badHaus.accepted === false, 'Haus ban rejected');
  assert(badHaus.reasons.some((r) => /over_narrow|insufficient|missing/.test(r)), 'Haus reasons');

  const badPerfekt = validateGenerationFeedbackRule({
    type: 'grammar_rule',
    reason: 'Evitar siempre Perfekt',
    avoid: 'Perfekt',
    pattern: 'never use Perfekt',
    sourceCorrection: 'cc-x',
  });
  assert(badPerfekt.accepted === false, 'Perfekt ban rejected');

  const typo = validateGenerationFeedbackRule({
    type: 'typo',
    reason: 'typo fix',
    wrong: 'vergisen',
    correct: 'vergessen',
    sourceCorrection: 'cc-t',
  });
  assert(typo.accepted === false, 'typo not activatable');
}

// ── feedbackMode off / preview / active ───────────────────────────────────
{
  const rule = {
    id: 'gf-mode-1',
    type: 'naturalness',
    rule: 'Avoid artificial newspaper phrases.',
    avoid: 'Ein Bericht zeigt',
    prefer: 'natural opening',
    priority: 'high',
    status: 'active',
  };

  assert(resolveFeedbackMode({}) === 'off', 'default off');

  const off = appendGenerationFeedback('BASE', { rules: [rule], feedbackMode: 'off' });
  assert(off.prompt === 'BASE', 'off unchanged');
  assert(off.generationMetadata.feedbackMode === 'off', 'off mode meta');
  assert(off.generationMetadata.usedFeedback === false, 'off not used');

  const preview = appendGenerationFeedback('BASE', { rules: [rule], feedbackMode: 'preview' });
  assert(/QUALITY RULES/.test(preview.prompt), 'preview has block');
  assert(preview.generationMetadata.usedFeedback === false, 'preview usedFeedback false');
  assert((preview.generationMetadata.feedbackRules || []).length === 0, 'preview no applied ids');
  assert(preview.generationMetadata.feedbackMode === 'preview', 'preview mode');

  const active = appendGenerationFeedback('BASE', { rules: [rule], feedbackMode: 'active' });
  assert(/QUALITY RULES/.test(active.prompt), 'active has block');
  assert(active.generationMetadata.usedFeedback === true, 'active used');
  assert(active.generationMetadata.feedbackCount >= 1, 'active count');
  assert(active.generationMetadata.feedbackCategories.includes('naturalness'), 'active categories');
  assert(active.generationMetadata.feedbackRules.includes('gf-mode-1'), 'active ids');
}

// ── builder metadata with active ──────────────────────────────────────────
{
  const words = pickTargetWords(6, { lang: 'de', level: 'B1' });
  const meta = {};
  const prompt = buildLesenPrompt(1, words, {
    idSuffix: 'p8',
    feedbackMode: 'active',
    feedbackRules: [
      {
        id: 'gf-p8',
        type: 'grammar',
        rule: 'Use correct verb-preposition combinations.',
        priority: 'high',
        status: 'active',
      },
    ],
    feedbackMetaOut: meta,
  });
  assert(/QUALITY RULES/.test(prompt), 'builder active block');
  assert(meta.usedFeedback === true && meta.feedbackCount >= 1, 'builder meta count');
  assert(Array.isArray(meta.feedbackCategories), 'builder categories');
}

// ── audit store ───────────────────────────────────────────────────────────
{
  const store = memoryStore();
  const a = await storeLib.createFeedback(store, {
    type: 'naturalness',
    reason: 'Avoid translating Spanish structures literally',
    avoid: 'Konsum von Mobilität',
    preferred: 'Nutzung von Verkehrsmitteln',
    module: 'lesen',
    level: 'B1',
    sourceCorrection: 'cc-a',
  });
  await storeLib.saveFeedback(store, { ...a.feedback, status: 'active' });
  const b = await storeLib.createFeedback(store, {
    type: 'lexical_preference',
    reason: 'ban Haus',
    avoid: 'Haus',
    module: 'lesen',
    level: 'B1',
  });
  await storeLib.saveFeedback(store, { ...b.feedback, status: 'active' });
  await storeLib.createFeedback(store, {
    type: 'typo',
    reason: 'typo',
    wrong: 'x',
    correct: 'y',
    module: 'lesen',
    level: 'B1',
  });

  const audit = await auditGenerationFeedbackStore(store);
  assert(audit.ok && audit.total === 3, 'audit total');
  assert(audit.byStatus.active === 2, 'audit active count');
  assert(audit.byCategory.naturalness >= 1, 'audit naturalness');
  assert(audit.byCategory.typo >= 1, 'audit typo');
  assert(audit.tooSpecific.length >= 1, 'audit too specific');
  assert(audit.qualityGate.rejected >= 1, 'audit gate rejects');
}

// restore env
if (prevEnabled === undefined) delete process.env.GENERATION_FEEDBACK_ENABLED;
else process.env.GENERATION_FEEDBACK_ENABLED = prevEnabled;
if (prevMode === undefined) delete process.env.GENERATION_FEEDBACK_MODE;
else process.env.GENERATION_FEEDBACK_MODE = prevMode;

console.log('generationFeedbackPaso8 tests passed.');
