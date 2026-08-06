#!/usr/bin/env node
/**
 * SP-1 — closed list of Sprechen text corrections + normalizeBatch.
 * Run: node scripts/sp1-apply-sprechen-text-fixes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBatch } from './lib/normalizeBatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function save(rel, batch) {
  fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
}

function qByTeil(batch, teil) {
  return batch.questions.find((q) => Number(q.teil) === teil);
}

function applyAndNormalize(rel, mutator) {
  const raw = load(rel);
  mutator(raw);
  const normalized = normalizeBatch(raw, { module: 'sprechen', lang: 'de', level: 'B1' });
  save(rel, normalized);
  console.log(`OK ${rel}`);
  return normalized;
}

applyAndNormalize('batches/generated/sprechen-gemini-001.json', (j) => {
  const t1 = qByTeil(j, 1);
  t1.question = t1.question.replace(
    'Budgetplanung: Was darf es kosten? Haben Sie Angst, dass es am Ende doch viel zu teurer wird?',
    'Budgetplanung: Was darf das Fest kosten?',
  );
  const t3 = qByTeil(j, 3);
  t3.question = t3.question
    .replace(
      'Im Anschluss stelle ich Ihnen noch 2-3 Fragen zum Thema.',
      'Beantworten Sie anschließend 2-3 Fragen zum Thema.',
    )
    .replace(
      [
        'Beispielfragen:',
        'Welche Fortschritte sehen Sie in der Organisation von Kulturfesten in Ihrer Heimatstadt im Vergleich zu früher?',
        'Wenn Sie einen neuen Entwurf für ein Kulturfest planen könnten, was wäre Ihnen dabei besonders wichtig und warum?',
        'Glauben Sie, dass Ihnen während Ihrer Präsentation etwas Wichtiges entgangen ist, das Sie jetzt noch hinzufügen möchten?',
      ].join('\n'),
      [
        'Beispielfragen:',
        'Welche Kulturfeste in Ihrer Heimatstadt besuchen Sie am liebsten?',
        'Was ist bei einem Kulturfest für Sie besonders wichtig?',
        'Sollten Kulturfeste kostenlos sein? Warum (nicht)?',
      ].join('\n'),
    );
});

applyAndNormalize('batches/generated/sprechen-gemini-003.json', (j) => {
  const t1 = qByTeil(j, 1);
  t1.question = t1.question.replace(
    'Wer wird eingeladen? (Denken Sie auch an Freunde, die vielleicht nicht mehr wissen, dass sie noch ledig ist.)',
    'Wer wird eingeladen?',
  );
  const t2 = qByTeil(j, 2);
  t2.question = t2.question
    .replace('bei der Verkehrsnetz und Versorgungseinrichtungen', 'beim Verkehr und bei den Einkaufsmöglichkeiten')
    .replace('oder was ist übrig, wenn Sie auf dem Land sind?', 'und was fehlt Ihnen vielleicht auf dem Land?');
  const t3 = qByTeil(j, 3);
  t3.question = t3.question
    .replace(
      'Danach stelle ich Ihnen ein paar Fragen zum Thema, die Sie bitte begründen.',
      'Beantworten Sie danach ein paar Fragen zum Thema und begründen Sie Ihre Antworten.',
    )
    .replace(
      'auch wenn der Umzug oft kompliziert und die Wohnungssuche schwer abgewickelt werden muss',
      'auch wenn der Umzug und die Wohnungssuche oft kompliziert sind',
    );
});

applyAndNormalize('batches/generated/sprechen-gemini-005.json', (j) => {
  const t1 = qByTeil(j, 1);
  t1.question = [
    'Sie haben gehört, dass das Jugendzentrum in Ihrer Stadt dringend neue Sportgeräte benötigt. Sie möchten eine Spendenaktion organisieren, um Geld dafür zu sammeln. Sprechen Sie darüber, wie Sie diese Aktion gemeinsam planen können. Machen Sie Vorschläge, reagieren Sie darauf und einigen Sie sich auf die wichtigsten Punkte.',
    '',
    'Diskutieren Sie folgende Punkte:',
    'Was für eine Art von Spendenaktion wollen wir organisieren? (z.B. Kuchenverkauf, Flohmarkt, Spendenlauf)',
    'Wer soll die Aktion unterstützen und wie können wir Helfer finden?',
    'Wo und wann soll die Aktion stattfinden? Sollen wir Räume anfragen?',
    'Wie können wir die Aktion bekannt machen, damit viele Leute kommen?',
    'Wie teilen wir die Aufgaben auf?',
  ].join('\n');
  const t2 = qByTeil(j, 2);
  t2.question = t2.question.replace(
    'Wie beeinflussen sie die persönliche Reputation?',
    'Wie beeinflussen sie das Bild, das andere von uns haben?',
  );
  const t3 = qByTeil(j, 3);
  t3.question = t3.question
    .replace(
      'Stellen Sie anschließend 2-3 Fragen zum Thema der Präsentation, um die Kandidaten zu einer Begründung einzuladen.',
      'Stellen Sie anschließend 2-3 Fragen zum Thema der Präsentation.',
    )
    .replace(
      'Glauben Sie, dass die Gesetzgebung rechts genug ist, um die Nutzer vor den negativen Aspekten wie Cybermobbing oder Datenschutzverletzungen zu schützen?',
      'Glauben Sie, dass die Gesetze die Nutzer gut genug vor Problemen wie Cybermobbing schützen?',
    );
});

applyAndNormalize('batches/generated/sprechen-gemini-008.json', (j) => {
  const t2 = qByTeil(j, 2);
  t2.question = t2.question.replace(
    'Präsentieren Sie ein Thema aus dem Bereich Freizeit und Sport.',
    'Halten Sie eine kurze Präsentation zum Thema \u201EEin beliebter Freizeitkurs in meinem Heimatland\u201C (z.B. Sportkurs, Kochkurs, Tanzkurs).',
  );
  const t3 = qByTeil(j, 3);
  t3.question = t3.question
    .replace('Hier sind Beispielfragen für den Prüfer:', 'Beispielfragen:')
    .replace(
      'Warum ist für Sie die individuelle Vorbereitung bei diesem Hobby so wichtig?',
      'Würden Sie diesen Kurs auch in Deutschland besuchen? Warum (nicht)?',
    );
  t3.explanation = t3.explanation
    .replace(', Hörverstehen.', '.')
    .replace('Hörverstehen, ', '')
    .replace(', Hörverstehen', '')
    .replace(/\bHörverstehen\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
  if (!t3.explanation.endsWith('.')) t3.explanation += '.';
});

applyAndNormalize('batches/merged/sprechen-stadtfest-planung-01.json', (j) => {
  const t1 = qByTeil(j, 1);
  t1.explanation = t1.explanation.replace(
    'Aufgabenbewältigung (Einigung auf mindestens 3 Punkte)',
    'Aufgabenbewältigung (alle Punkte ansprechen und sich einigen)',
  );
});

const muestras = path.join(ROOT, 'para-claude-verificacion/muestras-sprechen-auditoria-2026-07-10');
if (fs.existsSync(muestras)) {
  for (const f of [
    'sprechen-gemini-001.json',
    'sprechen-gemini-003.json',
    'sprechen-gemini-005.json',
    'sprechen-gemini-008.json',
    'sprechen-stadtfest-planung-01.json',
  ]) {
    const src = f.includes('stadtfest')
      ? path.join(ROOT, 'batches/merged', f)
      : path.join(ROOT, 'batches/generated', f);
    fs.copyFileSync(src, path.join(muestras, f));
    console.log(`synced muestras/${f}`);
  }
}

console.log('SP-1 done');
