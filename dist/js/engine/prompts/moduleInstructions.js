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

  return Object.freeze({
    forChunk,
    grammarFocus,
    canDoFocus,
    officialMeta,
  });
})();

if (typeof window !== 'undefined') window.ModuleInstructions = ModuleInstructions;
if (typeof module !== 'undefined') module.exports = ModuleInstructions;
