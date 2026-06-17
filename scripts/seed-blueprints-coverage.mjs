#!/usr/bin/env node
/**
 * Phase 13a/13b — seed blueprints for all lang×level pairs + task fidelity modules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BP = path.join(ROOT, 'library', 'blueprints');

const GOETHE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CAMBRIDGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DELE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function schreibenParts(count, level) {
  const words = { A1: 40, A2: 60, B1: 80, B2: 120, C1: 180, C2: 220 };
  const w = words[level] || 80;
  const labels = [
    { label: 'Formular / Kurze Nachricht', taskTypes: ['form_fill', 'informal_message'] },
    { label: 'E-Mail / Forumbeitrag', taskTypes: ['email', 'forum_post'] },
    { label: 'Argumentativer Text', taskTypes: ['opinion_email', 'argumentative_essay'] },
  ];
  return labels.slice(0, count).map((l, i) => ({
    teil: i + 1,
    slotType: 'writing_task',
    label: l.label,
    instruction: 'Schreiben Sie einen Text zu der folgenden Aufgabe.',
    taskCount: 1,
    wordsTarget: { min: Math.max(30, w - 20), max: w + 20 },
    taskTypes: l.taskTypes,
    questionTypes: ['short_answer'],
    questionsTotal: { min: 1, max: 1 },
    layout: 'writing',
  }));
}

function sprechenParts(count) {
  const defs = [
    { label: 'Sich vorstellen / Fragen beantworten', taskTypes: ['introduce_self', 'qa'] },
    { label: 'Gemeinsame Aufgabe / Diskussion', taskTypes: ['pair_discussion', 'picture_description'] },
    { label: 'Präsentation / Meinung', taskTypes: ['presentation', 'debate'] },
  ];
  return defs.slice(0, count).map((d, i) => ({
    teil: i + 1,
    slotType: 'speaking_task',
    label: d.label,
    instruction: 'Bereiten Sie sich auf die mündliche Aufgabe vor.',
    taskCount: 1,
    taskTypes: d.taskTypes,
    questionTypes: ['short_answer'],
    questionsTotal: { min: 1, max: 1 },
    layout: 'speaking',
  }));
}

function goetheBlueprint(level) {
  const spParts = level === 'A1' || level === 'A2' ? 2 : 3;
  const wrParts = level === 'A1' || level === 'A2' ? 1 : 3;
  return {
    id: `goethe-${level.toLowerCase()}`,
    examType: 'goethe',
    language: 'de',
    level,
    certificate: `Goethe-Zertifikat ${level}`,
    principle: 'fixed_structure_dynamic_content',
    difficultyDistribution: {
      easy: { min: 1, max: 3, share: 0.2 },
      medium: { min: 4, max: 6, share: 0.4 },
      hard: { min: 7, max: 10, share: 0.4 },
    },
    modules: [
      {
        id: 'lesen',
        title: 'Leseverstehen',
        time: level === 'A1' ? '25 Minuten' : '65 Minuten',
        parts: [
          {
            teil: 1,
            slotType: 'micro_texts',
            label: 'Kurze Texte',
            instruction: 'Lesen Sie die Texte und wählen Sie die richtige Antwort.',
            questionTypes: ['multiple_choice', 'multiple', 'richtig_falsch', 'true_false'],
            questionsTotal: { min: 4, max: 6 },
            layout: 'items',
          },
          {
            teil: 2,
            slotType: 'article',
            label: 'Längerer Text',
            instruction: 'Lesen Sie den Text und beantworten Sie die Fragen.',
            questionTypes: ['multiple_choice', 'multiple', 'richtig_falsch', 'true_false'],
            questionsTotal: { min: 4, max: 8 },
            layout: 'passage_questions',
          },
        ],
      },
      {
        id: 'horen',
        title: 'Hörverstehen',
        time: '40 Minuten',
        parts: [
          {
            teil: 1,
            slotType: 'short_dialogues',
            label: 'Kurze Dialoge',
            instruction: 'Hören Sie die Dialoge und beantworten Sie die Fragen.',
            questionTypes: ['multiple_choice', 'multiple'],
            questionsTotal: { min: 4, max: 6 },
            layout: 'segments',
          },
          {
            teil: 2,
            slotType: 'long_audio',
            label: 'Längere Aufnahme',
            instruction: 'Hören Sie die Aufnahme und beantworten Sie die Fragen.',
            questionTypes: ['multiple_choice', 'multiple', 'richtig_falsch', 'true_false'],
            questionsTotal: { min: 4, max: 8 },
            layout: 'segments',
          },
        ],
      },
      {
        id: 'grammatik',
        title: 'Grammatik / Wortschatz',
        time: null,
        parts: [
          {
            teil: 1,
            slotType: 'grammar_block',
            label: 'Grammatik',
            instruction: 'Ergänzen Sie oder wählen Sie die richtige Antwort.',
            questionTypes: ['multiple_choice', 'multiple', 'gap_fill'],
            questionsTotal: { min: 6, max: 12 },
            layout: 'questions',
          },
        ],
      },
      { id: 'schreiben', title: 'Schreiben', time: '60 Minuten', parts: schreibenParts(wrParts, level) },
      { id: 'sprechen', title: 'Sprechen', time: '15 Minuten', parts: sprechenParts(spParts) },
    ],
  };
}

function cambridgeBlueprint(level) {
  const base = JSON.parse(fs.readFileSync(path.join(BP, 'cambridge_B2.json'), 'utf8'));
  return {
    ...base,
    id: `cambridge-${level.toLowerCase()}`,
    level,
    certificate: level === 'B2' ? 'B2 First (FCE)' : level === 'C1' ? 'C1 Advanced (CAE)' : `Cambridge ${level}`,
    modules: base.modules.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p })) })),
  };
}

function deleBlueprint(level) {
  const base = JSON.parse(fs.readFileSync(path.join(BP, 'dele_B2.json'), 'utf8'));
  const wrParts = level === 'A1' || level === 'A2' ? 1 : 3;
  const spParts = level === 'A1' || level === 'A2' ? 2 : 3;
  const modules = base.modules.filter((m) => m.id !== 'schreiben');
  modules.push({
    id: 'schreiben',
    title: 'Expresión escrita',
    time: '80 min',
    parts: schreibenParts(wrParts, level).map((p) => ({
      ...p,
      instruction: 'Escriba un texto según la consigna.',
    })),
  });
  modules.push({
    id: 'sprechen',
    title: 'Expresión oral',
    time: '20 min',
    parts: sprechenParts(spParts).map((p) => ({
      ...p,
      instruction: 'Prepare la tarea oral.',
    })),
  });
  return {
    ...base,
    id: `dele-${level.toLowerCase()}`,
    examType: 'dele',
    language: 'es',
    level,
    certificate: `DELE ${level}`,
    modules,
  };
}

function writeBlueprint(name, data, force) {
  const file = path.join(BP, `${name}.json`);
  if (!force && fs.existsSync(file)) {
    console.log('Skip', path.relative(ROOT, file));
    return;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(ROOT, file));
}

const force = process.argv.includes('--force');

for (const level of GOETHE_LEVELS) writeBlueprint(`goethe_${level}`, goetheBlueprint(level), force);
for (const level of CAMBRIDGE_LEVELS) {
  if (level === 'B2' || level === 'C1') {
    if (force) writeBlueprint(`cambridge_${level}`, cambridgeBlueprint(level), true);
    else console.log('Skip cambridge_' + level);
  } else {
    writeBlueprint(`cambridge_${level}`, cambridgeBlueprint(level), force);
  }
}
for (const level of DELE_LEVELS) {
  if (level === 'B2' || level === 'C1') {
    if (force) writeBlueprint(`dele_${level}`, deleBlueprint(level), true);
    else console.log('Skip dele_' + level);
  } else {
    writeBlueprint(`dele_${level}`, deleBlueprint(level), force);
  }
}

// Always refresh goethe B1/B2 with sprechen + 3 schreiben (13b fidelity)
writeBlueprint('goethe_B1', goetheBlueprint('B1'), true);
writeBlueprint('goethe_B2', goetheBlueprint('B2'), true);

console.log('Blueprint seed complete.');
