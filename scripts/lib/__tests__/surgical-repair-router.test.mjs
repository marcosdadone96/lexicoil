/**
 * surgical-repair-router.test.mjs — triage → router wiring (no LLM)
 * Run: node scripts/lib/__tests__/surgical-repair-router.test.mjs
 */
import { classifyAndRepair } from '../repairTriage.mjs';
import { SURGICAL_REPAIR_KINDS } from '../surgicalRepairRouter.mjs';
import { hasMcqLengthBiasSignal } from '../mcqLengthBiasRepair.mjs';
import { hasLexicoRepairSignal } from '../lexicoRepair.mjs';

let passed = 0;
let failed = 0;

function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    failed++;
  }
}

const batchT2 = {
  passages: [
    { id: 'p1', text: 'Die Stadt bietet günstige Wohnungen für Familien in der Innenstadt.' },
    { id: 'p2', text: 'Viele Mieter suchen kleinere Wohnungen wegen der hohen Mieten.' },
  ],
  questions: [
    {
      id: 'gen-q-2-a',
      passageId: 'p1',
      module: 'lesen',
      teil: 2,
      type: 'multiple_choice',
      question: 'Was bietet die Stadt?',
      options: ['a) teure Wohnungen', 'b) günstige Wohnungen für Familien in der Innenstadt', 'c) keine Wohnungen'],
      correct: 'b',
      correctAnswer: 'b',
      explanation: 'Im Text steht, dass die Stadt günstige Wohnungen für Familien bietet.',
    },
  ],
};

console.log('\n── mcq_length_bias triage ──');
{
  const issues = [
    'gen-q-2-a: sesgo de longitud MCQ — opción correcta (b) es la más larga (+35%)',
  ];
  const triage = classifyAndRepair(batchT2, { gate: 'calidad', issues });
  assert('detects length bias signal', hasMcqLengthBiasSignal(issues));
  assert('repairKind=mcq_length_bias', triage.repairKind === 'mcq_length_bias');
  assert('in SURGICAL_REPAIR_KINDS', SURGICAL_REPAIR_KINDS.has('mcq_length_bias'));
}

console.log('\n── lexico triage ──');
{
  const issues = [
    'question gen-q-2-a: vocabulario B2+ «Implementierungsstrategie» → usa «Plan/Vorgehen» (B1)',
  ];
  const triage = classifyAndRepair(batchT2, { gate: 'lexico', issues });
  assert('detects lexico signal', hasLexicoRepairSignal(issues));
  assert('repairKind=lexico', triage.repairKind === 'lexico');
  assert('in SURGICAL_REPAIR_KINDS', SURGICAL_REPAIR_KINDS.has('lexico'));
}

console.log('\n── hören word_match triage ──');
{
  const issues = [
    'gen-q-h2-abc: pregunta copia ≥4 palabras seguidas de la transcripción («kinder unter zwölf jahren»)',
  ];
  const triage = classifyAndRepair(
    { ...batchT2, questions: [{ ...batchT2.questions[0], id: 'gen-q-h2-abc', module: 'horen' }] },
    { gate: 'calidad', issues },
  );
  assert('repairKind=word_match for hören', triage.repairKind === 'word_match');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
