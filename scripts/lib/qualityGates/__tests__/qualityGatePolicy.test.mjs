/**
 * PASO 10 — policy + canPromotePart + qualityMetadata tests.
 *   node scripts/lib/qualityGates/__tests__/qualityGatePolicy.test.mjs
 */
import { canPromotePart, buildQualityMetadata, loadQualityGatePolicy } from '../qualityGatePolicy.mjs';
import { runQualityGates } from '../qualityGateRunner.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const failReport = {
  status: 'FAIL',
  stagingStatus: 'rejected',
  summary: { errors: 2, warnings: 0 },
  gates: [{ name: 'json_integrity', status: 'FAIL', errors: ['x'] }],
  generatedAt: new Date().toISOString(),
};

const warnReport = {
  status: 'WARNING',
  stagingStatus: 'needs_review',
  summary: { errors: 0, warnings: 2 },
  gates: [{ name: 'cefr', status: 'WARNING', errors: ['occasional_b2'] }],
  generatedAt: new Date().toISOString(),
};

const passReport = {
  status: 'PASS',
  stagingStatus: 'candidate_ready',
  summary: { errors: 0, warnings: 0 },
  gates: [{ name: 'json_integrity', status: 'PASS', errors: [] }],
  generatedAt: new Date().toISOString(),
};

// Caso 1 — advisory: FAIL no bloquea
{
  const r = canPromotePart(failReport, { mode: 'advisory' });
  assert(r.allowed === true, 'c1 advisory allows FAIL');
  assert(r.mode === 'advisory', 'c1 mode');
}

// Caso 2 — review: WARNING bloquea
{
  const r = canPromotePart(warnReport, { mode: 'review' });
  assert(r.allowed === false, 'c2 review blocks WARNING');
  assert(r.reason.includes('warning_requires_human_review'), 'c2 reason');
  const reviewed = canPromotePart(warnReport, { mode: 'review', manualReviewed: true });
  assert(reviewed.allowed === true, 'c2 manual review allows');
}

// Caso 3 — enforced: FAIL bloquea
{
  const r = canPromotePart(failReport, { mode: 'enforced' });
  assert(r.allowed === false, 'c3 enforced blocks FAIL');
  assert(r.reason.includes('fail_blocks_in_enforced_mode'), 'c3 reason');
}

// Caso 4 — PASS permite
{
  for (const mode of ['advisory', 'review', 'enforced']) {
    const r = canPromotePart(passReport, { mode });
    assert(r.allowed === true, `c4 PASS allowed in ${mode}`);
  }
}

// Caso 5 — qualityMetadata se guarda correctamente
{
  const meta = buildQualityMetadata(warnReport, { checkedBy: 'test', policyMode: 'advisory' });
  assert(meta.status === 'WARNING', 'c5 status');
  assert(meta.checkedBy === 'test', 'c5 checkedBy');
  assert(meta.gates.cefr === 'warning', 'c5 gate map');
  assert(meta.policyMode === 'advisory', 'c5 policy');
  assert(!('generationMetadata' in meta), 'c5 not mixed with generation');

  const part = {
    module: 'lesen',
    teil: 1,
    passages: [{ id: 'p1', text: 'Ich gehe in den Park und treffe Freunde, weil ich frische Luft brauche.' }],
    questions: Array.from({ length: 6 }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'richtig_falsch',
      question: `Q${i + 1}?`,
      correct: 'R',
      correctAnswer: 'R',
      passageId: 'p1',
      vocabularyTags: ['park'],
      grammarTags: ['nebensatz'],
      difficulty: 2,
      explanation: 'Kurze Erklärung mit genug Worten für den Test.',
    })),
  };
  const report = await runQualityGates({ part, policyMode: 'advisory' });
  assert(report.qualityMetadata && report.qualityMetadata.status, 'c5 report has qualityMetadata');
  assert(report.generationMetadata == null || report.qualityMetadata !== report.generationMetadata, 'c5 separated');
  assert(report.policyMode === 'advisory', 'c5 policyMode on report');
}

// Default policy file is advisory
{
  const p = loadQualityGatePolicy();
  assert(p.mode === 'advisory', 'default policy advisory');
}

// forceApprove
{
  const r = canPromotePart(failReport, { mode: 'enforced', forceApprove: true });
  assert(r.allowed === true && r.overridden === true, 'forceApprove');
}

console.log('qualityGatePolicy tests passed.');
