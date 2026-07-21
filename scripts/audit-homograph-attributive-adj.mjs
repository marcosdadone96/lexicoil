#!/usr/bin/env node
/**
 * Audit isHomographNounAfterAttributiveAdj across HOMOGRAPH_RISK verb homographs.
 *   node scripts/audit-homograph-attributive-adj.mjs
 */
import {
  ADJ_NEEDS_ARTICLE_GUARD,
  HOMOGRAPH_RISK,
  MODAL_VERBS,
  capitalizeNounsInText,
} from './lib/capitalizeNouns.mjs';
import { isKnownGermanNoun } from './lib/germanNounLexicon.mjs';

const VERB_LIKE = [
  'zahlen', 'kosten', 'arbeiten', 'erfolgen', 'verursachen', 'posten', 'spielen', 'wissen',
  'essen', 'folgen', 'stellen', 'raten', 'berichten', 'glauben', 'leben', 'lernen', 'kochen',
  'treffen', 'lesen', 'fahren', 'reisen', 'denken', 'sorgen', 'fragen',
];

/** Adjective from ADJ_NEEDS_ARTICLE_GUARD for each homograph test sentence */
/** All adjectives verified ∈ ADJ_NEEDS_ARTICLE_GUARD */
const ADJ_BY_WORD = {
  zahlen: 'wichtige',
  kosten: 'zukünftige',
  arbeiten: 'wichtige',
  erfolgen: 'neue',
  verursachen: 'neue',
  posten: 'wichtige',
  spielen: 'wichtige',
  wissen: 'wichtiges',
  essen: 'wichtiges',
  folgen: 'wichtige',
  stellen: 'wichtige',
  raten: 'gute',
  berichten: 'wichtige',
  glauben: 'wichtiges',
  leben: 'neues',
  lernen: 'wichtiges',
  kochen: 'wichtiges',
  treffen: 'wichtige',
  lesen: 'wichtiges',
  fahren: 'lange',
  reisen: 'zukünftige',
  denken: 'wichtiges',
  sorgen: 'große',
  fragen: 'persönliche',
};

const NON_VERB = [...HOMOGRAPH_RISK].filter((w) => !VERB_LIKE.includes(w));

/** B1 Lesen grammatical verdict when capitalized after attributive adj + modal */
const GRAMMAR_MODAL = {
  reisen: 'CORRECTO',
  kosten: 'CORRECTO',
  fragen: 'CORRECTO',
  treffen: 'CORRECTO',
  sorgen: 'CORRECTO',
  zahlen: 'CORRECTO',
  arbeiten: 'CORRECTO',
  essen: 'CORRECTO',
  spielen: 'CORRECTO',
  leben: 'CORRECTO',
  lernen: 'CORRECTO',
  lesen: 'CORRECTO',
  fahren: 'DUDOSO',
  denken: 'DUDOSO',
  kochen: 'DUDOSO',
  posten: 'DUDOSO',
  wissen: 'DUDOSO',
  folgen: 'FALSO_POSITIV',
  stellen: 'FALSO_POSITIV',
  raten: 'FALSO_POSITIV',
  berichten: 'FALSO_POSITIV',
  glauben: 'FALSO_POSITIV',
  erfolgen: 'FALSO_POSITIV',
  verursachen: 'FALSO_POSITIV',
};

function capForm(word) {
  return word[0].toUpperCase() + word.slice(1);
}

function testModal(word) {
  const adj = ADJ_BY_WORD[word];
  if (!adj || !ADJ_NEEDS_ARTICLE_GUARD.has(adj)) {
    return { error: `adj "${adj}" not in ADJ_NEEDS_ARTICLE_GUARD` };
  }
  const input = `Für ${adj} ${word} möchte sie mehr Zeit haben.`;
  const { result, count } = capitalizeNounsInText(input);
  const capped = new RegExp(`\\b${capForm(word)}\\b`).test(result);
  return { branch: 'adj+modal', input, result, count, capped, knownNoun: isKnownGermanNoun(word) };
}

function testNounNext(word) {
  const adj = ADJ_BY_WORD[word];
  const input = `Für ${adj} ${word} Berlin plant sie eine Route.`;
  const { result, count } = capitalizeNounsInText(input);
  const capped = new RegExp(`\\b${capForm(word)}\\b`).test(result);
  return { branch: 'adj+capNoun', input, result, count, capped, knownNoun: isKnownGermanNoun(word) };
}

function verdict(r, grammar) {
  if (!r.capped) return r.branch === 'adj+modal' && grammar === 'CORRECTO' ? 'MISS' : 'OK_no_cap';
  if (grammar === 'CORRECTO') return 'OK_cap';
  if (grammar === 'DUDOSO') return 'DUDOSO_cap';
  if (grammar === 'FALSO_POSITIV') return 'FALSO_POSITIV';
  return '?';
}

console.log('## Rama adj + verbo modal\n');
console.log('| palabra | frase | ¿cap? | knownNoun | gramática | veredicto |');
console.log('|---------|-------|-------|-----------|-----------|-----------|');

const modalRows = [];
for (const w of VERB_LIKE) {
  const r = testModal(w);
  if (r.error) {
    console.log(`| ${w} | — | — | — | — | ERROR: ${r.error} |`);
    continue;
  }
  const g = GRAMMAR_MODAL[w] || '?';
  const v = verdict(r, g);
  modalRows.push({ w, ...r, grammar: g, verdict: v });
  const flag = v === 'FALSO_POSITIV' ? ' ⚠️' : v === 'MISS' ? ' ↓' : '';
  console.log(`| ${w} | ${r.input} | ${r.capped ? 'SÍ' : 'no'} | ${r.knownNoun} | ${g} | ${v}${flag} |`);
}

console.log('\n## Rama adj + sustantivo capitalizado siguiente\n');
console.log('| palabra | frase | ¿cap? | knownNoun | gramática | veredicto |');
console.log('|---------|-------|-------|-----------|-----------|-----------|');

const nounRows = [];
for (const w of VERB_LIKE) {
  const r = testNounNext(w);
  const g = GRAMMAR_MODAL[w] || '?';
  const v = verdict(r, g);
  nounRows.push({ w, ...r, grammar: g, verdict: v });
  const flag = v === 'FALSO_POSITIV' ? ' ⚠️' : '';
  console.log(`| ${w} | ${r.input} | ${r.capped ? 'SÍ' : 'no'} | ${r.knownNoun} | ${g} | ${v}${flag} |`);
}

const fps = [...modalRows, ...nounRows].filter((r) => r.verdict === 'FALSO_POSITIV');
const fpsUnique = [...new Set(fps.map((r) => r.w))];
const capsModal = modalRows.filter((r) => r.capped).map((r) => r.w);
const capsNoun = nounRows.filter((r) => r.capped).map((r) => r.w);

console.log('\n## Resumen\n');
console.log(`- Verbo-like en HOMOGRAPH_RISK: ${VERB_LIKE.length}`);
console.log(`- No verbales (adv/adj en HOMOGRAPH_RISK): ${NON_VERB.join(', ')}`);
console.log(`- Capitalizan rama modal: ${capsModal.length ? capsModal.join(', ') : '(ninguno)'}`);
console.log(`- Capitalizan rama sustantivo siguiente: ${capsNoun.length ? capsNoun.join(', ') : '(ninguno)'}`);
console.log(`- Falsos positivos (cualquier rama): ${fpsUnique.length ? fpsUnique.join(', ') : '(ninguno)'}`);

console.log('\n## Casos explícitos pedidos\n');
for (const phrase of [
  'Für zukünftige kosten möchte sie sparen.',
  'Für persönliche fragen möchte sie Antworten.',
  'Für wichtige treffen möchte sie vorbereiten.',
  'Für lange fahren möchte sie üben.',
  'Für zukünftige reisen möchte sie planen.',
]) {
  const { result, count } = capitalizeNounsInText(phrase);
  console.log(`- IN:  ${phrase}`);
  console.log(`  OUT: ${result} (caps=${count})`);
}
