#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessT4TopicAlignment } from '../t4TopicAlign.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GEN = path.join(ROOT, 'batches/generated');

function loadBatch(name) {
  return JSON.parse(fs.readFileSync(path.join(GEN, name), 'utf8'));
}

function mkT4({ topicTag, title, intro, signSnippet, debateTopic }) {
  return {
    topicTag,
    debateTopic,
    passages: [{ id: 'p0', title, text: intro, topicTag }],
    questions: Array.from({ length: 7 }, (_, i) => ({
      id: `q${i}`,
      module: 'lesen',
      teil: 4,
      type: 'ja_nein',
      signText: `${signSnippet} Meinung Nummer ${i + 1} mit genug Wörtern für das Gate hier.`,
      question: `Ist Person${i} für den Vorschlag?`,
    })),
  };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log('t4TopicAlign P3 calibration');

// ── Casos límite sintéticos ───────────────────────────────────────────────────
test('Homeoffice + Technik → RECHAZA (debate_mold)', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Homeoffice für alle?',
    intro:
      'Ein wichtiger Vorschlag ist die Einführung einer Homeoffice-Pflicht für Unternehmen. ' +
      'Dies betrifft viele Arbeitnehmer und Familien im Forum.',
    signSnippet: 'Homeoffice ist für mich wichtig wegen der Arbeit und Bürojobs.',
    debateTopic: 'homeoffice',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'debate_mold');
  assert.equal(r.debateId, 'homeoffice');
  assert.equal(r.expected, 'Technik');
});

test('Homeoffice + Arbeit → PASA (mismo debate, tema correcto)', () => {
  const b = mkT4({
    topicTag: 'Arbeit',
    title: 'Forum: Homeoffice für alle?',
    intro:
      'Ein wichtiger Vorschlag ist die Einführung einer Homeoffice-Pflicht für Unternehmen.',
    signSnippet: 'Homeoffice spart mir Zeit beim Pendeln zur Arbeit.',
    debateTopic: 'homeoffice',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
  assert.equal(r.debateId, 'homeoffice');
});

test('4-Tage-Woche + Bildung → RECHAZA', () => {
  const b = mkT4({
    topicTag: 'Bildung',
    title: 'Forum: Vier-Tage-Woche?',
    intro: 'Viele Firmen diskutieren eine Vier-Tage-Woche mit vollem Gehalt für alle Mitarbeiter.',
    signSnippet: 'Weniger Arbeitstage würden mein Leben verbessern.',
    debateTopic: 'vier_tage_woche',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'debate_mold');
});

test('Handy-Schule + Technik → PASA (preferido y afinidad)', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Smartphones in der Schule?',
    intro:
      'Die Schule will Smartphones und Tablets während des Unterrichts verbieten. ' +
      'Eltern und Schüler diskutieren über Apps und digitale Geräte.',
    signSnippet: 'Smartphones und Apps sind wichtig für die digitale Welt.',
    debateTopic: 'handy_schule',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

test('Bibliothek sonntags + Technik → RECHAZA (sin afinidad Technik)', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Bibliothek am Sonntag?',
    intro: 'Die Stadtbibliotheken sollen auch sonntags geöffnet sein für Familien und Besucher.',
    signSnippet: 'Am Sonntag könnte ich endlich Bücher ausleihen oder in Ruhe lesen.',
    debateTopic: 'bibliothek_sonntag',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'debate_mold');
});

test('KI-Regulierung + Technik → PASA', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: KI im Alltag regulieren?',
    intro:
      'Die Stadt diskutiert strengere Regeln für Apps mit künstlicher Intelligenz und Chatbots. ' +
      'Eltern und Schüler sprechen über Algorithmen und digitale Medien.',
    signSnippet: 'KI-Apps sollten klar gekennzeichnet werden, finde ich wichtig.',
    debateTopic: 'ki_regulierung',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

test('Social Media ab 16 + Technik → PASA', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Social Media für Jugendliche einschränken?',
    intro:
      'Apps sollen für Jugendliche unter 16 weniger Benachrichtigungen senden. ' +
      'Das betrifft Smartphones und soziale Medien in der Schule.',
    signSnippet: 'Weniger Benachrichtigungen auf dem Handy wären gut für meine Kinder.',
    debateTopic: 'social_media_16',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

test('Online-Unterricht + Technik → PASA', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Pflicht-Online-Tag an Schulen?',
    intro:
      'In der Stadt wird über Technik und digitale Medien diskutiert. ' +
      'Der Vorschlag: An Schulen soll es mindestens einen Tag pro Woche mit Online-Unterricht geben.',
    signSnippet: 'Ein Online-Tag mit Videokonferenz wäre praktisch für unsere Schule.',
    debateTopic: 'online_unterricht',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

test('Sport in Parks + Freizeit → PASA', () => {
  const b = mkT4({
    topicTag: 'Freizeit',
    title: 'Forum: Mehr Sport in unseren Parks?',
    intro: 'In Stadtparks sollen kostenlose Sport- und Fitnessgeräte aufgestellt werden.',
    signSnippet: 'Mehr Bewegung und Sport im Park ist toll für die Freizeit.',
    debateTopic: 'sport_in_parks',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

// ── Batches reales ────────────────────────────────────────────────────────────
if (fs.existsSync(path.join(GEN, 'lesen-t4-gemini-029.json'))) {
  test('batch 029 tal cual (topicTag Technik + Homeoffice) → RECHAZA', () => {
    const raw = loadBatch('lesen-t4-gemini-029.json');
    const r = assessT4TopicAlignment(raw);
    assert.equal(r.ok, false);
    assert.equal(r.debateId, 'homeoffice');
    assert.equal(r.expected, 'Technik');
  });

  test('batch 029 con topicTag Arbeit (debate coherente) → PASA', () => {
    const raw = loadBatch('lesen-t4-gemini-029.json');
    const r = assessT4TopicAlignment({ ...raw, topicTag: 'Arbeit' });
    assert.equal(r.ok, true);
  });
}

if (fs.existsSync(path.join(GEN, 'lesen-t4-gemini-030.json'))) {
  test('batch 030 tal cual (Technik + Bibliothek/Freizeit intro) → RECHAZA', () => {
    const raw = loadBatch('lesen-t4-gemini-030.json');
    const r = assessT4TopicAlignment(raw);
    assert.equal(r.ok, false);
    assert.equal(r.debateId, 'bibliothek_sonntag');
  });

  test('batch 030 con topicTag Freizeit → PASA', () => {
    const raw = loadBatch('lesen-t4-gemini-030.json');
    const r = assessT4TopicAlignment({ ...raw, topicTag: 'Freizeit' });
    assert.equal(r.ok, true);
  });
}

if (fs.existsSync(path.join(GEN, 'lesen-t4-gemini-028.json'))) {
  test('batch 028 Sport/Parks + Freizeit → PASA (caso positivo)', () => {
    const raw = loadBatch('lesen-t4-gemini-028.json');
    const r = assessT4TopicAlignment(raw);
    assert.equal(r.ok, true);
    assert.equal(r.debateId, 'sport_in_parks');
  });
}

test('Ernährung pedido + intro Gesundheit (adyacente) → PASA', () => {
  const b = mkT4({
    topicTag: 'Ernährung',
    title: 'Forum: Gesundes Essen in der Mensa?',
    intro:
      'Die Schule diskutiert über Gesundheit und Ernährung. Der Vorschlag: vegetarisches Mittagessen ' +
      'für alle Schüler. Viele Eltern und Lehrer sprechen über Medikamente und Fitness.',
    signSnippet: 'Gesundheit ist wichtig, deshalb unterstütze ich den Vorschlag.',
    debateTopic: null,
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

test('Technik pedido + intro Medien (adyacente) → PASA', () => {
  const b = mkT4({
    topicTag: 'Technik',
    title: 'Forum: Weniger Social Media?',
    intro:
      'Die Stadt diskutiert über Medien und Online-Nachrichten. Der Vorschlag betrifft Apps und ' +
      'Smartphones für Jugendliche unter 16.',
    signSnippet: 'Social Media und Apps sollten weniger Benachrichtigungen senden.',
    debateTopic: 'social_media_16',
  });
  const r = assessT4TopicAlignment(b);
  assert.equal(r.ok, true);
});

console.log(`\n${passed} tests passed`);
process.exit(0);
