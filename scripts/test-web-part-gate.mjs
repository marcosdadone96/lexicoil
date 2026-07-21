#!/usr/bin/env node
/**
 * test-web-part-gate.mjs — Fase 2: gate web personal chunk (validatePart fail-closed)
 *
 * Simula el path Netlify: gatePersonalExamChunk → validatePart (semantic off en tests rápidos).
 * Casos MALOS deben rechazarse igual que test-part-gate.mjs / terminal.
 *
 * Run: node scripts/test-web-part-gate.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gatePersonalExamChunk } = require('../netlify/functions/lib/webPartGate.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

function makeLesenT1Chunk({ shortExplanation = false, lowercaseNoun = false, wrongCount = false } = {}) {
  const expl = shortExplanation
    ? 'Stimmt so.'
    : 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  const corrects = wrongCount
    ? ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig']
    : ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig', 'Falsch'];
  let text = [
    'Viele Menschen nutzen heute Apps für Einkäufe, Termine und Kommunikation in ihrem Alltag.',
    'Die Stadtverwaltung bietet kostenlose WLAN-Zonen in Bibliotheken, Bürgerbüros und mehreren Parks an.',
    'Eltern finden dort auch Programme für Kinder, die spielerisch Medienkompetenz und Lesen trainieren.',
    'Experten empfehlen, regelmäßig Pausen vom Bildschirm einzulegen und gemeinsam ohne Handy zu essen.',
    'In Workshops erklären Berater, wie man Passwörter sicher verwaltet und persönliche Daten schützt.',
    'Neue Angebote für Senioren helfen beim ersten Schritt in die digitale Welt mit geduldiger Betreuung.',
    'Schüler berichten, dass sie durch Online-Portale schneller Feedback von Lehrkräften erhalten.',
    'Die Gemeinde plant, weitere Stationen zu eröffnen, damit alle Stadtteile gleichermaßen profitieren.',
    'Bürger können Termine online buchen und müssen dafür nicht mehr stundenlang in Warteschlangen stehen.',
    'Kritiker fordern dennoch mehr Datenschutz und transparente Regeln für die Nutzung öffentlicher Netze.',
    'Der Bürgermeister betont, dass digitale Dienste den Alltag erleichtern, wenn alle sie sicher nutzen.',
    'Viele Familien freuen sich über die Möglichkeit, Formulare von zu Hause aus bequem einzureichen.',
    'Die Bibliothek verleiht außerdem Tablets an Menschen, die sich kein eigenes Gerät leisten können.',
    'In den Ferien gibt es spezielle Kurse, in denen Jugendliche lernen, Fake-Nachrichten zu erkennen.',
    'Die Stadt hofft, dass diese Maßnahmen langfristig die Chancengleichheit in der Region verbessern.',
  ].join(' ');
  if (lowercaseNoun) {
    text = text.replace(/\bStadt\b/g, 'stadt').replace(/\bBibliothek\b/g, 'bibliothek');
  }
  return {
    lang: 'de',
    level: 'B1',
    lesenParts: [{
      teil: 1,
      textTitle: 'Digitaler Alltag',
      text,
      questions: corrects.map((correct, i) => ({
        id: `web-q${i + 1}`,
        teil: 1,
        type: 'richtig_falsch',
        question: `Aussage ${i + 1}: Die Stadt unterstützt den digitalen Alltag der Bürgerinnen und Bürger.`,
        options: [],
        correct,
        correctAnswer: correct,
        explanation: expl,
      })),
    }],
  };
}

function makeLesenT3ChunkNoAds() {
  const expl = 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  return {
    lang: 'de',
    level: 'B1',
    lesenParts: [{
      teil: 3,
      instruction: 'Situationen 13–19',
      items: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        id: String(12 + i),
        type: 'matching',
        signText: `Situation ${i}: Jemand sucht einen Kurs am Nachmittag in der Stadt mit freundlicher Betreuung.`,
        correct: 'A',
      })),
      questions: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        id: `web-t3-q${i}`,
        teil: 3,
        type: 'matching',
        question: `Situation ${i}: Jemand sucht einen Kurs am Nachmittag in der Stadt mit freundlicher Betreuung.`,
        options: [],
        correct: 'A',
        correctAnswer: 'A',
        explanation: expl,
      })),
    }],
  };
}

function blockingIds(gate) {
  return (gate.blocking || []).map((f) => f.id);
}

(async () => {
  console.log('\nW0: Chunk limpio Lesen T1 → ok:true + texto normalizado en chunk');
  {
    const parsed = makeLesenT1Chunk();
    const rawText = parsed.lesenParts[0].text;
    const gate = await gatePersonalExamChunk(null, { parsed, chunkTeil: 1, semantic: false });
    assert(gate.ok, 'ok=true');
    assert(gate.chunk?.lesenParts?.[0]?.text, 'chunk devuelto con text');
    assert(gate.batch?.passages?.[0]?.text, 'batch normalizado presente');
    assert(
      gate.chunk.lesenParts[0].text === gate.batch.passages[0].text,
      'chunk.text === batch.passages[0].text (no rawPart)',
    );
  }

  console.log('\nW1: CHK-18 explanation corta → reject');
  {
    const gate = await gatePersonalExamChunk(null, {
      parsed: makeLesenT1Chunk({ shortExplanation: true }),
      chunkTeil: 1,
      semantic: false,
    });
    assert(!gate.ok, 'ok=false');
    assert(blockingIds(gate).includes('CHK-18'), 'CHK-18 en blocking');
  }

  console.log('\nW2: Mayúsculas (Persönlich / stadt) → normalizeBatch corrige → ok:true');
  {
    const parsed = makeLesenT1Chunk({ lowercaseNoun: true });
    parsed.lesenParts[0].text += ' Es ist wichtig, Persönlich zu wachsen und neue Erfahrungen zu sammeln.';
    const gate = await gatePersonalExamChunk(null, { parsed, chunkTeil: 1, semantic: false });
    assert(gate.ok, 'ok=true tras coerce+normalize (Option A Lesen)');
    assert(
      /persönlich/i.test(gate.chunk.lesenParts[0].text) && !/\bPersönlich\b/.test(gate.chunk.lesenParts[0].text),
      'Persönlich→persönlich en chunk devuelto',
    );
    assert(!/ die stadt /.test(gate.chunk.lesenParts[0].text), 'sustantivos capitalizados (stadt→Stadt)');
  }

  console.log('\nW3: Lesen T3 sin ads → reject CHK-17 CRITICAL');
  {
    const gate = await gatePersonalExamChunk(null, {
      parsed: makeLesenT3ChunkNoAds(),
      chunkTeil: 3,
      semantic: false,
    });
    assert(!gate.ok, 'ok=false');
    assert(
      gate.blocking?.some((f) => f.id === 'CHK-17' && f.severity === 'CRITICAL'),
      'CHK-17 CRITICAL',
    );
  }

  console.log('\nW4: CHK-3 conteo 5/6 → reject');
  {
    const gate = await gatePersonalExamChunk(null, {
      parsed: makeLesenT1Chunk({ wrongCount: true }),
      chunkTeil: 1,
      semantic: false,
    });
    assert(!gate.ok, 'ok=false');
    assert(
      gate.blocking?.some((f) => f.id === 'CHK-3' && f.message.includes('hay 5')),
      'CHK-3 conteo 5≠6',
    );
  }

  console.log(`\n══ web part gate tests: ${passed} passed, ${failed} failed ══\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
