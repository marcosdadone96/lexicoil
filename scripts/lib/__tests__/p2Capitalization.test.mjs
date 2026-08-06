#!/usr/bin/env node
/**
 * P2 capitalization — decap + gate scanner.
 * Run: node scripts/lib/__tests__/p2Capitalization.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decapitalizeMidSentence,
  decapitalizeBatchMidSentence,
  capitalizeBatchNouns,
  scanP2CapitalizationViolations,
  scanP2BlockingViolations,
  fixZuInfinitiveCapitals,
  isKnownGermanNoun,
} from '../capitalizeNouns.mjs';
import { getGermanNounLexiconStats } from '../germanNounLexicon.mjs';
import { isPartPoolReady } from '../../audit-pass-2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let passed = 0;
let failed = 0;

function ok(desc) {
  console.log(`  ✅  ${desc}`);
  passed++;
}
function fail(desc, detail = '') {
  console.error(`  ❌  ${desc}`);
  if (detail) console.error(`       ${detail}`);
  failed++;
}
function assertEq(desc, actual, expected) {
  if (actual === expected) ok(desc);
  else fail(desc, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertNoMatch(desc, text, pattern) {
  if (!pattern.test(text)) ok(desc);
  else fail(desc, `still matches ${pattern}`);
}
function assertMatch(desc, text, pattern) {
  if (pattern.test(text)) ok(desc);
  else fail(desc, `expected match ${pattern}`);
}
function assertGt(desc, n, min) {
  if (n > min) ok(desc);
  else fail(desc, `expected > ${min}, got ${n}`);
}

function assertEqLen(desc, arr, n) {
  if (arr.length === n) ok(desc);
  else fail(desc, `expected length ${n}, got ${arr.length}: ${arr.map((v) => v.word).join(', ')}`);
}

function normalizeCapitalizationBatch(batch) {
  const { batch: decapped } = decapitalizeBatchMidSentence(batch);
  const { batch: capitalized } = capitalizeBatchNouns(decapped);
  return capitalized;
}

function blockingOnly(text) {
  return scanP2BlockingViolations(text);
}

console.log('\n── P2 zu + infinitivo ──');

{
  const { result } = decapitalizeMidSentence(
    'Ich plane auch, einen Kurs zu Besuchen, um meine alten Hobbys wiederzuentdecken.',
  );
  assertMatch('157: zu Besuchen → zu besuchen', result, /zu besuchen/i);
  assertNoMatch('157: no zu Besuchen', result, /zu Besuchen/);
}

{
  const { result } = fixZuInfinitiveCapitals('Museen zu Besuchen und neue Küchen zu probieren.');
  assertMatch('069: zu Besuchen', result, /zu besuchen/i);
}

{
  const { result } = fixZuInfinitiveCapitals('Die Bibliothek zu Besuchen ist wichtig.');
  assertMatch('030 signText pattern', result, /zu besuchen/i);
}

{
  const { result } = fixZuInfinitiveCapitals('Sie tragen dazu bei, weniger Strom zu Verbrauchen.');
  assertMatch('077: zu Verbrauchen', result, /zu verbrauchen/i);
}

{
  const { result } = fixZuInfinitiveCapitals('gemeinsam Gerichte zu Kochen.');
  assertMatch('068: zu Kochen', result, /zu kochen/i);
}

// False positives — must NOT change
{
  const s = 'Viele arbeiten zu Hause und gehen zu Terminen am Morgen.';
  const { result, count } = decapitalizeMidSentence(s);
  assertEq('FP: zu Hause unchanged', result, s);
  assertEq('FP: zu Hause count 0', count, 0);
}

{
  const s = 'Das Programm bietet Kurse zu Programmen in der Stadt.';
  const { result } = fixZuInfinitiveCapitals(s);
  assertMatch('FP: zu Programmen stays', result, /zu Programmen/);
}

console.log('\n── P2 cardinales ──');

{
  const { result } = decapitalizeMidSentence(
    'Bei Regenperioden von mehr als Zwei Tagen ist das Gießen verboten.',
  );
  assertMatch('029: Zwei Tagen → zwei', result, /zwei Tagen/);
  assertNoMatch('029: no Zwei Tagen', result, /Zwei Tagen/);
}

{
  const { result } = decapitalizeMidSentence('Im Kartenspiel gewinnt oft die Vier.');
  assertEq('FP: die Vier (substantivised)', result, 'Im Kartenspiel gewinnt oft die Vier.');
}

console.log('\n── P2 adjetivos/adverbios ──');

{
  const { result } = decapitalizeMidSentence(
    'Besonders Junge Menschen finden Smart-Home praktisch.',
  );
  assertMatch('072: Junge → junge', result, /junge Menschen/i);
}

{
  const { result } = decapitalizeMidSentence('Das System läuft Sicher installiert und stabil.');
  assertMatch('075: Sicher → sicher', result, /sicher installiert/i);
}

{
  const { result } = decapitalizeMidSentence('Der Eintritt ist Nötig für alle Gäste.');
  assertMatch('048-style: Nötig → nötig', result, /nötig für/i);
}

{
  const { result } = decapitalizeMidSentence('Der Park ist Zugänglich für Rollstuhlfahrer.');
  assertMatch('080-style: Zugänglich → zugänglich', result, /zugänglich für/i);
}

{
  const s = 'Der Junge spielt im Garten.';
  const { result } = decapitalizeMidSentence(s);
  assertEq('FP: der Junge (noun) unchanged', result, s);
}

console.log('\n── P2 pilot escapes (T2 Gleich, T4 Verursachen) ──');

{
  const bad = 'Die Zahl ist Gleich geblieben.';
  const { result } = decapitalizeMidSentence(bad);
  assertMatch('pilot T2: Gleich → gleich', result, /ist gleich geblieben/i);
  assertEq('pilot T2 gate clean', blockingOnly(result).length, 0);
}

{
  const bad = 'Probleme für die Familie Verursachen könnte.';
  const { result } = decapitalizeMidSentence(bad);
  assertMatch('pilot T4: Verursachen könnte → verursachen', result, /verursachen könnte/i);
  assertNoMatch('pilot T4: no capital Verursachen', result, /\bVerursachen\b/);
  assertEq('pilot T4 gate clean', blockingOnly(result).length, 0);
}

console.log('\n── P2 false positives (nouns stay capital) ──');

{
  const s = 'Das Essen schmeckt gut und das Lernen macht Spaß.';
  const { result } = decapitalizeMidSentence(s);
  assertEq('FP: das Essen / das Lernen', result, s);
}

{
  const s = 'Der Junge spielt im Garten.';
  const { result } = decapitalizeMidSentence(s);
  assertEq('FP: der Junge', result, s);
}

{
  const s = 'Viele arbeiten zu Hause und gehen zu Terminen am Morgen.';
  const { result } = decapitalizeMidSentence(s);
  assertEq('FP: zu Hause / zu Terminen', result, s);
}

console.log('\n── P2 pilot batches (raw → decap → gate) ──');

const PILOT = [
  'batches/generated/pilot-gate-control/pilot-t2-freizeit.json',
  'batches/generated/pilot-gate-control/pilot-t4-technik.json',
];

for (const rel of PILOT) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const q2a = raw.questions?.find((q) => String(q.question || '').includes('Grünanlagen'))?.options?.[0];
  if (q2a && /Gleich/.test(q2a)) {
    const v = blockingOnly(q2a);
    assertGt(`${path.basename(rel)}: gate catches Gleich in q2 opt a`, v.length, 0);
    const { batch: fixed } = decapitalizeBatchMidSentence(raw);
    const q2fixed = fixed.questions?.find((q) => String(q.question || '').includes('Grünanlagen'))?.options?.[0];
    assertNoMatch(`${path.basename(rel)}: Gleich fixed`, q2fixed || '', /Gleich/);
  }
  const maxExpl = raw.questions?.find((q) => String(q.question || '').includes('Max'))?.explanation;
  if (maxExpl && /Verursachen/.test(maxExpl)) {
    const v = blockingOnly(maxExpl);
    assertGt(`${path.basename(rel)}: gate catches Verursachen in explanation`, v.length, 0);
    const { batch: fixed } = decapitalizeBatchMidSentence(raw);
    const maxFixed = fixed.questions?.find((q) => String(q.question || '').includes('Max'))?.explanation;
    assertNoMatch(`${path.basename(rel)}: Verursachen fixed`, maxFixed || '', /Verursachen/);
  }
}

console.log('\n── P2 gate scanner ──');

{
  const bad = 'Sie plant, einen Kurs zu Besuchen.';
  const v = scanP2CapitalizationViolations(bad);
  assertGt('gate catches zu Besuchen', v.filter((x) => x.type === 'zu_infinitive').length, 0);
  const fixed = decapitalizeMidSentence(bad).result;
  assertEq('gate clean after decap', blockingOnly(fixed).length, 0);
}

{
  const bad = 'Es gilt für Zwei Wochen.';
  const v = blockingOnly(bad);
  assertGt('gate catches Zwei', v.length, 0);
}

console.log('\n── P2 hybrid whitelist (C1 noun OK, unknown → advisory) ──');

{
  const stats = getGermanNounLexiconStats();
  assertGt('noun lexicon size ≥ 900', stats.size, 899);
}

{
  assertEq('Nachhaltigkeit is known noun', isKnownGermanNoun('Nachhaltigkeit'), true);
  const s = 'Die Gärten tragen zur Nachhaltigkeit in der Stadt bei.';
  assertEqLen('Nachhaltigkeit mid-sentence: no block', blockingOnly(s), 0);
}

{
  const s = '… könnte ein seltenes Wort wie Xylophonium bedeuten.';
  const blocks = blockingOnly(s);
  const advisories = scanP2CapitalizationViolations(s).filter((v) => v.severity === 'advisory');
  assertEqLen('invented noun: no block', blocks, 0);
  assertGt('invented noun: advisory only', advisories.length, 0);
}

console.log('\n── P2 pilot false-positive guard (3 JSON, blocking only) ──');

const PILOT_ALL = [
  'batches/generated/pilot-gate-control/pilot-t1-technik.json',
  'batches/generated/pilot-gate-control/pilot-t2-freizeit.json',
  'batches/generated/pilot-gate-control/pilot-t4-technik.json',
];

const PILOT_NOUNS_MUST_PASS = [
  /Gemeinschaftsgärten/i,
  /Brettspiele/i,
  /Bildschirmzeit/i,
  /Verfasserin/i,
  /Nachhaltigkeit/i,
];

function collectBatchTexts(obj, out = []) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((x) => collectBatchTexts(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => collectBatchTexts(x, out));
  return out;
}

for (const rel of PILOT_ALL) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`pilot exists: ${rel}`, 'missing');
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const texts = collectBatchTexts(raw);

  for (const pat of PILOT_NOUNS_MUST_PASS) {
    const matching = texts.filter((t) => pat.test(t));
    if (!matching.length) continue;
    for (const t of matching) {
      const word = t.match(pat)?.[0] || pat.source;
      assertEqLen(`${path.basename(rel)}: «${word}» → no block`, blockingOnly(t), 0);
    }
  }
}

console.log('\n── P2 batches reales (decap + gate) ──');

const BATCHES = [
  'batches/generated/lesen-t1-gemini-157.json',
  'batches/generated/lesen-t2-gemini-069.json',
  'batches/generated/lesen-t4-gemini-030.json',
  'batches/generated/lesen-t2-gemini-077.json',
  'batches/generated/lesen-t4-gemini-029.json',
];

for (const rel of BATCHES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`batch exists: ${rel}`, 'missing');
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const beforeGate = await isPartPoolReady(raw, { semantic: false });
  const chk14Before = (beforeGate.blocking || []).filter((f) => f.id === 'CHK-14').length;

  const { totalFixed } = decapitalizeBatchMidSentence(raw);
  const normalized = normalizeCapitalizationBatch(raw);
  const afterGate = await isPartPoolReady(normalized, { semantic: false });
  const chk14After = (afterGate.blocking || []).filter((f) => f.id === 'CHK-14').length;

  ok(`${path.basename(rel)}: decap fixed ${totalFixed} token(s)`);
  if (chk14Before > 0 && chk14After === 0) {
    ok(`${path.basename(rel)}: CHK-14 ${chk14Before} → 0 after normalize`);
  } else if (chk14Before > 0 && chk14After < chk14Before) {
    ok(`${path.basename(rel)}: CHK-14 ${chk14Before} → ${chk14After} after normalize`);
  } else if (chk14Before > 0) {
    fail(`${path.basename(rel)}: CHK-14 still ${chk14After} after normalize (was ${chk14Before})`);
  } else {
    ok(`${path.basename(rel)}: no CHK-14 before (already clean or other checks)`);
  }

  // Gate must catch raw defects if we inject one
  const injected = JSON.parse(JSON.stringify(raw));
  if (injected.passages?.[0]?.text) {
    injected.passages[0].text += ' Extra zu Besuchen.';
    const injGate = await isPartPoolReady(injected, { semantic: false });
    const caught = (injGate.blocking || []).some(
      (f) => f.id === 'CHK-14' && String(f.message).includes('zu'),
    );
    if (caught) ok(`${path.basename(rel)}: gate blocks injected zu Besuchen`);
    else fail(`${path.basename(rel)}: gate missed injected zu Besuchen`);
  }
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
