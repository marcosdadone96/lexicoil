/**
 * Module instruction builders — keyed by skill/module type, parameterized by spec.
 * Not provider-specific files; uses spec.constraints and taskTypes.
 */
const ModuleInstructions = (() => {
  const READING_KEYS = new Set(['lesenParts', 'readingParts']);
  const LISTENING_KEYS = new Set(['horenParts', 'listeningParts']);
  const WRITING_KEYS = new Set(['schreibenParts', 'writingParts']);
  const SPEAKING_KEYS = new Set(['sprechenParts', 'speakingParts']);

  function wordRange(spec, kind) {
    const c = spec.constraints || {};
    const r = c[`${kind}WordCount`] || c.readingWordCount || { min: 80, max: 220 };
    return r;
  }

  function writingWords(spec) {
    return spec.constraints?.writingWordCount || { min: 80, max: 180 };
  }

  function taskTypeLine(taskTypes) {
    if (!taskTypes?.length) return 'Use authentic exam task formats appropriate for the level.';
    return `Task types for this part: ${taskTypes.join(', ')}.`;
  }

  function readingDetail(spec, ctx) {
    const w = wordRange(spec, 'reading');
    const tt = taskTypeLine(ctx.taskTypes);
    if (ctx.partsTotal > 1) {
      return (
        `ONLY reading Teil ${ctx.teil} of ${ctx.partsTotal}. ${tt} ` +
        `Return ${ctx.expectKey} as ARRAY with exactly 1 object for this Teil only. ` +
        `Text length roughly ${w.min}-${w.max} words at ${spec.level} level on topic "${spec.topic}". ` +
        `Include verifiable questions with correct answers supported by the text.`
      );
    }
    return (
      `Full reading module. ${tt} ` +
      `${ctx.expectKey} ARRAY covering all ${ctx.partsTotal} part(s). ` +
      `Texts ${w.min}-${w.max} words each where applicable. Topic: "${spec.topic}".`
    );
  }

  function listeningDetail(spec, ctx) {
    const w = wordRange(spec, 'listening');
    const tt = taskTypeLine(ctx.taskTypes);
    const isDE = spec.language === 'german';
    const segHint = isDE
      ? 'Use segments with label and transcript OR single transcript with dialogue "A: ... B: ...".'
      : 'Use segments with label and transcript OR single transcript with clear speakers.';

    if (ctx.partsTotal > 1) {
      return (
        `ONLY listening Teil ${ctx.teil} of ${ctx.partsTotal}. ${tt} ` +
        `${ctx.expectKey} must be an ARRAY with exactly 1 object. ${segHint} ` +
        `Transcript ${Math.round(w.min * 0.8)}-${w.max} words. ` +
        `Include plays:2, questions verifiable from audio script.`
      );
    }
    return `Full listening module. ${tt} ${segHint} ${ctx.expectKey} ARRAY with all parts.`;
  }

  function writingDetail(spec, ctx) {
    const w = writingWords(spec);
    const tt = taskTypeLine(ctx.taskTypes);
    return (
      `Writing module${ctx.partsTotal > 1 ? ` Teil ${ctx.teil}` : ''}. ${tt} ` +
      `${ctx.expectKey} ARRAY with task(s), minWords ~${w.min}-${w.max}, criteria, modelAnswer. ` +
      `Topic angle: "${spec.topic}".`
    );
  }

  function speakingDetail(spec, ctx) {
    const tt = taskTypeLine(ctx.taskTypes);
    return (
      `Speaking module${ctx.partsTotal > 1 ? ` Teil ${ctx.teil}` : ''}. ${tt} ` +
      `${ctx.expectKey} ARRAY with situation, bullet points, modelAnswer per task. ` +
      `Topic: "${spec.topic}".`
    );
  }

  function forChunk(spec, ctx) {
    const key = ctx.expectKey;
    if (READING_KEYS.has(key)) return readingDetail(spec, ctx);
    if (LISTENING_KEYS.has(key)) return listeningDetail(spec, ctx);
    if (WRITING_KEYS.has(key)) return writingDetail(spec, ctx);
    if (SPEAKING_KEYS.has(key)) return speakingDetail(spec, ctx);
    return `Generate ${key} content for ${spec.level} ${spec.language} on "${spec.topic}". ${taskTypeLine(ctx.taskTypes)}`;
  }

  function grammarFocus(spec) {
    const g = spec.grammarTopics?.slice(0, 6) || [];
    if (!g.length) return '';
    return `Grammar focus (weave naturally): ${g.join('; ')}.`;
  }

  function canDoFocus(spec) {
    const c = spec.canDoStatements?.slice(0, 4) || [];
    if (!c.length) return '';
    return `Target CEFR can-do: ${c.join(' ')}`;
  }

  function officialMeta(spec) {
    if (!spec.examStructure?.certificate) return '';
    const board = spec.examStructure.board || '';
    if (!board) return ` official:{certificate:"${spec.examStructure.certificate}"}.`;
    return ` official:{board:"${board}",certificate:"${spec.examStructure.certificate}"}.`;
  }

  /** Shared generation quality rules (Prompt C + natural vocab / grammar). */
  function contentQualityRules(spec) {
    const lang = spec?.language || 'english';
    const lines = [
      'Each question MUST be answerable exclusively from THIS part\'s text/audio — do not invent facts outside the passage.',
      'Spread the correct MCQ option across A, B, and C across questions; never put every correct answer on the same letter.',
      'Every MCQ option/distractor (including wrong answers) must be grammatically correct — never use broken conjugation in a distractor (e.g. "Er fährt…", NOT "Er laufen…").',
    ];
    if (lang === 'german') {
      lines.unshift(
        'German must be grammatically impeccable: correct subject–verb agreement ("Mein Name ist", NEVER "Meine Namen ist"), adjective declension ("vielfältige Ansätze", not "vielfältig Ansätze"), cases, and complete conjugated verbs.',
        'Every sentence must be syntactically complete — no broken participles or dangling fragments (e.g. NOT "bin vorher täglich pendeln musste").',
        'Do NOT produce agrammatical or invented sentences just to insert a vocabulary word (e.g. NOT "Für mein Auto schreibe ich Notizen…" unless contextually natural).',
        'Standard spelling (Duden); use complete verb forms (e.g. "schlägt vor", not "vorsägt vor").',
      );
    } else if (lang === 'spanish') {
      lines.unshift(
        'Spanish must be grammatically correct: agreement, full verb forms, standard spelling and register appropriate to the level.',
      );
    } else {
      lines.unshift(
        'English must be grammatically correct with standard spelling, complete verb phrases, and natural collocations for the level.',
      );
    }
    return lines.join(' ');
  }

  /** Retry hint when a chunk failed validation or grammar check. */
  function grammarRetryHint(lang) {
    if (lang === 'german' || lang === 'de') {
      return (
        '\n\nFIX GRAMMAR: Previous output had German grammar errors. Use "Mein Name ist" (not "Meine Namen ist"), ' +
        'correct adjective endings ("vielfältige Ansätze"), complete verb forms, and natural sentences. ' +
        'Do NOT force vocabulary with broken or nonsensical German — omit words that do not fit.'
      );
    }
    if (lang === 'spanish' || lang === 'es') {
      return '\n\nFIX GRAMMAR: Previous output had Spanish grammar errors. Use correct agreement and complete verb forms.';
    }
    return '\n\nFIX GRAMMAR: Previous output had grammar errors. Use correct agreement and natural collocations.';
  }

  /** Personal-exam vocabulary weaving (Prompt 3). */
  function vocabWeavingRules(spec) {
    const lang = spec?.language || 'english';
    const lines = [
      'Integrate learner target words NATURALLY and grammatically — never insert awkward filler just to include a word.',
      'If a target word does not fit naturally in the passage, OMIT it; prefer omission over broken or nonsensical ' +
        (lang === 'german' ? 'German' : lang === 'spanish' ? 'Spanish' : 'English') + '.',
      'In targetUsage, list ONLY words used naturally and correctly — omit forced or grammatically wrong appearances.',
      'Do not invent usage: every surface in targetUsage must appear verbatim in the generated text.',
    ];
    if (lang === 'german') {
      lines.splice(
        1,
        0,
        'Avoid template fillers like "Das ist ein Mann, der…" solely to place a noun — weave vocabulary into coherent, meaningful sentences.',
      );
    } else if (lang === 'spanish') {
      lines.splice(
        1,
        0,
        'Avoid template fillers like "Es un hombre que…" used only to showcase a word — use natural sentences instead.',
      );
    } else {
      lines.splice(
        1,
        0,
        'Avoid template fillers like "This is a man who…" used only to showcase a word — use natural sentences instead.',
      );
    }
    return lines.join(' ');
  }

  return Object.freeze({
    forChunk,
    grammarFocus,
    canDoFocus,
    officialMeta,
    contentQualityRules,
    vocabWeavingRules,
    grammarRetryHint,
  });
})();

if (typeof window !== 'undefined') window.ModuleInstructions = ModuleInstructions;
if (typeof module !== 'undefined') module.exports = ModuleInstructions;
