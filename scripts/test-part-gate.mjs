#!/usr/bin/env node
/**
 * test-part-gate.mjs — validatePart (partGate.mjs) criterios de aceptación
 *
 *   G1  Parte limpia Lesen T1 → ok:true
 *   G2  CHK-18 explanation corta → ok:false + CHK-18 blocking
 *   G3  CHK-14 sustantivo en minúscula (skipNormalize) → ok:false + CHK-14
 *   G4  Lesen T3 sin ads → ok:false + CHK-17 CRITICAL
 *   G5  CHK-3 conteo parcial (5/6) → ok:false + CHK-3
 *   G6  Paridad: blocking IDs de validatePart === isPartPoolReady (mismo batch)
 *
 * Run: node scripts/test-part-gate.mjs
 */
import { validatePart } from './lib/partGate.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

function blockingIds(gate) {
  return (gate.blocking || []).map((f) => f.id);
}

function makeLesenT1Batch({ shortExplanation = false, lowercaseNoun = false } = {}) {
  const expl = shortExplanation
    ? 'Stimmt so.'
    : 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  const corrects = ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig', 'Falsch'];
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
    passages: [{
      id: 'partgate-p1',
      module: 'lesen',
      teil: 1,
      title: 'Digitaler Alltag',
      text,
    }],
    questions: corrects.map((correct, i) => ({
      id: `partgate-q${i + 1}`,
      module: 'lesen',
      teil: 1,
      type: 'richtig_falsch',
      question: `Aussage ${i + 1}: Die Stadt unterstützt den digitalen Alltag der Bürgerinnen und Bürger.`,
      options: [],
      correct,
      correctAnswer: correct,
      explanation: expl,
      passageId: 'partgate-p1',
    })),
  };
}

function makeLesenT3WithoutAds() {
  const expl = 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  const makeQ = (i, correct) => ({
    id: `partgate-t3-q${i}`,
    module: 'lesen',
    teil: 3,
    type: 'matching',
    question: `Situation ${i}: Jemand sucht einen Kurs am Nachmittag in der Stadt mit freundlicher Betreuung.`,
    options: [],
    correct,
    correctAnswer: correct,
    explanation: expl,
  });
  return {
    passages: [],
    questions: [1, 2, 3, 4, 5, 6, 7].map((i) => makeQ(i, 'A')),
  };
}

function makeLesenT1WrongCount() {
  const batch = makeLesenT1Batch();
  batch.questions = batch.questions.slice(0, 5);
  return batch;
}

async function assertParity(batch, opts, label) {
  const gate = await validatePart(batch, opts);
  const pool = await isPartPoolReady(gate.batch, { semantic: opts.semantic ?? false });
  const gateIds = [...new Set(blockingIds(gate))].sort();
  const poolIds = [...new Set(blockingIds(pool))].sort();
  assert(gate.ok === pool.ok, `${label}: ok coincide (${gate.ok})`);
  assert(
    gateIds.join(',') === poolIds.join(','),
    `${label}: blocking IDs coinciden [${gateIds.join(',')}]`,
  );
}

(async () => {
  console.log('\nG1: Parte limpia Lesen T1 → validatePart ok:true');
  {
    const batch = makeLesenT1Batch();
    const gate = await validatePart(batch, { module: 'lesen', teil: 1 });
    assert(gate.ok, 'ok=true');
    assert(gate.blocking.length === 0, 'blocking vacío');
    await assertParity(batch, { module: 'lesen', teil: 1 }, 'G1 parity');
  }

  console.log('\nG2: CHK-18 explanation corta → ok:false');
  {
    const batch = makeLesenT1Batch({ shortExplanation: true });
    const gate = await validatePart(batch, { module: 'lesen', teil: 1 });
    assert(!gate.ok, 'ok=false');
    assert(blockingIds(gate).includes('CHK-18'), 'CHK-18 en blocking');
    await assertParity(batch, { module: 'lesen', teil: 1 }, 'G2 parity');
  }

  console.log('\nG3: CHK-14 sustantivo en minúscula (batch ya normalizado en terminal) → ok:false');
  {
    const batch = makeLesenT1Batch({ lowercaseNoun: true });
    const gate = await validatePart(batch, {
      module: 'lesen',
      teil: 1,
      skipNormalize: true,
    });
    assert(!gate.ok, 'ok=false con minúsculas sin re-normalizar');
    assert(blockingIds(gate).includes('CHK-14'), 'CHK-14 en blocking');
    await assertParity(batch, { module: 'lesen', teil: 1, skipNormalize: true }, 'G3 parity');
  }

  console.log('\nG4: Lesen T3 sin ads legibles → ok:false + CHK-17 CRITICAL');
  {
    const batch = makeLesenT3WithoutAds();
    const gate = await validatePart(batch, { module: 'lesen', teil: 3 });
    assert(!gate.ok, 'ok=false');
    assert(
      gate.blocking.some((f) => f.id === 'CHK-17' && f.severity === 'CRITICAL'),
      'CHK-17 CRITICAL en blocking',
    );
    await assertParity(batch, { module: 'lesen', teil: 3 }, 'G4 parity');
  }

  console.log('\nG5: CHK-3 conteo parcial (5 ítems en T1) → ok:false');
  {
    const batch = makeLesenT1WrongCount();
    const gate = await validatePart(batch, { module: 'lesen', teil: 1 });
    assert(!gate.ok, 'ok=false');
    assert(
      gate.blocking.some((f) => f.id === 'CHK-3' && f.message.includes('hay 5')),
      'CHK-3 por conteo 5 ≠ 6',
    );
    await assertParity(batch, { module: 'lesen', teil: 1 }, 'G5 parity');
  }

  console.log(`\n══ partGate tests: ${passed} passed, ${failed} failed ══\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
