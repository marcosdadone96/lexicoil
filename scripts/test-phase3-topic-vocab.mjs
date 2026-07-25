#!/usr/bin/env node
/**
 * test-phase3-topic-vocab.mjs — Fase 3: tema cerrado + vocab preferencia + filtro CEFR + gate
 *
 *   P1  Lista canónica B1 (16 temas incl. Medien)
 *   P2  Prompt incluye bloque VOCABULARIO SUGERIDO + OMÍTELA
 *   P3  --topic Umwelt resuelve tema cerrado; inválido falla
 *   P4  Filtro CEFR: Klimawandel → prompted; Epistemologie → excluded (blacklist/C1)
 *   P5  Batch sintético Umwelt + vocab → pasa validatePart + feedback used/notUsed
 *   P6  Paridad gate: batch con topicTag/vocabFeedback igual que batch normal
 *
 * Run: node scripts/test-phase3-topic-vocab.mjs
 */
import { B1_TOPICS, isValidB1Topic } from './lib/b1Topics.mjs';
import { classifyUserVocab } from './lib/vocabPrefilter.mjs';
import { buildLesenPrompt } from './lib/lesenTemplatePrompt.mjs';
import { injectTopicIntoPrompt } from './lib/topicRotation.mjs';
import { resolveGenerationVocab, resolveTargetWordsForArgs } from './lib/resolveGenerationInput.mjs';
import { computeVocabFeedback, formatVocabFeedbackSummary } from './lib/generationFeedback.mjs';
import { validatePart } from './lib/partGate.mjs';
import { isPartPoolReady } from './audit-pass-2.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function makeUmweltLesenT1Batch() {
  const expl =
    'Im Text steht eindeutig, dass diese Aussage mit dem Inhalt des Passages übereinstimmt und korrekt ist.';
  const text = [
    'In unserer Stadt gibt es seit zwei Jahren ein neues Programm für den Klimawandel.',
    'Viele Familien lernen dort, wie sie im Alltag Energie sparen und weniger Plastik benutzen können.',
    'Die Stadtverwaltung erklärt in Workshops, warum Mülltrennung wichtig ist und wie jeder Haushalt mitmachen kann.',
    'In den Schulen besuchen Kinder Ausstellungen über erneuerbare Energie und pflanzen Bäume im Stadtpark.',
    'Meine Nachbarin sagt, dass sie durch die Mülltrennung jeden Monat deutlich weniger Restmüll produziert.',
    'Im Supermarkt gibt es inzwischen mehr Produkte ohne unnötige Verpackung, was viele Kunden freut.',
    'Experten berichten, dass kleine Veränderungen im Haushalt langfristig viel für die Umwelt bewirken.',
    'Die Gemeinde plant, zusätzliche Fahrradwege zu bauen, damit weniger Menschen mit dem Auto fahren.',
    'In Vereinen tauschen Bewohner Kleidung und Spielzeug, statt alles sofort wegzuwerfen.',
    'Kritiker meinen, die Maßnahmen seien noch zu langsam, aber die meisten Bürger unterstützen das Projekt.',
    'Jugendliche organisieren Clean-up-Aktionen an Flüssen und sammeln dort Plastik und anderen Abfall.',
    'Die Stadtverwaltung veröffentlicht jedes Quartal einen kurzen Bericht über erreichte Umweltziele.',
    'Viele Unternehmen spenden Material für die Aktionen und informieren Mitarbeitende über Nachhaltigkeit.',
    'Am Wochenende finden regelmäßig Märkte statt, auf denen regionale Lebensmittel ohne Plastik verkauft werden.',
    'Ich finde, dass solche Angebote zeigen, wie man den Klimawandel im Alltag konkret angehen kann.',
  ].join(' ');
  const corrects = ['Richtig', 'Falsch', 'Richtig', 'Falsch', 'Richtig', 'Falsch'];
  return {
    passages: [
      {
        id: 'phase3-p1',
        module: 'lesen',
        teil: 1,
        title: 'Umweltaktionen in der Stadt',
        text,
        topicTag: 'Umwelt',
      },
    ],
    questions: corrects.map((correct, i) => ({
      id: `phase3-q${i + 1}`,
      module: 'lesen',
      teil: 1,
      type: 'richtig_falsch',
      question: `Aussage ${i + 1}: Die Stadt informiert die Bürger über Umweltthemen und praktische Maßnahmen.`,
      options: [],
      correct,
      correctAnswer: correct,
      explanation: expl,
      passageId: 'phase3-p1',
      lang: 'de',
      level: 'B1',
    })),
  };
}

async function assertGateParity(batch, opts, label) {
  const gate = await validatePart(batch, opts);
  const pool = await isPartPoolReady(batch, opts);
  assert(gate.ok === pool.ok, `${label}: validatePart ok === isPartPoolReady ok (${gate.ok}/${pool.ok})`);
  if (gate.ok) {
    assert(gate.blocking.length === 0, `${label}: sin blocking`);
  }
  return gate;
}

(async () => {
  console.log('\n══ Fase 3 — topic + vocab (preferencia) ══\n');

  console.log('P1: Lista canónica B1 (desplegable)');
  {
    assert(B1_TOPICS.length === 16, `16 temas canónicos (got ${B1_TOPICS.length})`);
    assert(B1_TOPICS.includes('Medien'), 'incluye Medien');
    assert(B1_TOPICS.includes('Umwelt'), 'incluye Umwelt');
    assert(isValidB1Topic('Umwelt'), 'Umwelt válido');
    assert(!isValidB1Topic('Klimawandel'), 'Klimawandel no es tema (solo vocab)');
    console.log('     Temas:', B1_TOPICS.join(', '));
  }

  console.log('\nP2: Prompt con vocab preferencia');
  {
    const words = ['Klimawandel', 'Mülltrennung'];
    let prompt = buildLesenPrompt(1, words);
    prompt = injectTopicIntoPrompt(prompt, 'Umwelt');
    assert(prompt.includes('VOCABULARIO SUGERIDO'), 'bloque VOCABULARIO SUGERIDO');
    assert(/OMÍTELA|OMITELA/i.test(prompt), 'instrucción OMÍTELA');
    assert(prompt.includes('Klimawandel') && prompt.includes('Mülltrennung'), 'lista de palabras en prompt');
    assert(prompt.includes('TEMA OBLIGATORIO') && prompt.includes('Umwelt'), 'tema inyectado');
  }

  console.log('\nP3: resolveGenerationVocab — topic cerrado');
  {
    const ok = resolveGenerationVocab(
      { lang: 'de', level: 'B1', words: ['Klimawandel'], topic: 'Umwelt' },
      { module: 'lesen', teil: 1 },
    );
    assert(ok.topic === 'Umwelt', 'topic=Umwelt resuelto');
    assert(ok.words.includes('Klimawandel'), 'Klimawandel en prompted');
    let threw = false;
    try {
      resolveGenerationVocab(
        { lang: 'de', level: 'B1', words: ['Test'], topic: 'InvalidTopic' },
        { module: 'lesen', teil: 1 },
      );
    } catch (_) {
      threw = true;
    }
    assert(threw, 'topic inválido lanza error');
    const args = { lang: 'de', level: 'B1', words: ['Klimawandel'], topic: 'Umwelt', teil: 1 };
    resolveTargetWordsForArgs(args, { module: 'lesen', teil: 1 });
    assert(args._resolvedTopic === 'Umwelt', 'resolveTargetWords muta args._resolvedTopic');
  }

  console.log('\nP4: Filtro CEFR previo');
  {
    const r = classifyUserVocab(['Klimawandel', 'Mülltrennung', 'Epistemologie'], {
      lang: 'de',
      level: 'B1',
    });
    assert(r.prompted.includes('Klimawandel'), 'Klimawandel pasa al generador');
    assert(r.prompted.includes('Mülltrennung'), 'Mülltrennung pasa (con aviso unknown)');
    assert(!r.prompted.includes('Epistemologie'), 'Epistemologie NO va al generador');
    assert(r.excluded.some((e) => e.word === 'Epistemologie'), 'Epistemologie marcada excluida');
    assert(r.warnings.some((w) => w.word === 'Mülltrennung'), 'Mülltrennung aviso unknown');
  }

  console.log('\nP5: Batch Umwelt + vocab → gate + feedback');
  {
    const requested = ['Klimawandel', 'Mülltrennung', 'Epistemologie'];
    const pre = classifyUserVocab(requested, { lang: 'de', level: 'B1' });
    const batch = makeUmweltLesenT1Batch();
    const feedback = computeVocabFeedback(batch, requested, {
      topic: 'Umwelt',
      prompted: pre.prompted,
      excluded: pre.excluded,
    });
    const batchWithMeta = { ...batch, userVocabFeedback: feedback, targetUsage: feedback.targetUsage };

    assert(feedback.used.includes('Klimawandel'), 'feedback: Klimawandel usada naturalmente');
    assert(feedback.used.includes('Mülltrennung'), 'feedback: Mülltrennung usada naturalmente');
    assert(feedback.notUsed.includes('Epistemologie'), 'feedback: Epistemologie no usada');
    console.log('     ', formatVocabFeedbackSummary(feedback));

    const gate = await assertGateParity(
      batchWithMeta,
      { module: 'lesen', teil: 1, skipNormalize: true },
      'P5 Umwelt batch',
    );
    assert(gate.ok, 'batch Umwelt+vocab pasa validatePart');
  }

  console.log('\nP6: Paridad gate — batch normal vs batch con metadata Fase 3');
  {
    const normal = makeUmweltLesenT1Batch();
    const withMeta = {
      ...makeUmweltLesenT1Batch(),
      topicTag: 'Umwelt',
      userVocabFeedback: {
        used: ['Klimawandel'],
        notUsed: ['Epistemologie'],
        requested: ['Klimawandel', 'Epistemologie'],
      },
    };
    const g1 = await validatePart(normal, { module: 'lesen', teil: 1, skipNormalize: true });
    const g2 = await validatePart(withMeta, { module: 'lesen', teil: 1, skipNormalize: true });
    assert(g1.ok && g2.ok, 'ambos batches pasan gate');
    assert(g1.ok === g2.ok, 'mismo resultado ok con/sin metadata Fase 3');
  }

  console.log(`\n══ Fase 3 tests: ${passed} passed, ${failed} failed ══\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
