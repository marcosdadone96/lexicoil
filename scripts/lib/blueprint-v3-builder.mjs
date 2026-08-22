/**
 * Builds full blueprint v3 JSON objects from blueprint-v3-specs.mjs entries.
 * Output shape matches library/blueprints/goethe_B1.json (structureVersion 3).
 */

import { BLUEPRINT_V3_SPECS } from './blueprint-v3-specs.mjs';

export const DEFAULT_DIFFICULTY_DISTRIBUTION = {
  easy: { min: 1, max: 3, share: 0.2 },
  medium: { min: 4, max: 6, share: 0.4 },
  hard: { min: 7, max: 10, share: 0.4 },
};

const MODULE_ORDER = ['lesen', 'horen', 'schreiben', 'sprechen'];

const MODULE_TITLES = {
  goethe: { de: { lesen: 'Lesen', horen: 'Hören', schreiben: 'Schreiben', sprechen: 'Sprechen' } },
  cambridge: { en: { lesen: 'Reading', horen: 'Listening', schreiben: 'Writing', sprechen: 'Speaking' } },
  dele: { es: { lesen: 'Comprensión de lectura', horen: 'Comprensión auditiva', schreiben: 'Expresión e interacción escrita', sprechen: 'Expresión e interacción oral' } },
};

/** @param {number | object} part */
function normalizePartSpec(part) {
  if (typeof part === 'number') return { itemsTotal: part };
  return { ...part };
}

function questionsTotalFor(items) {
  return { min: items, max: items };
}

function goetheLesenPart(teil, items, level) {
  const layouts = {
    1: { slotType: 'press_mcq', taskFormat: 'short_text_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
    2: { slotType: 'info_board_mcq', taskFormat: 'floor_plan_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
    3: { slotType: 'email_mcq', taskFormat: 'correspondence_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
    4: { slotType: 'ads_matching', taskFormat: 'matching_ads', layout: 'items', questionTypes: ['matching'], passageLengthExempt: true },
    5: { slotType: 'rules_mcq', taskFormat: 'multiple_choice_notice', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
  };
  const high = {
    1: { slotType: 'article_mcq', taskFormat: 'long_text_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
    2: { slotType: 'sentence_gap_fill', taskFormat: 'sentence_insertion', layout: 'passage_questions', questionTypes: ['matching'] },
    3: { slotType: 'matching', taskFormat: 'matching_headlines', layout: 'items', questionTypes: ['matching'] },
    4: { slotType: 'gap_article', taskFormat: 'gap_fill_reading', layout: 'passage_questions', questionTypes: ['gap_fill', 'multiple_choice'] },
  };
  const meta = level === 'A1' ? layouts[teil] || layouts[1] : high[teil] || high[1];
  return {
    teil,
    label: `Teil ${teil}`,
    instruction: `Lesen Sie die Texte und bearbeiten Sie die Aufgaben ${teil}.`,
    wordsPerPassage: level === 'A1' ? { min: 80, max: 150 } : { min: 200, max: 450 },
    ...meta,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

function goetheHorenPart(teil, items, level) {
  const a1 = {
    1: { slotType: 'short_texts_twice', taskFormat: 'short_dialogue_mcq', plays: 2, segmentsTotal: 5, layout: 'segments', questionTypes: ['multiple_choice'] },
    2: { slotType: 'picture_matching', taskFormat: 'picture_schedule_matching', plays: 1, segmentsTotal: 1, layout: 'segments', questionTypes: ['matching'] },
    3: { slotType: 'short_dialogues_once', taskFormat: 'short_dialogue_mcq', plays: 1, segmentsTotal: 5, layout: 'segments', questionTypes: ['multiple_choice'] },
  };
  const high = {
    1: { slotType: 'short_texts_twice', taskFormat: 'short_texts_rf_mcq', plays: 2, layout: 'segments', questionTypes: ['richtig_falsch', 'multiple_choice'] },
    2: { slotType: 'monologue_once', taskFormat: 'monologue_mcq', plays: 1, segmentsTotal: 1, layout: 'segments', questionTypes: ['multiple_choice'] },
    3: { slotType: 'conversation_once', taskFormat: 'informal_conversation_rf', plays: 1, segmentsTotal: 1, layout: 'segments', questionTypes: ['richtig_falsch'] },
    4: { slotType: 'discussion_twice', taskFormat: 'discussion_speaker_matching', plays: 2, segmentsTotal: 1, layout: 'segments', questionTypes: ['matching', 'multiple_choice'] },
  };
  const meta = level === 'A1' ? a1[teil] || a1[1] : high[teil] || high[1];
  return {
    teil,
    label: `Teil ${teil}`,
    instruction: `Sie hören verschiedene Texte. Bearbeiten Sie die Aufgaben in Teil ${teil}.`,
    wordsPerTranscript: level === 'A1' ? { min: 20, max: 90 } : { min: 80, max: 420 },
    ...meta,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

function goetheSchreibenPart(teil, items, level) {
  const words =
    level === 'A1'
      ? [{ min: 20, max: 40 }, { min: 30, max: 50 }]
      : level === 'C1' || level === 'C2'
        ? [{ min: 200, max: 280 }, { min: 200, max: 280 }]
        : [{ min: 150, max: 220 }, { min: 150, max: 220 }];
  const w = words[teil - 1] || words[0];
  return {
    teil,
    slotType: 'writing_task',
    taskFormat: teil === 1 ? 'formal_essay' : 'argumentative_text',
    label: `Aufgabe ${teil}`,
    instruction: `Schreiben Sie einen Text zu Aufgabe ${teil}.`,
    layout: 'writing',
    taskCount: 1,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
    questionTypes: ['short_answer'],
    wordsTarget: w,
    wordsPerPassage: w,
    taskTypes: teil === 1 ? ['essay', 'formal_letter'] : ['opinion', 'report'],
    recommendedMinutes: teil === 1 ? 40 : 40,
  };
}

function goetheSprechenPart(teil, items, level) {
  const labels =
    level === 'A1'
      ? ['Sich vorstellen', 'Fragen beantworten', 'Gemeinsam etwas planen']
      : level === 'C1' || level === 'C2'
        ? ['Präsentation', 'Diskussion']
        : ['Gemeinsam planen', 'Präsentation', 'Feedback'];
  return {
    teil,
    slotType: 'speaking_task',
    taskFormat: teil === 1 ? 'presentation' : 'discussion',
    label: `Teil ${teil} — ${labels[teil - 1] || 'Mündliche Aufgabe'}`,
    instruction: `Bereiten Sie Teil ${teil} der mündlichen Prüfung vor.`,
    layout: 'speaking',
    taskCount: 1,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
    questionTypes: ['short_answer'],
    interaction: teil === 1 ? 'monologue' : 'paired',
    taskTypes: teil === 1 ? ['presentation'] : ['discussion', 'debate'],
  };
}

const CAMBRIDGE_LESEN_SLOTS = [
  // Cloze parts: all gaps come from ONE passage — layout passage_questions makes
  // ExamBlueprint.pickPassageAligned select a single coherent passage group.
  { slotType: 'mcq_gap_fill', taskFormat: 'multiple_choice_cloze', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
  { slotType: 'open_cloze', taskFormat: 'open_cloze', layout: 'passage_questions', questionTypes: ['gap_fill', 'open_cloze'] },
  { slotType: 'word_formation', taskFormat: 'word_formation', layout: 'questions', questionTypes: ['gap_fill', 'word_formation'] },
  { slotType: 'sentence_transformation', taskFormat: 'key_word_transformation', layout: 'questions', questionTypes: ['gap_fill', 'sentence_transformation'] },
  { slotType: 'long_text', taskFormat: 'long_text_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
  { slotType: 'gapped_text', taskFormat: 'gapped_text', layout: 'passage_questions', questionTypes: ['matching'] },
  { slotType: 'multiple_matching', taskFormat: 'multiple_matching', layout: 'items', questionTypes: ['matching', 'multiple_choice'] },
  { slotType: 'cross_text_matching', taskFormat: 'cross_text_matching', layout: 'items', questionTypes: ['matching'] },
];

// B1 Preliminary Reading -- official 2020 format (verified vs cambridgeenglish.org, 2026-07-09).
// Task set and order differ from B2+/higher: NO word_formation / key_word_transformation in B1P.
// P1 signs/notices MCQ, P2 person-text matching, P3 long-text MCQ, P4 gapped text,
// P5 multiple-choice cloze, P6 open cloze.
const CAMBRIDGE_B1_LESEN_SLOTS = [
  { slotType: 'signs_notices_mcq', taskFormat: 'short_text_mcq', layout: 'items', questionTypes: ['multiple_choice'], passageLengthExempt: true },
  { slotType: 'person_text_matching', taskFormat: 'multiple_matching', layout: 'items', questionTypes: ['matching'], passageLengthExempt: true },
  { slotType: 'long_text', taskFormat: 'long_text_mcq', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
  { slotType: 'gapped_text', taskFormat: 'gapped_text', layout: 'passage_questions', questionTypes: ['matching'] },
  // Cloze parts: all gaps come from ONE passage — layout passage_questions makes
  // ExamBlueprint.pickPassageAligned select a single coherent passage group.
  { slotType: 'mcq_gap_fill', taskFormat: 'multiple_choice_cloze', layout: 'passage_questions', questionTypes: ['multiple_choice'] },
  { slotType: 'open_cloze', taskFormat: 'open_cloze', layout: 'passage_questions', questionTypes: ['gap_fill', 'open_cloze'] },
];

function cambridgeLesenPart(teil, items, level) {
  const slots = level === 'B1' ? CAMBRIDGE_B1_LESEN_SLOTS : CAMBRIDGE_LESEN_SLOTS;
  const idx = Math.min(teil - 1, slots.length - 1);
  const slot = slots[idx];
  const partLabel = level === 'A1' ? `Part ${teil}` : `Part ${teil}`;
  return {
    teil,
    label: `${partLabel} — Reading`,
    instruction: `Read the text(s) and answer the questions in ${partLabel}.`,
    wordsPerPassage: level === 'A1' ? { min: 40, max: 120 } : { min: 150, max: 800 },
    ...slot,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

const CAMBRIDGE_HOREN_SLOTS = [
  { slotType: 'dialogue_extracts', taskFormat: 'dialogue_extracts', layout: 'segments', questionTypes: ['multiple_choice'] },
  { slotType: 'sentence_completion', taskFormat: 'sentence_completion', layout: 'segments', questionTypes: ['gap_fill'] },
  { slotType: 'monologue', taskFormat: 'monologue_mcq', layout: 'segments', questionTypes: ['multiple_choice'] },
  { slotType: 'dialogue_speakers', taskFormat: 'dialogue_speakers', layout: 'segments', questionTypes: ['matching', 'multiple_choice'] },
  { slotType: 'dialogue_matching', taskFormat: 'dialogue_matching', layout: 'segments', questionTypes: ['matching'] },
];

// B1 Preliminary Listening -- official 2020 format (verified vs cambridgeenglish.org, 2026-07-09).
// P1 picture MCQ (7), P2 short-dialogue gist MCQ (6), P3 monologue gap fill (6), P4 interview MCQ (6).
// No speaker-matching task in B1P Listening. Each recording is played twice.
const CAMBRIDGE_B1_HOREN_SLOTS = [
  // segmentsTotal: P1 = 7 independent recordings (1 Q each); P2 = 6 short dialogues (1 Q each);
  // P3 = 1 monologue (6 gaps); P4 = 1 interview (6 Q). Required by ExamBlueprint.pickSegmentsAligned.
  { slotType: 'picture_mcq', taskFormat: 'picture_multiple_choice', layout: 'segments', segmentsTotal: 7, questionTypes: ['multiple_choice'] },
  { slotType: 'short_dialogue_mcq', taskFormat: 'short_dialogue_mcq', layout: 'segments', segmentsTotal: 6, questionTypes: ['multiple_choice'] },
  { slotType: 'sentence_completion', taskFormat: 'sentence_completion', layout: 'segments', segmentsTotal: 1, questionTypes: ['gap_fill'] },
  { slotType: 'interview_mcq', taskFormat: 'interview_mcq', layout: 'segments', segmentsTotal: 1, questionTypes: ['multiple_choice'] },
];

function cambridgeHorenPart(teil, items, level) {
  const slots = level === 'B1' ? CAMBRIDGE_B1_HOREN_SLOTS : CAMBRIDGE_HOREN_SLOTS;
  const slot = slots[Math.min(teil - 1, slots.length - 1)];
  return {
    teil,
    label: `Part ${teil} — Listening`,
    instruction: `Listen and answer the questions in Part ${teil}.`,
    plays: 2,
    ...slot,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

function cambridgeSchreibenPart(teil, items, level) {
  const words =
    level === 'A2'
      ? [{ min: 25, max: 35 }, { min: 35, max: 45 }]
      : level === 'B1'
        ? [{ min: 100, max: 120 }, { min: 100, max: 120 }]
        : [{ min: 140, max: 190 }, { min: 140, max: 190 }];
  const w = words[teil - 1] || words[0];
  // B1 Preliminary Writing -- official: P1 email (compulsory, answer email + notes),
  // P2 choice between an article or a story. Other Cambridge levels keep essay/choice.
  const isB1 = level === 'B1';
  const slot = teil === 1 ? (isB1 ? 'email' : 'essay') : 'choice_writing';
  const taskTypes = isB1
    ? (teil === 1 ? ['email'] : ['article', 'story'])
    : (teil === 1 ? ['essay'] : ['email', 'review', 'article']);
  return {
    teil,
    slotType: slot,
    taskFormat: slot,
    label: `Part ${teil} — Writing`,
    instruction: teil === 1 ? 'Write the compulsory task.' : 'Write one of the tasks given.',
    layout: 'writing',
    taskCount: 1,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
    questionTypes: ['short_answer'],
    wordsTarget: w,
    wordsPerPassage: w,
    taskTypes,
    mandatory: teil === 1,
  };
}

// B1 Preliminary Speaking -- official 2020 format (verified vs cambridgeenglish.org, 2026-07-09).
// P1 interview (2min), P2 extended turn: describe one colour photo (3min),
// P3 collaborative discussion (4min), P4 general conversation (3min).
const CAMBRIDGE_B1_SPRECHEN = {
  1: { taskTypes: ['interview'], instruction: 'Part 1 (Interview): answer the examiner questions, giving factual or personal information.' },
  2: { taskTypes: ['photo_description'], instruction: 'Part 2 (Extended turn): describe one colour photograph, talking for about 1 minute.' },
  3: { taskTypes: ['collaborative_task'], instruction: 'Part 3 (Discussion): make and respond to suggestions, discuss alternatives and negotiate agreement.' },
  4: { taskTypes: ['general_conversation'], instruction: 'Part 4 (General conversation): discuss likes, dislikes, experiences, opinions and habits.' },
};

function cambridgeSprechenPart(teil, level) {
  const b1 = level === 'B1' ? CAMBRIDGE_B1_SPRECHEN[teil] : null;
  return {
    teil,
    slotType: 'speaking_task',
    taskFormat: 'speaking_prompt',
    label: `Part ${teil} — Speaking`,
    instruction: b1?.instruction || 'Take part in the speaking test as instructed by the examiner.',
    layout: 'speaking',
    taskCount: 1,
    itemsTotal: 1,
    questionsTotal: questionsTotalFor(1),
    questionTypes: ['short_answer'],
    taskTypes: b1?.taskTypes || ['interaction', 'discussion'],
  };
}

function deleLesenPart(teil, items) {
  return {
    teil,
    slotType: teil <= 2 ? 'short_texts' : teil <= 4 ? 'long_article' : 'gap_article',
    taskFormat: teil <= 2 ? 'short_text_mcq' : 'long_text_mcq',
    label: `Tarea ${teil}`,
    instruction: `Lea los textos y responda a la Tarea ${teil}.`,
    layout: teil <= 2 ? 'items' : 'passage_questions',
    questionTypes: ['multiple_choice', 'true_false', 'matching', 'gap_fill'],
    wordsPerPassage: { min: 80, max: 600 },
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

function deleHorenPart(teil, items) {
  return {
    teil,
    slotType: 'short_audio',
    taskFormat: 'short_listening_mcq',
    label: `Tarea ${teil}`,
    instruction: `Escuche los audios y responda a la Tarea ${teil}.`,
    layout: 'segments',
    plays: 2,
    questionTypes: ['multiple_choice', 'true_false', 'matching'],
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
  };
}

function deleSchreibenPart(teil, items, level) {
  const words = level === 'C2' ? { min: 250, max: 350 } : { min: 150, max: 220 };
  return {
    teil,
    slotType: 'writing_task',
    taskFormat: level === 'C2' && teil === 1 ? 'mediation_writing' : 'argumentative_essay',
    label: `Tarea ${teil}`,
    instruction: `Escriba su respuesta para la Tarea ${teil}.`,
    layout: 'writing',
    taskCount: 1,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
    questionTypes: ['short_answer'],
    wordsTarget: words,
    wordsPerPassage: words,
    taskTypes: ['essay', 'formal_letter', 'mediation'],
  };
}

function deleSprechenPart(teil, items) {
  return {
    teil,
    slotType: 'speaking_task',
    taskFormat: 'speaking_prompt',
    label: `Tarea ${teil}`,
    instruction: `Prepare la tarea oral ${teil}.`,
    layout: 'speaking',
    taskCount: 1,
    itemsTotal: items,
    questionsTotal: questionsTotalFor(items),
    questionTypes: ['short_answer'],
    taskTypes: ['presentation', 'discussion', 'monologue'],
  };
}

/**
 * @param {import('./blueprint-v3-specs.mjs').BlueprintV3Spec} spec
 * @param {string} moduleId
 * @param {import('./blueprint-v3-specs.mjs').ModuleSpec} modSpec
 */
function buildModule(spec, moduleId, modSpec) {
  const titles = MODULE_TITLES[spec.examType]?.[spec.language] || {};
  const title = titles[moduleId] || moduleId;
  const maxPoints = modSpec.maxPoints ?? spec.maxPointsPerModule ?? (spec.examType === 'dele' ? 25 : spec.modularGrading ? 100 : 25);

  const parts = modSpec.parts.map((raw, i) => {
    const teil = i + 1;
    const p = normalizePartSpec(raw);
    const items = p.itemsTotal;
    let built;

    if (spec.examType === 'goethe') {
      if (moduleId === 'lesen') built = goetheLesenPart(teil, items, spec.level);
      else if (moduleId === 'horen') built = goetheHorenPart(teil, items, spec.level);
      else if (moduleId === 'schreiben') built = goetheSchreibenPart(teil, items, spec.level);
      else built = goetheSprechenPart(teil, items, spec.level);
    } else if (spec.examType === 'cambridge') {
      if (moduleId === 'lesen') built = cambridgeLesenPart(teil, items, spec.level);
      else if (moduleId === 'horen') built = cambridgeHorenPart(teil, items, spec.level);
      else if (moduleId === 'schreiben') built = cambridgeSchreibenPart(teil, items, spec.level);
      else built = cambridgeSprechenPart(teil, spec.level);
    } else {
      if (moduleId === 'lesen') built = deleLesenPart(teil, items);
      else if (moduleId === 'horen') built = deleHorenPart(teil, items);
      else if (moduleId === 'schreiben') built = deleSchreibenPart(teil, items, spec.level);
      else built = deleSprechenPart(teil, items);
    }

    return { ...built, ...p, teil: p.teil ?? teil, itemsTotal: items, questionsTotal: questionsTotalFor(items) };
  });

  return {
    id: moduleId,
    title,
    time: modSpec.time ?? null,
    maxPoints,
    parts,
  };
}

/**
 * @param {string} fileId
 * @returns {object}
 */
export function buildBlueprintV3(fileId) {
  const spec = BLUEPRINT_V3_SPECS[fileId];
  if (!spec) throw new Error(`Unknown blueprint spec: ${fileId}`);

  const modules = MODULE_ORDER.filter((id) => spec.modules[id]).map((id) => buildModule(spec, id, spec.modules[id]));

  const itemsTotalByModule = {};
  for (const mod of modules) {
    itemsTotalByModule[mod.id] = mod.parts.reduce((s, p) => s + (p.itemsTotal || 0), 0);
  }

  const bp = {
    id: spec.id,
    examType: spec.examType,
    language: spec.language,
    level: spec.level,
    certificate: spec.certificate,
    principle: 'fixed_structure_dynamic_content',
    source: spec.source,
    structureVersion: 3,
    difficultyDistribution: { ...DEFAULT_DIFFICULTY_DISTRIBUTION },
    modules,
    itemsTotalByModule,
    notes: spec.notes ? { ...spec.notes } : {},
  };

  if (spec.modularGrading != null) bp.modularGrading = spec.modularGrading;
  if (spec.passPercentPerModule != null) bp.passPercentPerModule = spec.passPercentPerModule;
  if (spec.passRule) bp.passRule = { ...spec.passRule };
  if (spec.verifyPending) bp.notes.verifyPending = 'true';

  return bp;
}

export function buildAllBlueprintV3Targets() {
  return Object.keys(BLUEPRINT_V3_SPECS).map((fileId) => ({
    fileId,
    blueprint: buildBlueprintV3(fileId),
  }));
}
