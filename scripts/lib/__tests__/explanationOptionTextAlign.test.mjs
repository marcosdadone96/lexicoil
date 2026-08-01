#!/usr/bin/env node
/**
 * CHK-34 explanationOptionTextAlign — unit tests.
 * Run: node scripts/lib/__tests__/explanationOptionTextAlign.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import {
  checkExplanationOptionTextAlignQuestion,
  collectExplanationOptionTextAlign,
  extractKeywordProximateQuotes,
  EXPL_OPTION_TEXT_ALIGN_GRADUATION,
} from '../explanationOptionTextAlign.mjs';
import { checkLesenBatchQuality } from '../lesenBatchQuality.mjs';

const OPTS_T5 = [
  'A) Aufbau des Studiums und Modulstruktur',
  'B) Klausuren, Hausarbeiten und Anmeldefristen',
  'C) Pflichten der Studierenden',
  'D) Beurlaubung und Rückmeldung zum Semester',
  'E) Anerkennung externer Leistungen',
  'F) Studienberatung und Mentoring',
  'G) Exmatrikulation und Studienabbruch',
];

// ── Real incident: Lesen B2 T5 Q2 (stale quote after manual option edit) ───
const qT5Bad = {
  id: 'gen-q-5-cdfc084a-2',
  module: 'lesen',
  teil: 5,
  type: 'matching',
  correct: 'B',
  correctAnswer: 'B',
  options: OPTS_T5,
  explanation:
    "Paragraf (32) erläutert die Art der Prüfungsleistungen. Die Überschrift 'Anmeldung zu Modulprüfungen und Abgabefristen' fasst dies zusammen.",
};
const badHit = checkExplanationOptionTextAlignQuestion(qT5Bad);
assert.ok(badHit.blocking.length >= 1, 'T5 Q2 stale quote must block (quote_not_correct)');
assert.match(badHit.blocking[0].message, /CHK-34/);
assert.match(badHit.blocking[0].message, /Modulprüfungen/);

const qT5Fixed = {
  ...qT5Bad,
  explanation:
    "Paragraf (32) erläutert die Art der Prüfungsleistungen. Die Überschrift 'Klausuren, Hausarbeiten und Anmeldefristen' fasst dies zusammen.",
};
const fixedHit = checkExplanationOptionTextAlignQuestion(qT5Fixed);
assert.equal(fixedHit.blocking.length, 0, 'fixed T5 Q2 no blocking');
assert.equal(fixedHit.warnings.length, 0, 'fixed T5 Q2 no warnings');

// ── Blocking: quote equals wrong option letter ─────────────────────────────
const qWrongLetter = {
  id: 'syn-wrong-letter',
  module: 'lesen',
  type: 'matching',
  correct: 'B',
  options: [
    'A) Alpha Titel',
    'B) Beta Titel',
    'C) Gamma Titel',
  ],
  explanation: "Passt zur Überschrift 'Alpha Titel' weil …",
};
const wl = checkExplanationOptionTextAlignQuestion(qWrongLetter);
assert.ok(wl.blocking.some((b) => b.kind === 'quote_wrong_option'), 'wrong option quote CRITICAL path');

// ── Paraphrase without keyword-proximate quotes → no false positive ─────────
const qParaphrase = {
  id: 'syn-paraphrase',
  module: 'lesen',
  type: 'matching',
  correct: 'F',
  options: [
    'A) Digitale Medien: Gefahr für die Psyche?',
    'B) Social Media als Brücke zur Welt',
    'F) Medienkompetenz: Schlüssel zur Wahrheit',
  ],
  explanation:
    'Die Äußerung betont die Notwendigkeit, Quellen kritisch zu hinterfragen, was direkt mit Medienkompetenz als Schlüssel zur Wahrheit korrespondiert.',
};
const para = checkExplanationOptionTextAlignQuestion(qParaphrase);
assert.equal(para.blocking.length, 0, 'paraphrase without quotes: no block');
assert.equal(para.warnings.length, 0, 'paraphrase without Überschrift keyword quotes: no warn');

// Partial quote without proximity keyword (T4-style) — only 'Schlüssel' subquote far from Überschrift
const qPartial = {
  id: 'syn-partial-quote',
  module: 'lesen',
  correct: 'F',
  options: ['F) Medienkompetenz: Schlüssel zur Wahrheit'],
  explanation: "… mit dem Konzept der Medienkompetenz als 'Schlüssel zur Wahrheit' korrespondiert.",
};
const partial = checkExplanationOptionTextAlignQuestion(qPartial);
assert.equal(partial.blocking.length, 0, 'partial quote, no keyword anchor: no block');

// ── Warn-only path: keyword but no quotes (during observation window) ───────
const qWarnOnly = {
  id: 'syn-warn-missing',
  module: 'lesen',
  correct: 'a',
  options: ['a) Montag', 'b) Dienstag', 'c) Mittwoch'],
  explanation: 'Der Text nennt den Wochentag Montag. Option a ist korrekt.',
};
const warn = checkExplanationOptionTextAlignQuestion(qWarnOnly);
assert.equal(warn.blocking.length, 0);
assert.ok(warn.warnings.length >= 1, 'Option keyword without quoted option text → warn');

// ── extractKeywordProximateQuotes smoke ────────────────────────────────────
const prox = extractKeywordProximateQuotes("zur Überschrift 'Social Media als Brücke'");
assert.equal(prox.length, 1);
assert.equal(prox[0].text, 'Social Media als Brücke');

// ── Lesen T2: Satz + passage fragment quotes must not false-positive ────────
const qT2Style = {
  id: 'syn-t2-satz',
  module: 'lesen',
  teil: 2,
  type: 'matching',
  correct: 'B',
  options: [
    'B) Diese bewusste Entscheidung für bestimmte Aktivitäten hilft, den Alltag zu strukturieren.',
    'C) Ein Übermaß an Bildschirmzeit kann die Kreativität hemmen.',
  ],
  explanation:
    "Satz B schließt thematisch an. Die 'bewusste Entscheidung für bestimmte Aktivitäten' passt zur Lücke.",
};
const t2 = checkExplanationOptionTextAlignQuestion(qT2Style);
assert.equal(t2.blocking.length, 0, 'T2 Satz + passage quote not full option body → no block');

// ── Pool-verified B2 Lesen pilots (fixed) must stay clean ───────────────────
const poolFiles = [
  'batches/ready/pool-verified/B2/lesen-t1-gemini-208.json',
  'batches/ready/pool-verified/B2/lesen-t2-gemini-167.json',
  'batches/ready/pool-verified/B2/lesen-t4-gemini-086.json',
  'batches/ready/pool-verified/B2/lesen-t5-gemini-109.json',
];
for (const rel of poolFiles) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const batch = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const align = collectExplanationOptionTextAlign(batch);
  assert.equal(align.blocking.length, 0, `${rel}: no CHK-34 blocking`);
  const q = checkLesenBatchQuality(batch, batch.questions?.[0]?.teil, {
    level: batch.level || 'B2',
  });
  assert.ok(q.ok, `${rel} lesen quality still ok`);
}

assert.ok(EXPL_OPTION_TEXT_ALIGN_GRADUATION.observationDays === 14);
assert.equal(EXPL_OPTION_TEXT_ALIGN_GRADUATION.warnOnlyUntil, '2026-08-10');

console.log('PASS: CHK-34 explanationOptionTextAlign (T5 incident, synthetics, pool B2)');
