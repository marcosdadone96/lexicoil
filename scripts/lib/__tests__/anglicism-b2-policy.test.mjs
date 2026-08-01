#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  anglicismIssuesForText,
  findRawEnglishIssues,
  isB2TierALoanwordToken,
  vocabularyLemmaForAnglicism,
  B2_ANGLICISM_PROMPT_HINT,
} from '../anglicismPolicy.mjs';
import { checkLexical } from '../lexicalCheck.mjs';

assert.ok(isB2TierALoanwordToken('Deadline'));
assert.ok(!findRawEnglishIssues('die Frist ist am Montag.').length);
assert.ok(findRawEnglishIssues('Wir machen gardening am Samstag.').length >= 1);

const b2Ok = anglicismIssuesForText('B2', 'Bitte beachten Sie die Deadline für das Projekt.');
assert.equal(b2Ok.length, 0);

const b2Bad = anglicismIssuesForText('B2', 'Please respect the deadline.');
assert.ok(b2Bad.some((x) => /inglés|deadline/i.test(x)));

assert.equal(vocabularyLemmaForAnglicism('Deadline', 'B2'), 'Frist');
assert.equal(vocabularyLemmaForAnglicism('Deadline', 'B1'), 'Deadline');

const batch053 = {
  level: 'B2',
  questions: [
    {
      id: 'q1',
      question:
        'Schreiben Sie eine Nachricht. Die Deadline für das Projekt ist verschoben.',
      explanation: 'Der Kandidat informiert über die Frist.',
      options: [],
    },
  ],
};
const lex = checkLexical(batch053);
assert.ok(lex.ok, lex.issues.join('; '));

assert.ok(B2_ANGLICISM_PROMPT_HINT.includes('50%'));
console.log('PASS: B2 Tier-A anglicism policy');
