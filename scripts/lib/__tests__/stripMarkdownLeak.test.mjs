/**
 * stripMarkdownLeak.test.mjs
 * Run: node scripts/lib/__tests__/stripMarkdownLeak.test.mjs
 */
import {
  stripMarkdownLeakInText,
  stripBoldMarkdownInText,
  stripBoldMarkdownInPassages,
  stripMarkdownLeakInBatch,
} from '../stripMarkdownLeak.mjs';
import { runPassageCoherenceGate } from '../qualityGates/passageCoherenceGate.mjs';

let passed = 0;
let failed = 0;

function assertEq(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNoAsterisk(desc, text) {
  if (!/\*/.test(text)) {
    console.log(`  ✅  ${desc}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       still contains *: ${JSON.stringify(text)}`);
    failed++;
  }
}

console.log('\n── stripMarkdownLeakInText (bold) ──');

assertEq(
  'removes **negrita** headers',
  stripMarkdownLeakInText('**Öffnungszeiten:** Das Zentrum öffnet um neun Uhr.').result,
  'Öffnungszeiten: Das Zentrum öffnet um neun Uhr.',
);

assertEq(
  'plain text unchanged',
  stripMarkdownLeakInText('Öffnungszeiten: Das Zentrum öffnet um neun Uhr.').result,
  'Öffnungszeiten: Das Zentrum öffnet um neun Uhr.',
);

assertEq(
  'counts bold replacements',
  stripMarkdownLeakInText('**A:** foo **B:** bar').boldFixed,
  2,
);

console.log('\n── stripMarkdownLeakInText (bullets AUD-4b) ──');

assertEq(
  'removes *   bullet at line start',
  stripMarkdownLeakInText('Intro:\n\n*   Öffnungszeiten: Das Zentrum.').result,
  'Intro:\n\nÖffnungszeiten: Das Zentrum.',
);

assertEq(
  'removes - bullet at line start',
  stripMarkdownLeakInText('Regeln:\n- Ruhe abends spät.').result,
  'Regeln:\nRuhe abends spät.',
);

assertEq(
  'leaves mid-line hyphen ranges untouched',
  stripMarkdownLeakInText('Geöffnet von 9-11 Uhr täglich.').result,
  'Geöffnet von 9-11 Uhr täglich.',
);

assertEq(
  'leaves compound hyphen untouched',
  stripMarkdownLeakInText('E-Learning-Kurse sind möglich.').result,
  'E-Learning-Kurse sind möglich.',
);

assertEq(
  'leaves unicode • bullets untouched',
  stripMarkdownLeakInText('Punkte:\n• Wann und wo?\n• Wer kommt mit?').result,
  'Punkte:\n• Wann und wo?\n• Wer kommt mit?',
);

console.log('\n── t5-068/070 combined pattern (bold + bullet) ──');

{
  const input =
    'Damit sich jeder wohlfühlt:\n\n*   **Öffnungszeiten:** Das Zentrum ist montags bis samstags geöffnet.\n*   **Raumnutzung:** Für private Veranstaltungen können Räume gemietet werden.';
  const { result, boldFixed, bulletFixed } = stripMarkdownLeakInText(input);
  assertEq('bold stripped', boldFixed, 2);
  assertEq('bullets stripped', bulletFixed, 2);
  assertNoAsterisk('no asterisks remain', result);
  assertEq(
    'headers plain with colon',
    result,
    'Damit sich jeder wohlfühlt:\n\nÖffnungszeiten: Das Zentrum ist montags bis samstags geöffnet.\nRaumnutzung: Für private Veranstaltungen können Räume gemietet werden.',
  );

  const q3 = runPassageCoherenceGate(
    { passages: [{ id: 'p1', text: result }], questions: [] },
    { file: 'test-t5-bullet-fix' },
  );
  if (q3.verdict === 'pass') {
    console.log('  ✅  Q3-A pass after strip (no markdown_leak)');
    passed++;
  } else {
    console.error('  ❌  Q3-A should pass after strip');
    console.error('       findings:', q3.findings);
    failed++;
  }
}

console.log('\n── AUD-4c Sprechen question bullets (Hallazgo 1) ──');

{
  const cases = [
    {
      id: 'ehrenamt-thema-02 T1',
      input:
        'Sprechen Sie über die folgenden Punkte:\n\n*   Ziel des Projekts\n*   Aufgabenverteilung unter den Helfern\n*   Benötigte Ressourcen und Materialien',
      expected:
        'Sprechen Sie über die folgenden Punkte:\n\nZiel des Projekts\nAufgabenverteilung unter den Helfern\nBenötigte Ressourcen und Materialien',
    },
    {
      id: 'gemini-001 T1',
      input:
        'Sprechen Sie über die folgenden Punkte:\n\n*   Datum und geeigneter Ort für das Fest\n*   Ideen für das Programm (Musik, Essen, Aktivitäten)\n*   Budgetplanung: Was darf es kosten? Haben Sie Angst, dass es am Ende doch viel zu teurer wird?',
      expected:
        'Sprechen Sie über die folgenden Punkte:\n\nDatum und geeigneter Ort für das Fest\nIdeen für das Programm (Musik, Essen, Aktivitäten)\nBudgetplanung: Was darf es kosten? Haben Sie Angst, dass es am Ende doch viel zu teurer wird?',
    },
    {
      id: 'gemini-005 T1',
      input:
        'Sprechen Sie über:\n\n*   Was für eine Art von Spendenaktion wollen wir organisieren? (z.B. Kuchenverkauf, Flohmarkt, Spendenlauf)\n*   Wer soll die Aktion unterstützen und wie können wir Helfer finden?\n*   Wo und wann soll die Aktion stattfinden? Sollen wir Räume anfragen?',
      expected:
        'Sprechen Sie über:\n\nWas für eine Art von Spendenaktion wollen wir organisieren? (z.B. Kuchenverkauf, Flohmarkt, Spendenlauf)\nWer soll die Aktion unterstützen und wie können wir Helfer finden?\nWo und wann soll die Aktion stattfinden? Sollen wir Räume anfragen?',
    },
    {
      id: 'sport-praesentation-01 T1',
      input:
        'Planen Sie gemeinsam:\n\n*   Welche Sportart kommt infrage?\n*   Wo soll der Kurs stattfinden (z.B. Halle, draußen, online)?\n*   Wann und wie oft soll der Kurs stattfinden?',
      expected:
        'Planen Sie gemeinsam:\n\nWelche Sportart kommt infrage?\nWo soll der Kurs stattfinden (z.B. Halle, draußen, online)?\nWann und wie oft soll der Kurs stattfinden?',
    },
  ];

  for (const c of cases) {
    const { result, bulletFixed } = stripMarkdownLeakInText(c.input);
    assertEq(`${c.id} text`, result, c.expected);
    assertNoAsterisk(`${c.id} no *`, result);
    if (bulletFixed >= 3) {
      console.log(`  ✅  ${c.id} bulletFixed=${bulletFixed}`);
      passed++;
    } else {
      console.error(`  ❌  ${c.id} expected bulletFixed>=3 got ${bulletFixed}`);
      failed++;
    }
  }

  const batch = {
    passages: [],
    questions: cases.map((c, i) => ({
      id: `sp-t1-case-${i}`,
      module: 'sprechen',
      teil: 1,
      question: c.input,
    })),
  };
  const { batch: out, totalFixed } = stripMarkdownLeakInBatch(batch);
  assertEq('batch totalFixed >= 12', totalFixed >= 12, true);
  for (let i = 0; i < cases.length; i++) {
    assertEq(`batch Q${i}`, out.questions[i].question, cases[i].expected);
  }
}

console.log('\n── stripMarkdownLeakInBatch (passages + questions) ──');

{
  const { batch, totalFixed } = stripMarkdownLeakInBatch({
    passages: [
      {
        id: 'p1',
        text: '**Regeln:**\n\n*   **Ruhe:** abends.',
        title: '**Titel**',
        transcript: 'ok',
      },
    ],
    questions: [{ question: '**Q?**\n\n*   Punkt eins' }],
  });
  assertEq('passage text stripped', batch.passages[0].text, 'Regeln:\n\nRuhe: abends.');
  assertEq('passage title stripped', batch.passages[0].title, 'Titel');
  assertEq('question stripped', batch.questions[0].question, 'Q?\n\nPunkt eins');
  assertEq('totalFixed', totalFixed, 6);
  assertEq(
    'alias stripBoldMarkdownInPassages same',
    stripBoldMarkdownInPassages({
      passages: [],
      questions: [{ question: '*   A' }],
    }).batch.questions[0].question,
    'A',
  );
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
