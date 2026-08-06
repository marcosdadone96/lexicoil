/**
 * lesenT3NamesBank gender fix tests
 * Run: node scripts/lib/__tests__/lesen-t3-seeker-gender.test.mjs
 */
import assert from 'node:assert/strict';
import { replaceLesenT3SeekerName } from '../lesenT3NamesBank.mjs';

function testWalterToHerrKeepsSeiner() {
  const src = 'Herr Walter braucht Hilfe beim Ausfüllen seiner Steuererklärung.';
  const out = replaceLesenT3SeekerName(src, 'Herr Keller', { replaceAnySeeker: true });
  assert.match(out, /Herr Keller/);
  assert.match(out, /\bseiner\b/);
  assert.doesNotMatch(out, /\bHerr\s+\w+.*\bihrer\b/i);
}

function testWalterToFrauGetsIhrer() {
  const src = 'Herr Walter braucht Hilfe beim Ausfüllen seiner Steuererklärung.';
  const out = replaceLesenT3SeekerName(src, 'Frau Vogel', { replaceAnySeeker: true });
  assert.match(out, /Frau Vogel/);
  assert.match(out, /\bihrer Steuererklärung/);
  assert.doesNotMatch(out, /\bHerr\s+\w+/);
}

function testFrauSteinGetsIhrer() {
  const src = 'Frau Stein muss ihre Einkommensteuer erklären und findet dafür kein passendes Angebot in der Liste.';
  const out = replaceLesenT3SeekerName(src, 'Frau Braun', { replaceAnySeeker: true });
  assert.match(out, /Frau Braun/);
  assert.match(out, /\bihre Einkommensteuer/);
}

function testOttSwapOnlyWhenPresent() {
  const src = 'Herr Ott braucht Hilfe beim Ausfüllen seiner Steuererklärung.';
  const out = replaceLesenT3SeekerName(src, 'Frau König');
  assert.match(out, /Frau König/);
  assert.match(out, /\bihrer Steuererklärung/);
}

function testNoSwapNoPossessiveMangle() {
  const src = 'Tobias fährt zum Markt für frische Lebensmittel, sein Drahtesel hat einen Platten.';
  const out = replaceLesenT3SeekerName(src, 'Frau Vogel');
  assert.equal(out, src);
}

let passed = 0;
for (const [name, fn] of [
  ['Walter→Herr Keller keeps seiner', testWalterToHerrKeepsSeiner],
  ['Walter→Frau Vogel → ihrer', testWalterToFrauGetsIhrer],
  ['Frau Stein→Frau Braun keeps ihre', testFrauSteinGetsIhrer],
  ['Ott→Frau König → ihrer', testOttSwapOnlyWhenPresent],
  ['non-seeker untouched', testNoSwapNoPossessiveMangle],
]) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/4 passed`);
