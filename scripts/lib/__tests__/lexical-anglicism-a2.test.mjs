#!/usr/bin/env node
/**
 * A2 lexical gates — Latecoming + Hören participle-without-auxiliary heuristic.
 *   node scripts/lib/__tests__/lexical-anglicism-a2.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { checkLexical, findParticipleWithoutAuxiliaryIssues } from '../lexicalCheck.mjs';
import { anglicismIssuesForText, findEmbeddedEnglishTokenIssues, findRawEnglishIssues } from '../anglicismPolicy.mjs';

assert.ok(findRawEnglishIssues('Latecoming: kein Einlass').length >= 1);
assert.ok(findRawEnglishIssues('Littering ist verboten').length >= 1);
assert.ok(findEmbeddedEnglishTokenIssues('Latecoming: kein Einlass').length >= 1);
assert.equal(findEmbeddedEnglishTokenIssues('Boxing-Bereich im Studio').length, 0);

assert.equal(anglicismIssuesForText('A2', 'Die Situation und Investition sind normal.').length, 0);
assert.ok(anglicismIssuesForText('A2', 'Latecoming policy').length >= 1);

const participleHits = findParticipleWithoutAuxiliaryIssues(
  'Ihr Termin am Freitag um 14 Uhr bestätigt.',
);
assert.ok(participleHits.length >= 1, 'missing auxiliary before Partizip II');

const workBatch = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'batches/ready/pool-verified/A2/lesen-t2-cur-work.json'),
    'utf8',
  ),
);
const workLex = checkLexical(workBatch, { level: 'A2' });
assert.ok(!workLex.ok, 'lesen-t2-cur-work must fail on Latecoming');
assert.ok(workLex.issues.some((i) => /latecoming|inglés/i.test(i)), workLex.issues.join('; '));

const healthBatch = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'batches/ready/pool-verified/A2/horen-t1-cur-health.json'),
    'utf8',
  ),
);
const healthLex = checkLexical(healthBatch, { level: 'A2' });
assert.ok(
  healthLex.issues.some((i) => /bestätigt|Partizip|auxiliar/i.test(i)),
  `expected bestätigt hit, got: ${healthLex.issues.join('; ')}`,
);

console.log('PASS: A2 lexical anglicism + participle heuristics');
