#!/usr/bin/env node
/**
 * Live pipeline gate check on real A2 bank slices (no API).
 * Proves runDualGates-equivalent checks use A2 thresholds.
 *   node scripts/verify-a2-gates-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/loadEnv.mjs';
import { checkLesenBatchQuality } from './lib/lesenBatchQuality.mjs';
import { checkHorenBatchQuality } from './lib/horenBatchQuality.mjs';
import { checkLexical } from './lib/lexicalCheck.mjs';
import { collectMcqLengthBiasIssues, resolveLengthBiasThresholds } from './lib/mcqLengthBias.mjs';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/de/A2/questions.json'), 'utf8'));

function sliceBatch(module, teil, n = 5) {
  const questions = BANK.questions.filter((q) => q.module === module && Number(q.teil) === teil).slice(0, n);
  const pids = new Set(questions.map((q) => q.passageId).filter(Boolean));
  const passages = BANK.passages.filter((p) => pids.has(p.id) || (p.module === module && Number(p.teil) === teil));
  return normalizeBatch(
    { level: 'A2', lang: 'de', module, questions, passages: passages.slice(0, Math.max(1, pids.size || 1)) },
    { module, teil, lang: 'de', level: 'A2' },
  );
}

function gateReport(label, batch, teil, module) {
  const quality =
    module === 'horen'
      ? checkHorenBatchQuality(batch, teil, { level: 'A2' })
      : checkLesenBatchQuality(batch, teil, { level: 'A2' });
  const lex = checkLexical(batch, { level: 'A2' });
  const lengthIssues = collectMcqLengthBiasIssues(batch, { level: 'A2', gate: true });
  const thresholds = resolveLengthBiasThresholds('A2');
  return {
    label,
    qualityOk: quality.ok,
    qualityIssues: (quality.issues || []).slice(0, 3),
    lexOk: lex.ok,
    lengthBiasIssues: lengthIssues.length,
    thresholds,
    mcqLengthDetail: lengthIssues[0] || null,
  };
}

const lesenT1 = sliceBatch('lesen', 1, 5);
const horenT1 = sliceBatch('horen', 1, 5);

const lesenWithB1 = {
  ...lesenT1,
  questions: lesenT1.questions.map((q, i) =>
    i === 0
      ? {
          ...q,
          question: 'Was ist die größte Herausforderung im Text?',
          explanation: 'Die Herausforderung ist wichtig.',
        }
      : q,
  ),
};

console.log('=== A2 live gate verification (bank slices) ===\n');
console.log(JSON.stringify(gateReport('lesen T1 (real)', lesenT1, 1, 'lesen'), null, 2));
console.log(JSON.stringify(gateReport('horen T1 (real)', horenT1, 1, 'horen'), null, 2));
console.log(JSON.stringify(gateReport('lesen T1 + B1+ inject', lesenWithB1, 1, 'lesen'), null, 2));

const lexInject = checkLexical(lesenWithB1, { level: 'A2' });
console.log('\nB1+ inject lex issues:', lexInject.issues.filter((i) => i.includes('B1+')));
