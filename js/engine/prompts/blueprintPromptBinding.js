/**
 * Blueprint → prompt binding for the AI exam path.
 * Uses blueprint part metadata + spec.constraints (CEFR from KnowledgeEngine).
 */
const BlueprintPromptBinding = (() => {
  const READING_SLOT = new Set([
    'micro_texts',
    'article',
    'short_texts',
    'long_article',
    'passage_questions',
    'gapped_text',
    'multiple_matching',
  ]);
  const LISTENING_SLOT = new Set(['short_dialogues', 'long_audio', 'monologue', 'dialogue', 'segments']);

  function getBaseAdapter() {
    if (typeof BaseProviderAdapter !== 'undefined') return BaseProviderAdapter;
    return require('../providers/baseProviderAdapter.js');
  }

  function moduleExpectKey(languageId, moduleId) {
    const id = String(moduleId || '').toLowerCase();
    const keyMap = getBaseAdapter().MODULE_EXPECT_KEYS[languageId] || getBaseAdapter().MODULE_EXPECT_KEYS.english;
    if (keyMap[id]) return keyMap[id];
    if (languageId === 'spanish') {
      if (id === 'lesen') return 'readingParts';
      if (id === 'horen') return 'listeningParts';
      if (id === 'schreiben') return 'writingParts';
      if (id === 'sprechen') return 'speakingParts';
    }
    if (languageId === 'german') {
      if (id === 'lesen') return 'lesenParts';
      if (id === 'horen') return 'horenParts';
      if (id === 'schreiben') return 'schreibenParts';
      if (id === 'sprechen') return 'sprechenParts';
    }
    return null;
  }

  function itemTarget(part) {
    const qt = part?.questionsTotal;
    if (!qt) return { min: 1, max: 1, label: '1' };
    const min = qt.min ?? 1;
    const max = qt.max ?? min;
    return {
      min,
      max,
      label: min === max ? String(min) : `${min}-${max}`,
    };
  }

  function readingWordTarget(spec, part) {
    if (part.wordsPerPassage) {
      return `${part.wordsPerPassage.min}-${part.wordsPerPassage.max}`;
    }
    if (part.wordsPerText) {
      return `${part.wordsPerText.min}-${part.wordsPerText.max}`;
    }
    const c = spec.constraints?.readingWordCount;
    if (c) return `${c.min}-${c.max}`;
    return 'per level CEFR range in spec';
  }

  function listeningWordTarget(spec, part) {
    const c = spec.constraints?.listeningWordCount;
    if (c) return `${Math.round(c.min * 0.8)}-${c.max}`;
    return 'per level CEFR range in spec';
  }

  function needsPassageText(part, expectKey) {
    const slot = String(part?.slotType || '').toLowerCase();
    const layout = String(part?.layout || '').toLowerCase();
    if (layout === 'passage_questions' || layout === 'items') return true;
    if (READING_SLOT.has(slot)) return true;
    return /lesen|reading/i.test(expectKey);
  }

  function needsTranscript(part, expectKey) {
    const slot = String(part?.slotType || '').toLowerCase();
    if (LISTENING_SLOT.has(slot)) return true;
    return /horen|listening/i.test(expectKey);
  }

  function chunkPlanFromBlueprint(blueprint, languageId) {
    const expanded = [];
    let idx = 0;
    const scorableModules = (blueprint.modules || []).filter((mod) =>
      moduleExpectKey(languageId, mod.id),
    );
    const totalParts = scorableModules.reduce((s, m) => s + (m.parts?.length || 0), 0);

    for (const mod of scorableModules) {
      const expectKey = moduleExpectKey(languageId, mod.id);
      for (const part of mod.parts || []) {
        idx += 1;
        expanded.push({
          expectKey,
          moduleId: mod.id,
          title: mod.title || mod.id,
          teil: part.teil ?? idx,
          partsTotal: mod.parts.length,
          moduleTime: mod.time,
          blueprintPart: part,
          label: `${idx}/${totalParts}: ${mod.title || mod.id} Teil ${part.teil ?? idx}`,
        });
      }
    }
    return expanded;
  }

  function structuredOutputRules(ctx) {
    return [
      'STRUCTURED OUTPUT (mandatory):',
      `- Reply with ONE JSON object only. No markdown fences, no commentary.`,
      `- Root key MUST be "${ctx.expectKey}" (array with exactly 1 part object for this Teil).`,
      `- Part object MUST include teil:${ctx.teil} and the official instruction text.`,
      `- Every scorable item MUST have a verifiable correct answer.`,
    ].join('\n');
  }

  function partBindingDetail(spec, ctx) {
    const part = ctx.blueprintPart;
    if (!part) return '';
    const items = itemTarget(part);
    const lines = [
      'OFFICIAL BLUEPRINT PART (binding):',
      `- slotType: ${part.slotType || 'standard'}`,
      `- layout: ${part.layout || 'questions'}`,
      `- Official instruction: "${part.instruction || part.label || ''}"`,
      `- Generate EXACTLY ${items.label} scorable item(s) (questionsTotal ${items.min}-${items.max}).`,
      `- Allowed questionTypes: ${(part.questionTypes || []).join(', ') || 'multiple_choice'}.`,
    ];

    if (needsPassageText(part, ctx.expectKey)) {
      lines.push(
        `- Include reading text/passage (${readingWordTarget(spec, part)} words). ` +
          `For layout "items", each item needs signText/text; for "passage_questions", one shared "text" field.`,
      );
    }
    if (needsTranscript(part, ctx.expectKey)) {
      lines.push(
        `- Include transcript/audioScript (${listeningWordTarget(spec, part)} words). ` +
          `Use segments[] with transcript per segment when layout is "segments".`,
      );
    }
    if (part.difficultyDistribution || spec.metadata?.blueprint?.difficultyDistribution) {
      const dd = spec.metadata?.blueprint?.difficultyDistribution || part.difficultyDistribution;
      if (dd) {
        lines.push(
          `- Difficulty mix: easy ${Math.round((dd.easy?.share || 0) * 100)}%, ` +
            `medium ${Math.round((dd.medium?.share || 0) * 100)}%, ` +
            `hard ${Math.round((dd.hard?.share || 0) * 100)}%.`,
        );
      }
    }
    return lines.join('\n');
  }

  function validationRetryHint(errors) {
    if (!errors?.length) return '';
    return (
      '\n\nVALIDATION FIX REQUIRED (previous attempt failed strict blueprint check):\n' +
      errors.map((e) => `- ${e}`).join('\n') +
      '\nFix ALL issues above. Match item counts and include required passage/transcript text.'
    );
  }

  return Object.freeze({
    chunkPlanFromBlueprint,
    partBindingDetail,
    structuredOutputRules,
    validationRetryHint,
    moduleExpectKey,
    itemTarget,
  });
})();

if (typeof window !== 'undefined') window.BlueprintPromptBinding = BlueprintPromptBinding;
if (typeof module !== 'undefined') module.exports = BlueprintPromptBinding;
