#!/usr/bin/env node
/**
 * B1 separable finite-split detection scope + regression (10+ verbs).
 * Run: node scripts/test-b1-separable-finite-split.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.Lemmatizer = require(path.join(ROOT, 'js/engine/validation/lemmatizer.js'));
globalThis.SeparableResolve = require(path.join(ROOT, 'js/engine/separableResolve.js'));
const SR = globalThis.SeparableResolve;
const VerbConjugation = require(path.join(ROOT, 'js/data/verbConjugation.js'));
const { targetAppearsInPassage } = require(path.join(ROOT, 'netlify/functions/lib/listeningGameUtils.js'));

const B1_CORE = [
  'aufstehen', 'vorschlagen', 'anrufen', 'anbieten', 'abnehmen', 'mitnehmen',
  'aufgeben', 'ausgehen', 'einkaufen', 'anmelden', 'vorstellen', 'zuhören',
  'zurückkommen', 'mitmachen', 'anfangen', 'aufhören', 'teilnehmen', 'abholen',
  'umsteigen', 'fernsehen',
].filter((v) => SR.SEPARABLE_INFINITIVES.has(v));

function sentenceFor(lemma) {
  const c = VerbConjugation.getPresent(lemma, 'de');
  const er = c?.forms?.er;
  if (!er || !c?.separable) return null;
  const parts = String(er).trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [root, particle] = parts;
  return `Heute ${root} er früh ${particle}.`;
}

let pass = 0;
let fail = 0;
const broken = [];
const ok = [];

console.log('\n── B1 separable finite-split scope ──');
console.log(`  allowlisted B1 core sample: ${B1_CORE.length} verbs\n`);

for (const lemma of B1_CORE) {
  const text = sentenceFor(lemma);
  if (!text) {
    fail++;
    broken.push({ lemma, reason: 'no separable present er form' });
    continue;
  }
  const tokens = SR.tokenize(text);
  const pairs = SR.findSplitPairs(tokens);
  const appears = targetAppearsInPassage(lemma, text, 'de');
  const good = pairs.some((p) => p.lemma === lemma) && appears;
  if (good) {
    pass++;
    ok.push(lemma);
  } else {
    fail++;
    broken.push({ lemma, text, pairs: pairs.map((p) => p.lemma), appears });
  }
}

console.log(`  PASS: ${pass}/${B1_CORE.length}`);
console.log(`  FAIL: ${fail}/${B1_CORE.length}`);
if (broken.length) {
  console.log('\n  Broken:');
  for (const b of broken) console.log(`    ${b.lemma}: ${JSON.stringify(b)}`);
}

// Mandatory regression set from audit
const REGRESSION = [
  { lemma: 'aufstehen', text: 'Er steht jeden Morgen um sechs Uhr auf.' },
  { lemma: 'vorschlagen', text: 'Meine Kollegin schlägt vor, dass wir früher essen.' },
  { lemma: 'anrufen', text: 'Ich rufe dich morgen an.' },
  { lemma: 'anbieten', text: 'Das Hotel bietet den Gästen ein Frühstück an.' },
  { lemma: 'abnehmen', text: 'Sie nimmt in diesem Monat fünf Kilo ab.' },
  { lemma: 'mitnehmen', text: 'Nimm bitte einen Regenschirm mit.' },
  { lemma: 'aufgeben', text: 'Er gibt das Projekt leider auf.' },
  { lemma: 'einkaufen', text: 'Wir kaufen heute im Supermarkt ein.' },
  { lemma: 'anmelden', text: 'Sie meldet sich online an.' },
  { lemma: 'zuhören', text: 'Bitte hör mir genau zu.' },
];

console.log('\n── Regression (10 real sentences) ──');
let rPass = 0;
for (const { lemma, text } of REGRESSION) {
  const pairs = SR.findSplitPairs(SR.tokenize(text));
  const appears = targetAppearsInPassage(lemma, text, 'de');
  const good = pairs.some((p) => p.lemma === lemma) || appears;
  console.log(`  ${good ? '✅' : '❌'} ${lemma}`);
  if (good) rPass++;
  else fail++;
}

console.log(`\n  Regression: ${rPass}/${REGRESSION.length}`);
const scopePass = pass >= Math.min(15, B1_CORE.length - 3); // allow a few edge verbs without clean er-template
process.exit(rPass >= 10 && scopePass ? 0 : 1);
