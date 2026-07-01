#!/usr/bin/env node
/**
 * Personal Schreiben — blueprint word counts, pool conversion, UI config, production eval tiers.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PF = require(path.join(ROOT, 'js/engine/personalLesenPoolFallback.js'));
const { loadBlueprintFileSync } = require(path.join(
  ROOT,
  'js/engine/validation/blueprintResolver.js',
));
const { normalizeSchreibenItem } = require(path.join(
  ROOT,
  'netlify/functions/lib/productionEval.js',
));
const { addReusablePart, pickReusablePart } = require(path.join(
  ROOT,
  'netlify/functions/lib/reusablePartsStore.js',
));

function assert(label, cond) {
  if (!cond) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  console.log('OK:', label);
}

function makeMockStore() {
  const blobs = new Map();
  return {
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && blobs.has(key)) return { modified: false };
      blobs.set(key, value);
      return { modified: true };
    },
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(key) {
      blobs.delete(key);
    },
    async list({ prefix }) {
      const keys = [...blobs.keys()].filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

const bp = loadBlueprintFileSync('goethe_B1');
const schMod = bp.modules.find((m) => m.id === 'schreiben');
assert('blueprint has 3 schreiben parts', schMod.parts.length === 3);
assert('Teil 1 wordsTarget 80', schMod.parts[0].wordsTarget.min === 80);
assert('Teil 2 wordsTarget 80', schMod.parts[1].wordsTarget.min === 80);
assert('Teil 3 wordsTarget 40', schMod.parts[2].wordsTarget.min === 40);
assert('schreiben blueprint teils 1-3', PF.schreibenBlueprintTeils(bp).join(',') === '1,2,3');

const validPart = {
  teil: 1,
  aufgabe: 1,
  fieldId: 'write_bp_1',
  task: 'Schreiben Sie eine E-Mail an eine Freundin.\n• Punkt eins\n• Punkt zwei\n• Punkt drei\n\nSchreiben Sie etwa 80 Wörter.',
  minWords: 80,
  maxWords: 80,
};
assert('valid schreiben T1 passes', PF.schreibenTeilIsValid(validPart, 1, bp));
assert('short task fails', !PF.schreibenTeilIsValid({ teil: 1, task: 'Kurz.', minWords: 80 }, 1, bp));

const poolPayload = {
  id: 'pool-schreiben-t2',
  lang: 'de',
  level: 'B1',
  module: 'schreiben',
  teil: 2,
  task: 'Forum: Wohngemeinschaft oder eigene Wohnung? Schreiben Sie circa 80 Wörter.',
  minWords: 80,
  maxWords: 80,
  questions: [{ id: '1', type: 'short_answer', question: 'Forum task' }],
  complete: true,
  verified: true,
};
const converted = PF.reusablePartToSchreibenPart(poolPayload, bp);
assert('pool T2 converts with task', converted?.task?.includes('Forum'));
assert('pool T2 minWords 80', converted?.minWords === 80);
assert('pool T2 marked _fromPool', converted?._fromPool === true);

const store = makeMockStore();
await addReusablePart(store, poolPayload);
const picked = await pickReusablePart(store, 'de', 'B1', 'schreiben', { teil: 2 });
assert('pick schreiben teil 2', picked?.id === 'pool-schreiben-t2');

const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/ui/exam/examConfig.js'), 'utf8');
assert('examConfig schreiben ready', cfgSrc.includes("partCard('schreiben'") && cfgSrc.includes("'ready'"));
assert('examConfig no schreiben guard', !cfgSrc.includes("if(skill==='schreiben')return"));

const fullPro = normalizeSchreibenItem(
  {
    id: '1',
    totalScore: 72,
    rubric: { erfuellung: 18, kohaerenz: 17, wortschatz: 19, strukturen: 18 },
    correctedText: 'Korrigiert',
    errors: [{ original: 'x', correction: 'y', explanation: 'z' }],
    grammarPoints: [{ tag: 'Perfekt', explanation: '…' }],
    summary: 'Gut',
  },
  60,
  'full',
);
assert('pro eval has rubric', fullPro?.rubric?.erfuellung === 18);
assert('pro eval has correctedText', !!fullPro?.correctedText);

const basic = normalizeSchreibenItem(
  {
    id: '1',
    totalScore: 65,
    rubric: { erfuellung: 16, kohaerenz: 16, wortschatz: 17, strukturen: 16 },
    errorCounts: { grammar: 2, spelling: 1 },
    summary: 'OK',
  },
  60,
  'basic',
);
assert('basic eval no correctedText', !basic?.correctedText);
assert('basic eval has errorCounts', basic?.errorCounts?.grammar === 2);

console.log('\nPersonal Schreiben tests passed.');
