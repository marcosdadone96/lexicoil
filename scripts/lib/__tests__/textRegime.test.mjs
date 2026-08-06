#!/usr/bin/env node
/**
 * textRegime.test.mjs — v6.1-A structural classifier unit tests.
 * Run: node scripts/lib/__tests__/textRegime.test.mjs
 */
import {
  REGIME,
  classifyTextRegime,
  looksLikeProseSentenceStrong,
  telegraphicMarkerHits,
  teilFromFile,
} from '../textRegime.mjs';

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

function assertRegime(desc, input, expectedRegime) {
  const r = classifyTextRegime(input);
  if (r.regime === expectedRegime) {
    console.log(`  ✅  ${desc} → ${expectedRegime}`);
    passed++;
  } else {
    console.error(`  ❌  ${desc}`);
    console.error(`       expected regime: ${expectedRegime}`);
    console.error(`       actual: ${r.regime} signals=${r.signals.join(',')}`);
    failed++;
  }
}

console.log('\n── teilFromFile ──');
assertEq('t3-auto', teilFromFile('lesen-t3-auto-004.json'), 3);
assertEq('t2-gemini', teilFromFile('lesen-t2-gemini-089.json'), 2);
assertEq('missing', teilFromFile('foo.json'), null);

console.log('\n── looksLikeProseSentenceStrong ──');
assertEq('bietet sentence', looksLikeProseSentenceStrong('LebensRetter bietet Erste Hilfe.'), true);
assertEq('soll alone not strong', looksLikeProseSentenceStrong('ausgefallen, die wieder laufen soll.'), false);

console.log('\n── TELEGRAPHIC_AD (t3 anuncios) ──');
assertRegime(
  'Anfängerkurs Ballett t3-auto',
  {
    text: 'C) SpitzenTanz — Anfängerkurs Ballett für Erwachsene, Di 18 Uhr',
    field: 'questions.options',
    file: 'lesen-t3-auto-4w233t.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'auch Schrift t3-auto',
  {
    text: 'in Arabisch, auch Schrift, Mo 18–19 Uhr',
    field: 'questions.options',
    file: 'lesen-t3-auto-008.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'Horizont Reisen t3-auto',
  {
    text: 'F) Horizont Reisen — Pauschalreisen, Beratung',
    field: 'questions.options',
    file: 'lesen-t3-auto-004.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'online horario t3-auto',
  {
    text: '5 bis 10, online oder daheim, Di',
    field: 'questions.options',
    file: 'lesen-t3-auto-013.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'TastenWelt t3-auto',
  {
    text: 'E) TastenWelt — Unterricht am Klavier',
    field: 'questions.options',
    file: 'lesen-t3-auto-001.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'NachbarSchatz Treff t3-gemini',
  {
    text: 'J) NachbarSchatz Treff — Gemeinsame Aktionen und Treffpunkt',
    field: 'questions.options',
    file: 'lesen-t3-gemini-053.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'wieder laufen soll t3-auto (no prose override)',
  {
    text: 'Service ausgefallen, die wieder laufen soll.',
    field: 'questions.options',
    file: 'lesen-t3-auto-urnm92.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'Professioneller Ton t3-gemini explanation',
  {
    text: 'Professioneller Ton in Korrespondenz — Schreibcoaching',
    field: 'questions.explanation',
    file: 'lesen-t3-gemini-001.json',
  },
  REGIME.TELEGRAPHIC_AD,
);
assertRegime(
  'Probestunde Nachhilfe t3-gemini explanation',
  {
    text: 'PC-Hilfe oder kostenlose Probestunde Nachhilfe.',
    field: 'questions.explanation',
    file: 'lesen-t3-gemini-001.json',
  },
  REGIME.TELEGRAPHIC_AD,
);

console.log('\n── PROSE (gemini / no telegraphic) ──');
assertRegime(
  't2-089 Stellen option',
  {
    text: 'b) Sie Stellen die gedruckten Ausgaben komplett ein.',
    field: 'questions.options',
    file: 'lesen-t2-gemini-089.json',
  },
  REGIME.PROSE,
);
assertRegime(
  't2 complete sentence Stellen',
  {
    text: 'Sie Stellen neue Mitarbeiter ein.',
    field: 'questions.options',
    file: 'lesen-t2-gemini-089.json',
  },
  REGIME.PROSE,
);
assertRegime(
  't5 complete sentence Essen',
  {
    text: 'Wir Essen gemeinsam.',
    field: 'questions.options',
    file: 'lesen-t5-gemini-061.json',
  },
  REGIME.PROSE,
);
assertRegime(
  't5 Ganzen Arbeiten option',
  {
    text: 'c) Man kann dort den Ganzen Tag kostenlos Arbeiten.',
    field: 'questions.options',
    file: 'lesen-t5-gemini-061.json',
  },
  REGIME.PROSE,
);
assertRegime(
  't3-gemini prose sentence',
  {
    text: 'LebensRetter bietet Erste Hilfe.',
    field: 'questions.options',
    file: 'lesen-t3-auto-0su12l.json',
  },
  REGIME.PROSE,
);
assertRegime(
  't2 passage',
  {
    text: 'Lokale Zeitungen Spielen weiterhin eine wichtige Rolle.',
    field: 'passages.text',
    file: 'lesen-t2-gemini-089.json',
  },
  REGIME.PROSE,
);

console.log('\n── TITLE_HEADING ──');
assertRegime(
  'signText',
  {
    text: 'Die Stadt sollte lieber in Bessere Fahrradwege investieren.',
    field: 'questions.signText',
    file: 'lesen-t4-gemini-035.json',
  },
  REGIME.TITLE_HEADING,
);

console.log('\n── telegraphicMarkerHits ──');
const hits = telegraphicMarkerHits('F) Horizont Reisen — Pauschalreisen');
assertEq('marker count >= 2', hits.count >= 2, true);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
