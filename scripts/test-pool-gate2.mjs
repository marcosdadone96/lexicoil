#!/usr/bin/env node
/**
 * test-pool-gate2.mjs — POOL-2 criterios de aceptación
 *
 *   T1  Parte con CHK-18 inyectado → isPartPoolReady bloqueada
 *   T2  Parte 0/0 limpia → isPartPoolReady ok
 *   T3  CHK-18 + allowFailures → ok=true + aviso rojo en stderr
 *   T4  CHK-18 bloquea en GATE-1 (advisory) pero bloquea en POOL-2
 *   T5  Multi-Teil: schreiben T1 limpio + T2 con IMPORTANT → ok:false (T1 no enmascara T2)
 *   T6  CHK-3 conteo por grupo presente (5 ítems en lesen-T1) sin falsos "Teil ausente"
 *
 * Run: node scripts/test-pool-gate2.mjs
 */
import { isPartPoolReady, isExamPublishable } from './audit-pass-2.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ ${msg}`); failed++; }
}

function makeLesenT1Batch({ shortExplanation = false } = {}) {
  const expl = shortExplanation
    ? 'Stimmt so.'
    : 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  const corrects = ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig', 'Falsch'];
  const text = [
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
  return {
    passages: [{
      id: 'pool2-p1',
      module: 'lesen',
      teil: 1,
      title: 'Digitaler Alltag',
      text,
    }],
    questions: corrects.map((correct, i) => ({
      id: `pool2-q${i + 1}`,
      module: 'lesen',
      teil: 1,
      type: 'richtig_falsch',
      question: `Aussage ${i + 1}: Die Stadt unterstützt den digitalen Alltag der Bürgerinnen und Bürger.`,
      options: [],
      correct,
      correctAnswer: correct,
      explanation: expl,
      passageId: 'pool2-p1',
    })),
  };
}

// ── All tests wrapped in async IIFE (isPartPoolReady is now async) ───────────
(async () => {

// ── T1: CHK-18 → bloqueada ──────────────────────────────────────────────────
console.log('\nT1: Parte con CHK-18 (explanation corta) → isPartPoolReady bloqueada');
{
  const batch = makeLesenT1Batch({ shortExplanation: true });
  const gate = await isPartPoolReady(batch);
  assert(!gate.ok, 'ok=false con CHK-18');
  assert(gate.blocking.some((f) => f.id === 'CHK-18'), 'CHK-18 en blocking[]');
  assert(gate.blocking.length > 0, 'blocking no vacío');
}

// ── T2: 0/0 → ok ─────────────────────────────────────────────────────────────
console.log('\nT2: Parte limpia (0 CRITICAL, 0 IMPORTANT) → isPartPoolReady ok');
{
  const batch = makeLesenT1Batch({ shortExplanation: false });
  const gate = await isPartPoolReady(batch);
  assert(gate.ok, 'ok=true parte limpia');
  assert(gate.blocking.length === 0, 'blocking vacío');
}

// ── T3: allowFailures → ok + aviso rojo ─────────────────────────────────────
console.log('\nT3: allowFailures=true con CHK-18 → ok=true + aviso rojo');
{
  const batch = makeLesenT1Batch({ shortExplanation: true });
  const stderrChunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(String(chunk));
    return orig(chunk, ...rest);
  };
  try {
    const gate = await isPartPoolReady(batch, { allowFailures: true });
    assert(gate.ok, 'ok=true con allowFailures');
    assert(gate.blocking.some((f) => f.id === 'CHK-18'), 'CHK-18 sigue en blocking[]');
    const errText = stderrChunks.join('');
    assert(errText.includes('allow-audit-failures'), 'stderr contiene aviso --allow-audit-failures');
    assert(/\x1b\[31m/.test(errText) || errText.includes('⚠'), 'stderr contiene aviso rojo');
  } finally {
    process.stderr.write = orig;
  }
}

// ── T4: GATE-1 vs POOL-2 — CHK-18 advisory en GATE-1, blocking en POOL-2 ──
console.log('\nT4: CHK-18 es advisory en GATE-1 pero blocking en POOL-2');
{
  const batch = makeLesenT1Batch({ shortExplanation: true });
  const exam = {
    lesenParts: [{
      teil: 1,
      text: batch.passages[0].text,
      textTitle: batch.passages[0].title,
      questions: batch.questions,
    }],
  };
  const gate1 = isExamPublishable(exam);
  const pool2 = await isPartPoolReady(batch);
  assert(!gate1.blocking.some((f) => f.id === 'CHK-18'), 'GATE-1: CHK-18 NO en blocking');
  assert(gate1.advisory.some((f) => f.id === 'CHK-18'), 'GATE-1: CHK-18 en advisory[]');
  assert(!pool2.ok, 'POOL-2: ok=false');
  assert(pool2.blocking.some((f) => f.id === 'CHK-18'), 'POOL-2: CHK-18 SÍ en blocking');
}

function makeSchreibenQuestion(teil, { dirty = false } = {}) {
  const base = teil === 1
    ? 'Schreiben Sie eine E-Mail an Ihre Freundin Maria und erklären Sie Ihre Anmeldung zum Kurs.'
    : 'Schreiben Sie Ihre Meinung zum Thema Freizeit und nennen Sie Vor- und Nachteile.';
  return {
    id: `sch-t${teil}`,
    module: 'schreiben',
    teil,
    type: 'short_answer',
    question: dirty ? `${base} Die Infrastruktur der Stadt ist wichtig.` : base,
    correct: 'rubric',
    correctAnswer: 'rubric',
    explanation: 'Bewertung nach Rubrik mit Vollständigkeit formaler Anrede und sachlichem Inhalt.',
  };
}

// ── T5: multi-Teil — cualquier grupo sucio bloquea el batch ─────────────────
console.log('\nT5: schreiben T1 limpio + T2 con IMPORTANT → ok:false (fallo aislado en T2)');
{
  const batch = {
    questions: [makeSchreibenQuestion(1), makeSchreibenQuestion(2, { dirty: true })],
  };
  const gate = await isPartPoolReady(batch);
  assert(!gate.ok, 'ok=false si cualquier grupo falla');
  assert(gate.blocking.some((f) => f.id === 'CHK-6'), 'CHK-6 IMPORTANT en T2');
  assert(gate.blocking.every((f) => f.file === 'schreiben-t2' || f.scope.includes('sch-t2')), 'blocking solo de T2');
  assert(!gate.blocking.some((f) => f.scope.includes('sch-t1')), 'T1 limpio no aporta blocking');

  const bothClean = await isPartPoolReady({
    questions: [makeSchreibenQuestion(1), makeSchreibenQuestion(2)],
  });
  assert(bothClean.ok, 'T1+T2 limpios → ok=true');
}

// ── T6: CHK-3 conteo del Teil presente, sin exigir Teile ausentes ───────────
console.log('\nT6: CHK-3 evalúa conteo del grupo presente (no exige Teile ausentes)');
{
  const text = `${'Wort '.repeat(150)}`.trim();
  const makeRf = (i) => ({
    id: `lesen-t1-q${i}`,
    module: 'lesen',
    teil: 1,
    type: 'richtig_falsch',
    question: `Aussage ${i}: Die Stadt unterstützt den digitalen Alltag der Bürgerinnen und Bürger.`,
    options: [],
    correct: i % 2 ? 'Falsch' : 'Richtig',
    correctAnswer: i % 2 ? 'Falsch' : 'Richtig',
    explanation: 'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt.',
    passageId: 'lesen-t1-p',
  });

  const wrongCount = {
    passages: [{ id: 'lesen-t1-p', module: 'lesen', teil: 1, title: 'Test', text }],
    questions: [1, 2, 3, 4, 5].map(makeRf),
  };
  const gate = await isPartPoolReady(wrongCount);
  assert(!gate.ok, 'ok=false con conteo incorrecto');
  assert(
    gate.blocking.some((f) => f.id === 'CHK-3' && f.message.includes('hay 5')),
    'CHK-3 por conteo del Teil presente (5 ≠ 6)',
  );
  assert(
    !gate.blocking.some((f) => f.message.includes('Teil ausente')),
    'sin falsos positivos Teil ausente',
  );
}

console.log(`\n══ POOL-2 tests: ${passed} passed, ${failed} failed ══\n`);
process.exit(failed > 0 ? 1 : 0);
})();
