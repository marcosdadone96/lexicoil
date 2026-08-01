/**
 * node --test scripts/lib/__tests__/lexico-repair-parse.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseLexicoFindings,
  applyDeterministicLexicoSubstitutions,
} from '../lexicoRepair.mjs';

test('parseLexicoFindings extracts id from explanation field label', () => {
  const issues = [
    'question gen-q-h4-abc-3 explanation: vocabulario B2+ en pregunta «zugänglich» → usa «einfach / offen» (B1)',
  ];
  const f = parseLexicoFindings(issues);
  assert.equal(f.length, 1);
  assert.equal(f[0].itemId, 'gen-q-h4-abc-3');
  assert.equal(f[0].field, 'explanation');
  assert.equal(f[0].term, 'zugänglich');
});

test('Herausforderungen → Probleme (plural-safe lexico)', () => {
  const batch = {
    questions: [
      {
        id: 'gen-q-sp-t1-x',
        question: 'Vorteile und mögliche Herausforderungen von Sport.',
      },
    ],
  };
  const findings = parseLexicoFindings([
    'question gen-q-sp-t1-x: vocabulario B2+ en pregunta «Herausforderungen» → usa «Probleme / Schwierigkeiten» (B1)',
  ]);
  const out = applyDeterministicLexicoSubstitutions(batch, findings);
  assert.ok(out);
  assert.match(out.questions[0].question, /Probleme/i);
  assert.doesNotMatch(out.questions[0].question, /Herausforderungen/i);
});

test('deterministic lexico replaces term in explanation', () => {
  const batch = {
    questions: [
      {
        id: 'gen-q-h4-abc-3',
        question: 'Statement',
        explanation: 'Der Text sagt, dass Kultur zugänglich sein soll.',
      },
    ],
  };
  const findings = parseLexicoFindings([
    'question gen-q-h4-abc-3 explanation: vocabulario B2+ «zugänglich» → usa «einfach / offen» (B1)',
  ]);
  const out = applyDeterministicLexicoSubstitutions(batch, findings);
  assert.ok(out);
  assert.match(out.questions[0].explanation, /einfach/i);
  assert.doesNotMatch(out.questions[0].explanation, /zugänglich/i);
});

test('Workshop in passage text — parse id + deterministic Kurs (A2 T4 loop fix)', () => {
  const issue =
    'passage gen-l4-5598cf92-c text: vocabulario C1/C2 «Workshop» → usa «Workshop → Kurs / Seminar / Werkstatt» (B1)';
  const findings = parseLexicoFindings([issue]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].itemId, 'gen-l4-5598cf92-c');
  assert.equal(findings[0].field, 'passageText');

  const batch = {
    passages: [
      {
        id: 'gen-l4-5598cf92-c',
        title: 'Kreativ-Workshop für Kinder',
        text: 'Kreativ-Workshop: Basteln mit Holz! Anmeldung bis Freitag.',
      },
    ],
    questions: [],
  };
  const out = applyDeterministicLexicoSubstitutions(batch, findings);
  assert.ok(out);
  assert.match(out.passages[0].text, /Kurs|Seminar|Werkstatt/i);
  assert.doesNotMatch(out.passages[0].text, /Workshop/i);
});

test('Workshop in passage title — field passageTitle', () => {
  const issue =
    'passage gen-l4-ecbdfeee-a title: vocabulario C1/C2 «Workshop» → usa «Workshop → Kurs / Seminar / Werkstatt» (B1)';
  const findings = parseLexicoFindings([issue]);
  assert.equal(findings[0].field, 'passageTitle');
  const batch = {
    passages: [{ id: 'gen-l4-ecbdfeee-a', title: 'Foto-Workshop', text: 'Lerne Fotos bearbeiten.' }],
    questions: [],
  };
  const out = applyDeterministicLexicoSubstitutions(batch, findings);
  assert.ok(out);
  assert.doesNotMatch(out.passages[0].title, /Workshop/i);
});

test('deterministic lexico replaces term in signText (Lesen T4)', () => {
  const batch = {
    questions: [
      {
        id: 'gen-q-4-e3b9358e-1',
        question: 'Ist Anna für den Vorschlag?',
        signText: 'Die Kurse sind zugänglicher geworden und das finde ich gut.',
      },
    ],
  };
  const findings = parseLexicoFindings([
    'question gen-q-4-e3b9358e-1 signText: vocabulario B2+ en pregunta «zugänglicher» → usa «einfach / offen» (B1)',
  ]);
  assert.equal(findings[0].field, 'signText');
  const out = applyDeterministicLexicoSubstitutions(batch, findings);
  assert.ok(out);
  assert.match(out.questions[0].signText, /einfach/i);
  assert.doesNotMatch(out.questions[0].signText, /zugänglich/i);
});
