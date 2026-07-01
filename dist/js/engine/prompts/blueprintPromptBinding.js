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
    const part = ctx.blueprintPart;
    const slot = String(part?.slotType || '').toLowerCase();
    const teil = Number(part?.teil ?? ctx.teil);
    const expectKey = String(ctx.expectKey || '');
    const lines = [
      'STRUCTURED OUTPUT (mandatory):',
      `- Reply with ONE JSON object only. No markdown fences, no commentary.`,
      `- Root key MUST be "${ctx.expectKey}" (array with exactly 1 part object for this Teil).`,
      `- Part object MUST include teil:${ctx.teil} and the official instruction text.`,
      `- Every scorable item MUST have a verifiable correct answer.`,
    ];
    if (
      (slot.includes('forum') || slot.includes('opinion')) &&
      teil === 4 &&
      /lesen|reading/i.test(expectKey)
    ) {
      lines.push(
        '- Lesen Teil 4 chunk (same pattern as Hören T4): ONE object in the array; all scorable content lives inside that single part.',
        '- Use items[] for the 7 forum opinions (like Hören T4 uses segments[].questions[]). Do NOT use questions[] for opinions.',
        '- Required shape: {"lesenParts":[{"teil":4,"instruction":"…","textTitle":"Forum topic as question","items":[' +
          '{"id":"20","signText":"…60-90 word opinion…","type":"ja_nein","correct":"J"}, … exactly 7 items ids 20–26]}]}',
        '- part.text must be empty or omitted. Do NOT truncate signText. Do NOT return fewer than 7 items.',
      );
    }
    if (
      (slot.includes('press') || part?.taskFormat?.includes('two_text')) &&
      teil === 2 &&
      /lesen|reading/i.test(expectKey)
    ) {
      lines.push(
        '- Lesen Teil 2 chunk: TWO independent press/magazine texts (NOT one combined letter).',
        '- REQUIRED passages:[{"passageId":"A","textTitle":"…","text":"…150-220 words…"},{"passageId":"B","textTitle":"…","text":"…150-220 words…"}]',
        '- Exactly 6 multiple-choice questions (a/b/c): 3 with passageId "A", 3 with passageId "B".',
        '- Each question MUST be answerable ONLY from its passage text — no cross-text inference.',
        '- Do NOT set passageId "B" unless passages includes B with full text. part.text alone is NOT enough.',
      );
    }
    if (
      slot.includes('discussion') &&
      teil === 4 &&
      /horen|listening/i.test(expectKey)
    ) {
      lines.push(
        '- Hören Teil 4 chunk: ONE part object with segments[] (1 segment); transcript 280–380 words (concise discussion with Moderator + guest A + guest B).',
        '- EXACTLY 8 matching statements in segment.questions[] — "Wer sagt was?" Each maps to speaker key M (Moderator), A, or B.',
        '- Keep transcript concise; do NOT truncate questions. Non-degenerate keys: spread correct across M/A/B.',
      );
    }
    if (
      slot.includes('short_texts') &&
      teil === 1 &&
      /horen|listening/i.test(expectKey)
    ) {
      lines.push(
        '- Hören Teil 1 chunk: ONE part object; REQUIRED segments[] with EXACTLY 5 independent short texts (Anzeige/Ansage/Voicemail — NOT one combined block).',
        '- Each segment: {label:"Aufnahme N", transcript (25–90 words, BRIEF 2–4 sentences), questions:[exactly 2 items]}.',
        '- Total EXACTLY 10 scorable items: per segment 1× Richtig/Falsch (correct "R"/"F") + 1× multiple_choice (a/b/c) like official Modellsatz.',
        '- Five DIFFERENT everyday topics. Keep transcripts SHORT to avoid JSON truncation.',
      );
    }
    if (
      (String(part?.layout || '').toLowerCase() === 'writing' ||
        slot.includes('writing_task')) &&
      /schreiben|writing/i.test(expectKey)
    ) {
      const words = part.wordsTarget?.min ?? (teil === 3 ? 40 : 80);
      const fmt = String(part.taskFormat || '').toLowerCase();
      lines.push(
        `- Schreiben Teil ${teil}: ONE object in schreibenParts[] with teil:${teil}, aufgabe:${teil}, fieldId:"write_bp_${teil}", task, minWords:${words}, maxWords:${words}.`,
      );
      if (fmt === 'informal_email' || teil === 1) {
        lines.push(
          '- Teil 1 informal email (~80 Wörter): 3 bullet points (•); Anrede + Schluss.',
        );
      } else if (fmt.includes('forum') || teil === 2) {
        lines.push('- Teil 2 forum opinion (~80 Wörter): quote + Meinung with Vor-/Nachteile.');
      } else if (teil === 3) {
        lines.push('- Teil 3 semiformal message (~40 Wörter): höfliche Anrede/Gruß.');
      }
      lines.push(
        '- Weave learner vocabulary naturally into the task scenario (not forced in every bullet).',
      );
    }
    return lines.join('\n');
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

    const layout = String(part.layout || '').toLowerCase();
    const slotType = String(part.slotType || '').toLowerCase();
    const qTypes = (part.questionTypes || []).map((t) => String(t).toLowerCase());
    const isForumOpinions =
      slotType === 'forum_opinions' || (qTypes.includes('ja_nein') && layout === 'items');

    if (needsPassageText(part, ctx.expectKey)) {
      if (!isForumOpinions) {
        lines.push(
          `- Include reading text/passage (${readingWordTarget(spec, part)} words). ` +
            `For layout "items", each item needs signText/text; for "passage_questions", one shared "text" field.`,
        );
      }
      if (qTypes.includes('richtig_falsch')) {
        lines.push(
          '- Use questions[] (NOT items[]) with type "richtig_falsch", question text, correct "R" or "F". No options array.',
        );
      } else if (qTypes.includes('multiple_choice')) {
        lines.push(
          '- Use questions[] with type "multiple_choice", question, options as [{key:"a",text:"..."},...], correct as option key.',
        );
        if (Number(part.teil) === 2 && Number(part.passagesPerPart) >= 2) {
          lines.push(
            '- Lesen Teil 2: generate TWO separate press texts in passages[] (passageId A and B). ' +
              'Three MC questions per text (6 total). Tag each question with passageId "A" or "B".',
          );
        }
        lines.push(
          '- ALL option texts (including wrong distractors) must be grammatically correct German — e.g. "Er fährt mit dem Fahrrad", NEVER "Er laufen mit dem Fahrrad".',
        );
      } else if (qTypes.includes('ja_nein') && !isForumOpinions) {
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
        if (Number(part.teil) === 4) {
          lines.push(
            '- Hören Teil 4: EXACTLY 8 matching statements. Concise transcript (280–380 words) with clear speaker labels (Moderator:, Frau/Herr Name:). Each statement maps to one speaker key (M/A/B). Spread correct keys — no degenerate all-A.',
          );
        }
      }
      if (slotType.includes('short_texts') && Number(part.teil) === 1) {
        lines.push(
          '- Hören Teil 1: EXACTLY 5 segments[] entries — five INDEPENDENT short listening texts (notice/announcement/voicemail). NOT one monologue split artificially.',
          '- Each segment.questions[] MUST have exactly 2 items: first Richtig/Falsch, second multiple_choice a/b/c. Total 10 items across all segments.',
          '- Transcripts BRIEF (25–90 words each, 2–4 sentences). Shorter transcripts reduce truncation risk.',
        );
      }
    }
    if (layout === 'items') {
      if (isForumOpinions) {
        // T4 Lesen: forum opinions — each item is an individual opinion post
        lines.push('- layout "items": use items[] — each item is one forum opinion post.');
        lines.push(
          '- Each item MUST have: signText (the full opinion text, ' +
            `${readingWordTarget(spec, part)} words, written in first person in the target language), ` +
            'type "ja_nein", correct "J" (person agrees with topic) or "N" (person disagrees). ' +
            'Do NOT add question or options fields.',
        );
        lines.push(
          '- ALL items MUST discuss the SAME forum topic (introduced in part.textTitle or instruction). ' +
            'Do NOT mix topics across items. Part-level part.text must be empty or omitted.',
        );
        lines.push(
          '- Aim for a mix: roughly half "J" and half "N" answers across the 7 items.',
        );
      } else {
        lines.push(
          '- layout "items": use items[] with signText (situation text), type "matching", correct as ad key (A–J or 0).',
        );
        if ((slotType === 'ads_matching' || slotType === 'matching') && Number(part.teil) === 3) {
          lines.push(
            '- REQUIRED part.ads[]: [{key:"A",title:"...",text:"..."}, ...] — exactly 10 Anzeigen (A–J). Do NOT omit ads. Do NOT put full ad texts only in item.options.',
          );
          lines.push(
            '- Keep each Anzeige SHORT: 1–2 sentences (~20–40 words). Long ads cause truncated JSON.',
          );
          lines.push(
            '- REQUIRED part.example: {number:0,label:"Beispiel",situation:"...",correct:"0"} — solved example (Situation 0).',
          );
          lines.push(
            '- items[]: one situation per item (signText). Never duplicate skeleton items. Situation numbers should match instruction (e.g. 13–19 for B1 Teil 3).',
          );
          lines.push(
            '- Each ad key (A–J) may be used at most ONCE as correct (except "0" = no match). Shuffle which ad is correct across items.',
          );
        }
        if (slotType === 'forum_opinions' && Number(part.teil) === 4) {
          lines.push(
            '- Teil 4 forum: EXACTLY 7 items (opinions 20–26). Same forum topic for ALL items in part.textTitle or instruction.',
          );
          lines.push(
            '- Each item: signText = full opinion (60–90 words), type "ja_nein", correct "J" or "N". No question/options fields. Mix roughly half J / half N.',
          );
          lines.push(
            '- Do NOT truncate items. Do NOT omit signText. part.text must be empty or omitted.',
          );
          lines.push(
            '- Use items[] ONLY (NOT questions[]). Root lesenParts[0] shape: ' +
              '{"teil":4,"instruction":"…","textTitle":"Forum topic as a question","items":[' +
              '{"id":"20","signText":"…opinion 60-90 words…","type":"ja_nein","correct":"J"}, … 7 items ids 20–26]}.',
          );
        }
      }
    }
    if (layout === 'writing' || slotType === 'writing_task') {
      const teilN = Number(part.teil);
      const words = part.wordsTarget?.min ?? (teilN === 3 ? 40 : 80);
      lines.push(
        `- Schreiben Aufgabe ${teilN}: task prompt MUST ask for exactly ${words} Wörter; set minWords and maxWords to ${words} in the part object.`,
      );
      lines.push('- Include rubric/explanation referencing the official word count (80/80/40 for B1).');
      const fmt = String(part.taskFormat || '').toLowerCase();
      if (fmt === 'informal_email' || teilN === 1) {
        lines.push('- Format: informal email with 3 content bullet points (•).');
      } else if (fmt.includes('forum') || teilN === 2) {
        lines.push('- Format: forum opinion post responding to a quoted forum entry.');
      } else if (teilN === 3) {
        lines.push('- Format: semiformal email/message (Apology/Bitte), ~40 words.');
      }
    }
    if (layout === 'speaking' || slotType === 'speaking_task') {
      if (Number(part.teil) === 2 && part.slides?.length) {
        lines.push(
          '- Sprechen Teil 2: include slides[] with exactly 5 Folien: ' +
            part.slides.map((s) => `${s.n}) ${s.title}`).join('; ') +
            '.',
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

  function forumOpinionsRetryHint() {
    return (
      '\n\nFIX (Lesen Teil 4 forum — same chunk discipline as Hören T4): Return ONE object in lesenParts with teil:4. ' +
      'Use items[] with EXACTLY 7 entries (ids 20–26). Each item MUST have signText (60–90 words), type "ja_nein", correct "J" or "N". ' +
      'Include textTitle for the shared forum topic. Do NOT use questions[] or part.text. Do NOT truncate or omit items.'
    );
  }

  /** Proactive shape hint for Lesen T4 (included on first attempt). */
  function lesenForumTeil4ProactiveHint() {
    return (
      '\n\nLESEN TEIL 4 (forum opinions): Generate exactly ONE lesenParts[0] object. ' +
      'All 7 opinions go in items[] with signText + ja_nein — same single-part nesting as Hören T4 segments[].questions[].'
    );
  }

  return Object.freeze({
    chunkPlanFromBlueprint,
    chunkPlanForPersonalModule,
    partBindingDetail,
    structuredOutputRules,
    validationRetryHint,
    forumOpinionsRetryHint,
    lesenForumTeil4ProactiveHint,
    moduleExpectKey,
    itemTarget,
  });
})();

if (typeof window !== 'undefined') window.BlueprintPromptBinding = BlueprintPromptBinding;
if (typeof module !== 'undefined') module.exports = BlueprintPromptBinding;
