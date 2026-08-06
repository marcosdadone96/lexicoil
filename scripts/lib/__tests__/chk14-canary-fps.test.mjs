#!/usr/bin/env node
/**
 * CHK-14 canary FP fixes (2026-07-11) — verbs / comparative adj / ein paar.
 * Extended 2026-07-12: später (adv via spät stem) / glauben (infinitive after und).
 *   node scripts/lib/__tests__/chk14-canary-fps.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chk14 } from '../../audit-pass-2.mjs';
import { isKnownGermanNoun } from '../germanNounLexicon.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CANARY = path.join(ROOT, 'batches/ready/canary-all-staging-2026-07-11');

function batch(text) {
  return { passages: [{ id: 'p', text: String(text) }], questions: [] };
}

function scopes(text) {
  return chk14(batch(text), 't').map((f) => f.scope);
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

console.log('=== a) Canary FPs must NOT fire ===');
const fps = [
  ['brauchen', 'Die Angestellten und brauchen einen Gästeausweis.'],
  ['glaube', 'Lena: Ja, das glaube ich dir. Meine Freundin hat auch Glück.'],
  ['leises', 'Im Erdgeschoss, wo Gespräche und leises Spielen erlaubt sind.'],
  ['kleineren', 'Manchmal hat man Glück bei kleineren Wohnungsgesellschaften, nicht wahr?'],
  ['teurere', 'dann könntest du dir eine teurere Wohnung leisten? Markus: Haha.'],
  ['preiswert', 'Das ist super praktisch und preiswert, wenn man nicht jeden Tag ein Auto braucht.'],
  ['paar Ideas', 'Mein Vater hat da schon ein paar Ideen für Wanderungen in der Nähe.'],
  ['paar Rezepte', 'Ich habe da ein paar tolle Rezepte in meinem alten Buch.'],
  ['bisschen Planung', 'Mit ein bisschen Planung und Geduld kann jeder gute Ergebnisse erzielen.'],
  ['langen Woche', 'Und nach einer langen Woche möchte ich mein Wochenende genießen.'],
  ['langen Haaren', 'Bei langen Haaren oder wenn man an einem heißen Tag unterwegs ist.'],
];
for (const [label, text] of fps) {
  test(`FP ${label} → 0 findings`, () => {
    const s = scopes(text);
    if (s.length !== 0) throw new Error(`got [${s.join(',')}]`);
  });
}

console.log('\n=== a2) 2026-07-12 adverb / infinitive FPs ===');
const fps2 = [
  // Arbeit T2 fail: adverb after und (was: isKnown via spät stem)
  ['später', 'Eltern können ihre Kinder morgens zur Schule bringen und später mit der Arbeit anfangen.'],
  ['später-2', 'Wir treffen uns und später gehen wir essen.'],
  // Arbeit T2 fail: bare infinitive after und (finite glaube+pronoun fix did NOT cover this)
  ['glauben', 'Viele denken an die Zukunft der Arbeit und glauben, dass dies zu mehr Nachhaltigkeit führt.'],
  ['glauben-an', 'Viele Leute kommen und glauben an den Erfolg.'],
  // siblings from same classes
  ['wissen', 'Einige zweifeln noch und wissen, dass es Zeit braucht.'],
  ['versuchen', 'Sie planen den Umbau und versuchen, die Kosten zu senken.'],
  ['abends', 'Die Bibliothek ist tagsüber voll und abends eher ruhig.'],
  ['morgens', 'Viele joggen im Park und morgens vor der Arbeit.'],
];
for (const [label, text] of fps2) {
  test(`FP ${label} → 0 findings`, () => {
    const s = scopes(text);
    if (s.length !== 0) throw new Error(`got [${s.join(',')}]`);
  });
}
test('isKnownGermanNoun(später) false — no spät stem leak', () => {
  if (isKnownGermanNoun('später')) throw new Error('später must not count as noun');
});
test('isKnownGermanNoun(abends) false — no Abend stem leak', () => {
  if (isKnownGermanNoun('abends')) throw new Error('abends must not count as noun');
});

console.log('\n=== b) Genuine lowercase nouns must STILL fire ===');
const tps = [
  ['wohnung', 'Heute ist die wohnung endlich sauber und hell.'],
  ['sicherheitsausrüstung', 'Bitte mit sicherheitsausrüstung arbeiten im Labor.'],
  ['arbeit', 'Ich gehe bei der arbeit immer früh nach Hause.'],
  ['schule', 'Die Kinder sind in der schule bis zum Nachmittag.'],
];
for (const [word, text] of tps) {
  test(`TP ${word} still flagged`, () => {
    const s = scopes(text);
    if (!s.includes(word)) throw new Error(`expected ${word}, got [${s.join(',')}]`);
  });
}

console.log('\n=== c) Coverage: still catch real nouns; do not over-skip ===');
test('der glaube (noun) still flagged — no pronoun after', () => {
  const s = scopes('Für viele Menschen ist der glaube an die Familie sehr wichtig.');
  if (!s.includes('glaube')) throw new Error(`expected glaube, got [${s.join(',')}]`);
});
test('das paar (noun, not ein paar) still flagged', () => {
  const s = scopes('Am Abend kam das paar zu spät in das Restaurant.');
  if (!s.includes('paar')) throw new Error(`expected paar, got [${s.join(',')}]`);
});
test('Lehrer (bare -er agent noun) still flagged when lowercase', () => {
  const s = scopes('Gestern hat der lehrer die Hausaufgaben erklärt.');
  if (!s.includes('lehrer')) throw new Error(`expected lehrer, got [${s.join(',')}]`);
});
test('gelbe Tonne attr adj (prior fix) still suppressed', () => {
  const s = scopes('Bitte die gelbe Tonne am Montag herausstellen.');
  if (s.includes('gelbe')) throw new Error(`gelbe should be skipped, got [${s.join(',')}]`);
});

console.log('\n=== d) Canary staging dir ===');
if (!fs.existsSync(CANARY)) {
  console.log('  (skip — canary dir missing)');
} else {
  const files = fs.readdirSync(CANARY).filter((f) => f.endsWith('.json')).sort();
  let total = 0;
  const byFile = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(CANARY, f), 'utf8'));
    delete raw._rejectedReason;
    delete raw._rejectedGate;
    delete raw._rejectedAt;
    const findings = chk14(raw, f);
    total += findings.length;
    if (findings.length) {
      byFile.push({ f, words: findings.map((x) => x.scope) });
    }
  }
  test(`canary ${files.length} files: CHK-14 findings listed`, () => {
    console.log(`    files=${files.length} totalChk14=${total}`);
    for (const row of byFile) console.log(`    ${row.f}: ${row.words.join(', ')}`);
    if (files.length !== 9) throw new Error(`expected 9 canary files, got ${files.length}`);
  });
  const banned = new Set([
    'brauchen', 'glaube', 'leises', 'kleineren', 'teurere', 'paar', 'später', 'glauben',
  ]);
  test('canary has zero of the 6+2 FP tokens', () => {
    const hit = [];
    for (const row of byFile) {
      for (const w of row.words) {
        if (banned.has(String(w).toLowerCase())) hit.push(`${row.f}:${w}`);
      }
    }
    if (hit.length) throw new Error(`FP tokens still present: ${hit.join('; ')}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
