#!/usr/bin/env node
/**
 * Acceptance: reuse fallback logic when burned filter blocks complete assembly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require(path.join(ROOT, 'js/library/adsMatching.js'));
const ExamBlueprint = require(path.join(ROOT, 'js/library/ExamBlueprint.js'));
globalThis.ExamBlueprint = ExamBlueprint;
require(path.join(ROOT, 'js/library/PassageResolver.js'));
const ExamBuilder = require(path.join(ROOT, 'js/library/ExamBuilder.js'));

const lang = 'de';
const level = 'B1';
const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/blueprints/goethe_B1.json'), 'utf8'));
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', lang, level, 'questions.json'), 'utf8'));
ExamBlueprint.cacheBlueprint(lang, level, blueprint);

const allIds = new Set((bank.questions || []).map((q) => q.id).filter(Boolean));

function build(opts) {
  return ExamBuilder.buildFromBlueprint(lang, level, bank, blueprint, {
    mode: 'standard',
    ...opts,
  });
}

function buildWithReuseFallback(excludeIds) {
  let exam = build({ excludeIds, applyBurned: false });
  if (exam.blueprintComplete === false) {
    const retry = build({ excludeIds: undefined, applyBurned: false });
    if (retry.blueprintComplete) {
      retry.reusedItems = true;
      return retry;
    }
  }
  return exam;
}

let fail = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) fail = true;
}

const baseline = build({ applyBurned: false });
check('baseline exam is blueprintComplete', baseline.blueprintComplete === true);

const strict = build({ excludeIds: allIds, applyBurned: false });
check('with all ids excluded: incomplete', strict.blueprintComplete === false);

const reused = buildWithReuseFallback(allIds);
check('reuse fallback delivers complete exam', reused.blueprintComplete === true);
check('reusedItems flagged', reused.reusedItems === true);

console.log(fail ? '\nSome checks FAILED.\n' : '\nAll reuse fallback checks PASSED.\n');
process.exit(fail ? 1 : 0);
