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

  /** All Teile or one selected Teil for personal section generation. */
  function chunkPlanForPersonalModule(blueprint, languageId, teilFilter) {
    const full = chunkPlanFromBlueprint(blueprint, languageId);
    const sorted = [...full].sort((a, b) => (a.teil ?? 0) - (b.teil ?? 0));
    if (teilFilter == null || teilFilter === '' || teilFilter === 'all') return sorted;
    if (Array.isArray(teilFilter)) {
      const set = new Set(teilFilter.map((t) => Number(t)).filter(Number.isFinite));
      if (!set.size) return sorted;
      const picked = sorted.filter((ctx) => set.has(Number(ctx.teil)));
      return picked.length ? picked : sorted;
    }
    const t = Number(teilFilter);
    if (!Number.isFinite(t)) return sorted;
    const picked = sorted.filter((ctx) => Number(ctx.teil) === t);
    return picked.length ? picked : sorted;
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
      const qTypes = (part.questionTypes || []).map((t) => String(t).toLowerCase());
      if (qTypes.includes('richtig_falsch')) {
        lines.push(
          '- Use questions[] (NOT items[]) with type "richtig_falsch", question text, correct "R" or "F". No options array.',
        );
      } else if (qTypes.includes('multiple_choice')) {
        lines.push(
          '- Use questions[] with type "multiple_choice", question, options as [{key:"a",text:"..."},...], correct as option key.',
        );
      } else if (qTypes.includes('ja_nein')) {
        lines.push(
          '- Use questions[] with type "ja_nein", question, correct "J" or "N". No options array.',
        );
      }
    }
    if (needsTranscript(part, ctx.expectKey)) {
      lines.push(
        `- Include transcript/audioScript (${listeningWordTarget(spec, part)} words). ` +
          `Use segments[] with transcript per segment when layout is "segments".`,
      );
      lines.push(
        '- Each segment: { label, transcript, questions[] }. Put scorable items in segment.questions, not at part root.',
      );
      const qTypes = (part.questionTypes || []).map((t) => String(t).toLowerCase());
      if (qTypes.includes('richtig_falsch')) {
        lines.push('- Listening R/F: type "richtig_falsch", correct "R" or "F", no options array.');
      }
      if (qTypes.includes('multiple_choice')) {
        lines.push('- Listening MCQ: options [{key:"a",text:"..."},...], correct as letter key.');
        lines.push('- Do NOT emit placeholder options (bare "A"/"B" keys without text). One question object per item — no duplicate skeleton questions.');
      }
      if (qTypes.includes('matching')) {
        lines.push('- Speaker matching (Diskussion): options MUST be letter keys (M=Moderator, A/B=guests) OR [{key:"A",text:"Frau Krämer"},...]. Include part.speakers[] or name speakers clearly in transcript ("Name:").');
      }
    }
    const layout = String(part.layout || '').toLowerCase();
    if (layout === 'items') {
      lines.push(
        '- layout "items": use items[] with signText (situation text), type "matching", correct as ad key (A–J or 0).',
      );
      if (part.slotType === 'matching' && Number(part.teil) === 3) {
        lines.push(
          '- REQUIRED part.ads[]: [{key:"a",title:"...",text:"..."}, ...] — all Anzeigen (a–j). Do NOT omit ads. Do NOT put full ad texts only in item.options.',
        );
        lines.push(
          '- items[]: one situation per item (signText). Never duplicate skeleton items. Situation numbers should match instruction (e.g. 13–19 for B1 Teil 3).',
        );
      }
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
    chunkPlanForPersonalModule,
    partBindingDetail,
    structuredOutputRules,
    validationRetryHint,
    moduleExpectKey,
    itemTarget,
  });
})();

if (typeof window !== 'undefined') window.BlueprintPromptBinding = BlueprintPromptBinding;
if (typeof module !== 'undefined') module.exports = BlueprintPromptBinding;
