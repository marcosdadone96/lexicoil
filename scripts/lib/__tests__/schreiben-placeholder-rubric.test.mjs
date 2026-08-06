#!/usr/bin/env node
/**
 * SCH-1 gate + display rubric + pool scan for Schreiben.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findUnresolvedSchreibenPlaceholders,
  assertSchreibenNoPlaceholders,
} from '../schreibenPlaceholderGate.mjs';
import { canonicalSchreibenExplanation } from '../schreibenDisplayRubric.mjs';
import { checkPromptBatchQuality } from '../promptBatchQuality.mjs';
import { normalizeBatch } from '../normalizeBatch.mjs';
import { classifySchreibenT3Scenario } from '../schreibenT3PremiseDedup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POOL = path.join(ROOT, 'batches/ready/pool-verified');

const badQ =
  'Liebe/r [Name des Freundes/der Freundin],\n\nSie haben letzte Woche an einer Umweltaktion teilgenommen.';
assert.ok(findUnresolvedSchreibenPlaceholders(badQ).length > 0, 'detects bracket placeholder');

const goodQ =
  'Sie haben vor Kurzem ein schönes Wochenende erlebt und möchten einer/einem Freund/in davon erzählen.';
assert.equal(findUnresolvedSchreibenPlaceholders(goodQ).length, 0);

const failBatch = {
  questions: [{ module: 'schreiben', teil: 1, question: badQ }],
};
const gate = assertSchreibenNoPlaceholders(failBatch);
assert.equal(gate.ok, false);

const qual = checkPromptBatchQuality(failBatch, 'schreiben', 1);
assert.equal(qual.ok, false);
assert.ok(qual.issues.some((i) => /placeholder/i.test(i)));

assert.ok(canonicalSchreibenExplanation(2).includes('Goethe-offiziell'));
assert.ok(canonicalSchreibenExplanation(2).includes('Vor- und Nachteile'));

const t3Borrow =
  'Sie haben von Ihrem Nachbarn ein Buch ausgeliehen. Sie wollten es heute zurückgeben, aber das geht leider nicht.';
assert.equal(classifySchreibenT3Scenario(t3Borrow), 'borrowed_item_return_delay');

// Pool scan
const hits = [];
for (const f of fs.readdirSync(POOL).filter((x) => /^schreiben.*\.json$/i.test(x))) {
  const batch = JSON.parse(fs.readFileSync(path.join(POOL, f), 'utf8'));
  const ph = assertSchreibenNoPlaceholders(batch);
  if (!ph.ok) hits.push({ file: f, issues: ph.issues });
}

console.log('Pool Schreiben placeholder scan:', hits.length ? hits : 'OK (0 hits)');
if (hits.length) process.exitCode = 1;

// Fix 012 via normalizeBatch (rubric + remove placeholder manually first)
const f012 = path.join(POOL, 'schreiben-gemini-012.json');
if (fs.existsSync(f012)) {
  const b = JSON.parse(fs.readFileSync(f012, 'utf8'));
  const q1 = b.questions.find((q) => Number(q.teil) === 1);
  if (q1) {
    q1.question = q1.question.replace(/^Liebe\/r \[Name des Freundes\/der Freundin\],\n\n/, '');
  }
  const norm = normalizeBatch(b, { module: 'schreiben', teil: 1, lang: 'de', level: 'B1' });
  fs.writeFileSync(f012, `${JSON.stringify(norm, null, 2)}\n`);
  const recheck = assertSchreibenNoPlaceholders(norm);
  assert.equal(recheck.ok, true, '012 clean after fix');
  assert.ok(norm.questions.find((q) => q.teil === 2).explanation.includes('Goethe-offiziell'));
  console.log('Fixed schreiben-gemini-012.json (placeholder + canonical rubrics)');
}

console.log('PASS: schreiben placeholder + rubric tests');
