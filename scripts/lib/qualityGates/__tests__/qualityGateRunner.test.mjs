/**
 * PASO 9 — QualityGateRunner tests.
 *   node scripts/lib/qualityGates/__tests__/qualityGateRunner.test.mjs
 */
import {
  runQualityGates,
  gateJsonIntegrity,
  gateGoetheStructure,
  gateLanguageQuality,
  gateMetadataQuality,
} from '../qualityGateRunner.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function basePart(overrides = {}) {
  return {
    module: 'lesen',
    teil: 1,
    passages: [{ id: 'p1', text: 'Ich gehe oft in den Park, weil ich frische Luft brauche und Freunde treffe.' }],
    questions: [
      {
        id: 'q1',
        type: 'richtig_falsch',
        question: 'Die Person geht oft in den Park.',
        correct: 'R',
        correctAnswer: 'R',
        passageId: 'p1',
        vocabularyTags: ['park', 'luft', 'freunde'],
        grammarTags: ['nebensatz', 'weil'],
        difficulty: 2,
        explanation: 'Im Text steht, dass die Person oft in den Park geht.',
      },
      {
        id: 'q2',
        type: 'richtig_falsch',
        question: 'Die Person mag keine frische Luft.',
        correct: 'F',
        correctAnswer: 'F',
        passageId: 'p1',
        vocabularyTags: ['luft'],
        grammarTags: ['negation'],
        difficulty: 2,
        explanation: 'Sie braucht frische Luft, also mag sie sie.',
      },
      {
        id: 'q3',
        type: 'richtig_falsch',
        question: 'Sie trifft Freunde.',
        correct: 'R',
        correctAnswer: 'R',
        passageId: 'p1',
        vocabularyTags: ['freunde'],
        grammarTags: ['präsent'],
        difficulty: 1,
        explanation: 'Der Text nennt Freunde treffen.',
      },
      {
        id: 'q4',
        type: 'richtig_falsch',
        question: 'Sie bleibt immer zu Hause.',
        correct: 'F',
        correctAnswer: 'F',
        passageId: 'p1',
        vocabularyTags: ['park'],
        grammarTags: ['nebensatz'],
        difficulty: 2,
        explanation: 'Sie geht in den Park, nicht immer zu Hause.',
      },
      {
        id: 'q5',
        type: 'richtig_falsch',
        question: 'Frische Luft ist wichtig für sie.',
        correct: 'R',
        correctAnswer: 'R',
        passageId: 'p1',
        vocabularyTags: ['luft'],
        grammarTags: ['adjektiv'],
        difficulty: 2,
        explanation: 'Sie braucht frische Luft.',
      },
      {
        id: 'q6',
        type: 'richtig_falsch',
        question: 'Sie geht nie spazieren.',
        correct: 'F',
        correctAnswer: 'F',
        passageId: 'p1',
        vocabularyTags: ['park'],
        grammarTags: ['negation'],
        difficulty: 2,
        explanation: 'Sie geht oft in den Park.',
      },
    ],
    ...overrides,
  };
}

// Caso 1 — JSON correcto → PASS (structure may WARNING if counts off; we match 6)
{
  const part = basePart();
  const r = await runQualityGates({ part, source: 'lesen-t1-test.json' });
  assert(r.status === 'PASS' || r.status === 'WARNING', `c1 status got ${r.status}`);
  assert(r.gates.find((g) => g.name === 'json_integrity').status === 'PASS', 'c1 json pass');
  assert(r.gates.find((g) => g.name === 'goethe_structure').status === 'PASS', 'c1 structure pass');
  assert(r.stagingStatus === 'candidate_ready' || r.stagingStatus === 'needs_review', 'c1 staging');
}

// Caso 2 — correctAnswer inexistente → FAIL
{
  const part = basePart();
  delete part.questions[0].correct;
  delete part.questions[0].correctAnswer;
  const g = gateJsonIntegrity(part);
  assert(g.status === 'FAIL', 'c2 fail');
  assert(g.errors.some((e) => e.includes('missing_correctAnswer')), 'c2 missing correct');
  const r = await runQualityGates({ part });
  assert(r.status === 'FAIL' && r.stagingStatus === 'rejected', 'c2 rejected');
}

// Caso 3 — vocabulario B2 → WARNING/FAIL
{
  const part = basePart({
    passages: [
      {
        id: 'p1',
        text:
          'Das Konzept ist faszinierend und konzeptionell ambivalent; man muss differenzieren und implizieren.',
      },
    ],
  });
  const r = await runQualityGates({ part, source: 'lesen-t1-b2.json' });
  const cefr = r.gates.find((g) => g.name === 'cefr');
  assert(cefr.status === 'WARNING' || cefr.status === 'FAIL', `c3 cefr ${cefr.status}`);
}

// Caso 4 — feedback activo detecta patrón → WARNING
{
  const part = basePart({
    passages: [
      {
        id: 'p1',
        text: 'Ein Bericht zeigt, dass viele Menschen im Park spazieren gehen und Freunde treffen.',
      },
    ],
  });
  const r = await runQualityGates({
    part,
    feedbackRules: [
      {
        id: 'gf-1',
        status: 'active',
        priority: 'high',
        avoid: 'Ein Bericht zeigt',
      },
    ],
  });
  const lang = r.gates.find((g) => g.name === 'language_quality');
  assert(lang.status === 'FAIL' || lang.status === 'WARNING', `c4 lang ${lang.status}`);
  assert(
    lang.errors.some((e) => /Bericht|feedback_avoid/i.test(e)),
    'c4 hit pattern',
  );
}

// Caso 5 — metadata corrupta → FAIL
{
  const part = basePart();
  for (const q of part.questions) {
    delete q.vocabularyTags;
    delete q.grammarTags;
    q.difficulty = 99;
  }
  const g = gateMetadataQuality(part);
  assert(g.status === 'FAIL', `c5 meta ${g.status}`);
  const r = await runQualityGates({ part });
  assert(r.status === 'FAIL', 'c5 overall fail');
}

// Goethe structure wrong count
{
  const part = basePart({ questions: basePart().questions.slice(0, 2) });
  const g = gateGoetheStructure(part, { source: 'lesen-t1-x.json' });
  assert(g.status === 'FAIL', 'structure count fail');
}

// Language without artificial → PASS
{
  const g = gateLanguageQuality(basePart(), { feedbackRules: [] });
  assert(g.status === 'PASS', 'clean language pass');
}

console.log('qualityGateRunner tests passed.');
