/**
 * PASO 13 P0-2 — feedback promotion workflow tests.
 *   node scripts/lib/__tests__/generationFeedbackPaso13.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const storeLib = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackStore.js'));
const resolver = require(path.join(ROOT, 'netlify/functions/lib/generationFeedbackResolver.js'));
const extract = require(path.join(ROOT, 'netlify/functions/lib/extractLearningFromCorrection.js'));
const gate = require(path.join(ROOT, 'netlify/functions/lib/validateGenerationFeedbackRule.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key, opts) {
      if (!map.has(key)) return null;
      const v = map.get(key);
      return opts?.type === 'json' ? JSON.parse(v) : v;
    },
    async setJSON(key, val) {
      map.set(key, JSON.stringify(val));
    },
    async set(key, val) {
      map.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
  };
}

const goodRule = {
  type: 'naturalness',
  category: 'naturalness',
  severity: 'medium',
  reason: 'Unnatural use of eintreten for programs',
  rule: 'Avoid using eintreten for introducing programs or projects; prefer einführen / eingeführt werden.',
  wrong: 'Ein neues Programm ist in Berlin eingetreten',
  correct: 'Ein neues Programm wurde in Berlin eingeführt',
  avoid: 'Ein neues Programm ist in Berlin eingetreten',
  preferred: 'Ein neues Programm wurde in Berlin eingeführt',
  evidence: ['lesen-t2-gemini-055'],
  examples: [
    {
      avoid: 'Ein neues Programm ist in Berlin eingetreten',
      prefer: 'Ein neues Programm wurde in Berlin eingeführt',
    },
  ],
  sourceCorrection: 'cc-test-1',
  module: 'lesen',
  teil: 2,
  level: 'B1',
};

// 1) candidate does not reach prompt
{
  const store = memoryStore();
  const created = await storeLib.createFeedback(store, goodRule, { email: 'a@test' });
  assert(created.ok && created.feedback.status === 'candidate', 'created candidate');
  const resolved = await resolver.getActiveGenerationFeedback(store, { module: 'lesen' });
  assert(resolved.ok, 'resolve ok');
  assert(resolved.rules.length === 0, 'candidate not in prompt rules');
  const appended = resolver.appendGenerationFeedback('BASE PROMPT', [], {
    feedbackMode: 'active',
  });
  // with empty rules from store path:
  const withStore = await resolver.getActiveGenerationFeedback(store, {});
  const block = resolver.appendGenerationFeedback('BASE', {
    rules: withStore.rules,
    feedbackMode: 'active',
  });
  assert(block.prompt === 'BASE' || !block.usedFeedback, 'candidate does not alter usedFeedback');
  assert((block.generationMetadata.feedbackRules || []).length === 0, 'no feedbackRules stamped');
}

// 2) approved does not reach prompt
{
  const store = memoryStore();
  const created = await storeLib.createFeedback(store, goodRule, { email: 'a@test' });
  const ap = await storeLib.approveFeedback(store, created.feedback.id, { email: 'a@test' });
  assert(ap.ok && ap.feedback.status === 'approved', 'approved');
  const resolved = await resolver.getActiveGenerationFeedback(store, { module: 'lesen' });
  assert(resolved.rules.length === 0, 'approved not in prompt');
  assert(
    resolver.GENERATION_STATUSES.length === 1 && resolver.GENERATION_STATUSES[0] === 'active',
    'GENERATION_STATUSES active-only',
  );
}

// 3) active does reach prompt
{
  const store = memoryStore();
  const created = await storeLib.createFeedback(store, goodRule, { email: 'a@test' });
  await storeLib.approveFeedback(store, created.feedback.id, { email: 'a@test' });
  const act = await storeLib.activateFeedback(store, created.feedback.id, { email: 'a@test' });
  assert(act.ok && act.feedback.status === 'active', 'activated');
  assert(act.feedback.activatedAt && act.feedback.activatedBy === 'a@test', 'activation meta');
  const resolved = await resolver.getActiveGenerationFeedback(store, { module: 'lesen' });
  assert(resolved.rules.length === 1, 'active in prompt');
  assert(resolved.rules[0].id === created.feedback.id, 'rule id');
  const block = resolver.appendGenerationFeedback('BASE PROMPT', {
    rules: resolved.rules,
    feedbackMode: 'active',
  });
  assert(block.usedFeedback === true, 'usedFeedback');
  assert(block.generationMetadata.feedbackRules.includes(created.feedback.id), 'metadata rules');
  assert(block.generationMetadata.feedbackCount >= 1, 'feedbackCount');
  assert(block.prompt.includes('BASE PROMPT') && block.prompt.length > 'BASE PROMPT'.length, 'prompt appended');
}

// 4) invalid rule cannot activate
{
  const store = memoryStore();
  const created = await storeLib.createFeedback(
    store,
    { ...goodRule, rule: '' },
    { email: 'a@test' },
  );
  await storeLib.approveFeedback(store, created.feedback.id, { email: 'a@test' });
  const act = await storeLib.activateFeedback(store, created.feedback.id, {
    email: 'a@test',
    patch: { rule: 'short' },
  });
  assert(!act.ok && act.error === 'activation_rejected', 'short rule rejected');
  assert(act.reasons.includes('missing_or_short_rule'), 'reason missing_or_short_rule');
}

// 5) legacy record without rule still listable / editable; cannot activate until rule set
{
  const store = memoryStore();
  const legacy = {
    id: 'gf-legacy',
    type: 'naturalness',
    status: 'candidate',
    reason: 'legacy naturalness fix from old pipeline',
    wrong: 'X ist eingetreten',
    correct: 'X wurde eingeführt',
    avoid: 'X ist eingetreten',
    preferred: 'X wurde eingeführt',
    sourceCorrection: 'cc-legacy',
    module: 'lesen',
    teil: 1,
    createdAt: new Date().toISOString(),
    // no rule, no category
  };
  await storeLib.saveFeedback(store, legacy);
  const listed = await storeLib.listFeedback(store, { status: 'candidate' });
  assert(listed.feedback.some((f) => f.id === 'gf-legacy'), 'legacy listed');
  await storeLib.approveFeedback(store, 'gf-legacy', { email: 'a@test' });
  const fail = await storeLib.activateFeedback(store, 'gf-legacy', { email: 'a@test' });
  assert(!fail.ok, 'legacy without rule cannot activate');
  const ok = await storeLib.activateFeedback(store, 'gf-legacy', {
    email: 'a@test',
    patch: {
      rule: 'Avoid eintreten for introducing programs; prefer einführen.',
      category: 'naturalness',
      evidence: ['lesen-legacy'],
    },
  });
  assert(ok.ok && ok.feedback.status === 'active', 'legacy activatable after rule edit');
  // resolver must not crash on legacy-shaped active with rule
  const resolved = await resolver.getActiveGenerationFeedback(store, {});
  assert(resolved.ok && resolved.rules.some((r) => r.id === 'gf-legacy'), 'legacy active resolves');
}

// 6) typo / case-only never become active feedback
{
  const typoCorr = {
    id: 'cc-typo',
    reason: 'typo',
    fieldPath: 'text',
    oldValue: 'vergisen',
    newValue: 'vergessen',
    module: 'lesen',
    teil: 1,
    sourceFile: 'lesen-t1-x',
  };
  const extracted = extract.extractLearningFromCorrection(typoCorr);
  assert(extracted.reusable === false && extracted.kind === 'typo', 'typo not reusable');

  const store = memoryStore();
  // Force-create typo type (should not activate)
  const bad = await storeLib.createFeedback(
    store,
    {
      type: 'typo',
      reason: 'typo fix',
      rule: 'Always fix typos in German words carefully here',
      wrong: 'vergisen',
      correct: 'vergessen',
      sourceCorrection: 'cc-typo',
      evidence: ['x'],
      examples: [{ avoid: 'vergisen', prefer: 'vergessen' }],
    },
    { email: 'a@test' },
  );
  // typo category may fail schema category — createFeedback uses type typo
  if (bad.ok) {
    await storeLib.approveFeedback(store, bad.feedback.id, { email: 'a@test' });
    const act = await storeLib.activateFeedback(store, bad.feedback.id, { email: 'a@test' });
    assert(!act.ok, 'typo cannot activate');
  }

  const caseOnly = gate.validateGenerationFeedbackRule({
    type: 'grammar_rule',
    category: 'grammar',
    reason: 'fix letter',
    rule: 'Prefer the noun form in this isolated edit without pedagogical context',
    wrong: 'glaube',
    correct: 'Glaube',
    avoid: 'glaube',
    use: 'Glaube',
    sourceCorrection: 'cc-case',
    evidence: ['y'],
    examples: [{ avoid: 'glaube', prefer: 'Glaube' }],
  });
  assert(caseOnly.accepted === false, 'case-only rejected by gate');
  assert(caseOnly.reasons.includes('case_only_not_activatable'), 'case_only reason');
}

// 7) generic updateFeedback cannot set status
{
  const store = memoryStore();
  const created = await storeLib.createFeedback(store, goodRule, { email: 'a@test' });
  const r = await storeLib.updateFeedback(store, created.feedback.id, { status: 'active' }, { email: 'a@test' });
  assert(!r.ok && r.error === 'status_via_promote_only', 'no status via PATCH');
}

// 8) metrics counts
{
  const store = memoryStore();
  await storeLib.createFeedback(store, goodRule, { email: 'a@test' });
  const listed = await storeLib.listFeedback(store, { status: 'all' });
  const m = storeLib.feedbackMetrics(listed.counts);
  assert(m.candidate_count >= 1, 'candidate_count');
  assert(typeof m.active_count === 'number', 'active_count');
}

console.log('generationFeedbackPaso13 tests passed.');
