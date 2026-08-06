/**
 * PASO 6 — generation feedback resolver / preview tests.
 *   node scripts/lib/__tests__/generationFeedbackResolver.test.mjs
 */
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const resolver = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));
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

const store = memoryStore();

async function seedActive(input) {
  const created = await storeLib.createFeedback(store, { ...input, status: 'candidate' }, { email: 'test' });
  assert(created.ok, 'seed create ' + (input.reason || input.type));
  const rec = { ...created.feedback, status: 'active', activatedAt: new Date().toISOString(), activatedBy: 'test' };
  await storeLib.saveFeedback(store, rec);
  return { ok: true, feedback: rec };
}

// Seed — createFeedback always starts as candidate; force active via saveFeedback for fixtures
const activeNat = await seedActive({
  type: 'naturalness',
  reason: 'Avoid artificial AI phrases',
  avoid: 'Ein Bericht zeigt',
  preferred: 'natural B1 opening',
  module: 'lesen',
  level: 'B1',
  context: 'Umwelt / Zeitung',
  rule: 'Avoid artificial AI newspaper openings like Ein Bericht zeigt.',
});
assert(activeNat.ok, 'seed active naturalness');

const approvedLex = await storeLib.createFeedback(store, {
  type: 'lexical_preference',
  reason: 'Prefer einführen',
  avoid: 'eingetreten bei einem Programm',
  use: 'eingeführt',
  module: 'lesen',
  level: 'B1',
  rule: 'Prefer einführen over eintreten for programs.',
});
assert(approvedLex.ok, 'seed approved lexical');
await storeLib.approveFeedback(store, approvedLex.feedback.id, { email: 'test' });

const candidate = await storeLib.createFeedback(store, {
  type: 'grammar_rule',
  reason: 'verbs after pronouns lowercase',
  pattern: 'verbs after pronouns lowercase',
  module: 'lesen',
  level: 'B1',
});
assert(candidate.ok, 'seed candidate');

const typoActive = await seedActive({
  type: 'typo',
  reason: 'typo vergisen',
  wrong: 'vergisen',
  correct: 'vergessen',
  module: 'lesen',
  level: 'B1',
});
assert(typoActive.ok, 'seed typo');

const horenOnly = await seedActive({
  type: 'naturalness',
  reason: 'Hören speech naturalness',
  avoid: 'lautsprechertechnisch',
  preferred: 'einfache Hörsprache',
  module: 'horen',
  level: 'B1',
  rule: 'Prefer simple listening language over lautsprechertechnisch.',
});
assert(horenOnly.ok, 'seed horen');

const narrowBan = await seedActive({
  type: 'lexical_preference',
  reason: 'ban Haus',
  avoid: 'Haus',
  module: 'lesen',
  level: 'B1',
});
assert(narrowBan.ok, 'seed narrow');

const dupA = await storeLib.createFeedback(store, {
  type: 'naturalness',
  reason: 'Avoid artificial AI phrases',
  avoid: 'Ein Bericht zeigt',
  preferred: 'natural B1 opening',
  module: 'lesen',
  level: 'B1',
  rule: 'Avoid artificial AI phrases duplicate approved.',
});
assert(dupA.ok, 'seed duplicate approved');
await storeLib.approveFeedback(store, dupA.feedback.id, { email: 'test' });

// ── Caso 1: active → aparece; approved NO ─────────────────────────────────
const c1 = await resolver.getActiveGenerationFeedback(store, {
  level: 'B1',
  module: 'lesen',
  topic: 'Umwelt',
});
assert(c1.ok, 'c1 ok');
assert(
  c1.rules.some((r) => r.avoid && r.avoid.includes('Bericht')),
  'c1 active naturalness present',
);
assert(
  !c1.rules.some((r) => r.prefer === 'eingeführt' || (r.avoid && r.avoid.includes('eingetreten'))),
  'c1 approved lexical excluded (active-only)',
);

const ctx1 = resolver.buildGenerationFeedbackContext(c1.rules);
assert(!ctx1.empty && /QUALITY RULES FROM PREVIOUS REVIEWS/.test(ctx1.block), 'c1 context block');

// ── Caso 2: solo candidate → no aparece ───────────────────────────────────
const onlyCandidate = await resolver.getActiveGenerationFeedback(store, {
  feedback: [candidate.feedback],
  module: 'lesen',
  level: 'B1',
});
assert(onlyCandidate.rules.length === 0, 'c2 candidate excluded');
assert(
  onlyCandidate.skipped.some((s) => s.reason === 'status_candidate'),
  'c2 skipped as candidate',
);

// ── Caso 3: Hören no aparece en Lesen ─────────────────────────────────────
assert(
  !c1.rules.some((r) => (r.avoid || '').includes('lautsprecher')),
  'c3 horen filtered out of lesen',
);
const c3h = await resolver.getActiveGenerationFeedback(store, { module: 'horen', level: 'B1' });
assert(
  c3h.rules.some((r) => (r.avoid || '').includes('lautsprecher')),
  'c3 horen visible for horen',
);

// ── Caso 4: typo no genera regla ──────────────────────────────────────────
assert(!c1.rules.some((r) => r.type === 'typo'), 'c4 no typo rules');
assert(
  c1.skipped.some((s) => s.id === typoActive.feedback.id && s.reason === 'typo_excluded'),
  'c4 typo skipped',
);

// ── Caso 5: deduplicación ─────────────────────────────────────────────────
const berichtRules = c1.rules.filter((r) => (r.avoid || '').includes('Bericht'));
assert(berichtRules.length === 1, 'c5 duplicate Bericht collapsed to 1');
assert(berichtRules[0].status === 'active', 'c5 prefer active over approved');

// Narrow single-word ban excluded
assert(
  !c1.rules.some((r) => r.avoid === 'Haus'),
  'c5b over-narrow Haus excluded',
);

// ── Caso 6: sin feedback → generación igual ───────────────────────────────
const emptyStore = memoryStore();
const c6 = await resolver.getActiveGenerationFeedback(emptyStore, { module: 'lesen', level: 'B1' });
assert(c6.ok && c6.rules.length === 0, 'c6 empty rules');
const base = 'Generate a Goethe B1 Lesen passage about Umwelt.';
const previewEmpty = await resolver.generationFeedbackPreview({
  basePrompt: base,
  store: emptyStore,
  query: { module: 'lesen', level: 'B1' },
});
assert(previewEmpty.ok, 'c6 preview ok');
assert(previewEmpty.finalPromptPreview === base, 'c6 final equals base when no feedback');
assert(previewEmpty.feedbackBlock === '', 'c6 empty block');

// Preview with feedback appends separately
const preview = await resolver.generationFeedbackPreview({
  basePrompt: base,
  store,
  query: { module: 'lesen', level: 'B1', topic: 'Umwelt' },
});
assert(preview.ok && preview.ruleCount > 0, 'preview has rules');
assert(preview.finalPromptPreview.startsWith(base), 'preview keeps base prefix');
assert(/Additional quality constraints|QUALITY RULES/.test(preview.finalPromptPreview), 'preview has block');
assert(/BASE PROMPT:/.test(preview.report) && /ACTIVE FEEDBACK:/.test(preview.report), 'report sections');

// Safety unit checks
assert(resolver.isSafeForGeneration({ type: 'typo', reason: 'x', wrong: 'a', correct: 'b' }).ok === false, 'safe typo');
assert(
  resolver.isSafeForGeneration({
    type: 'naturalness',
    reason: 'Avoid translating Spanish structures literally',
    avoid: 'Konsum von Mobilität',
    preferred: 'Nutzung von Verkehrsmitteln',
  }).ok === true,
  'safe naturalness',
);

console.log('generationFeedbackResolver tests passed.');
