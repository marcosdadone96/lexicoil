/**
 * PromptBuilder — Phase 06
 * Single entry: buildPrompt(ContentSpecification)
 * No buildGoethePrompt / buildB1Prompt / provider-specific prompt files.
 */
const PromptBuilder = (() => {
  const TOKEN_BY_LEVEL = { A1: 2000, A2: 2400, B1: 2800, B2: 3000, C1: 3200, C2: 3400 };

  function getShell() {
    if (typeof PromptShell !== 'undefined') return PromptShell;
    return require('./promptShell.js');
  }

  function getModInstr() {
    if (typeof ModuleInstructions !== 'undefined') return ModuleInstructions;
    return require('./moduleInstructions.js');
  }

  function getDomain() {
    if (typeof LexiCoilDomain !== 'undefined') return LexiCoilDomain;
    return require('../domain/lexicoilDomain.js');
  }

  function maxTokensFor(spec, chunkKind, ctx) {
    const base = TOKEN_BY_LEVEL[spec.level] || 2800;
    let tokens = base;
    if (chunkKind === 'writing' || chunkKind === 'speaking') tokens = Math.round(base * 0.85);
    else if (chunkKind === 'listening') tokens = Math.round(base * 0.95);

    const part = ctx?.blueprintPart;
    const teil = Number(part?.teil ?? ctx?.teil);
    if (part) {
      const layout = String(part.layout || '').toLowerCase();
      const slot = String(part.slotType || part.taskFormat || '').toLowerCase();
      if (layout === 'items' || slot.includes('ads') || slot.includes('forum')) {
        tokens = Math.max(tokens, Math.round(base * 1.35));
      }
      if (slot.includes('ads_matching') && teil === 3) {
        tokens = Math.min(Math.max(tokens, 9000), 10000);
      } else if (
        chunkKind === 'listening' &&
        ((slot.includes('short_texts') && teil === 1) || (slot.includes('discussion') && teil === 4))
      ) {
        tokens = Math.min(Math.max(tokens, 9000), 10000);
      } else if (teil === 3 || teil === 4) {
        tokens = Math.max(tokens, Math.round(base * 1.15));
      }
      // Lesen Teil 4 forum: split into sub-calls in ChunkRunner (~5.5k tokens each)
      if (slot.includes('forum') || (teil === 4 && layout === 'items' && chunkKind === 'reading')) {
        tokens = Math.min(Math.max(tokens, 5500), 6000);
      }
      // Hören Teil 4 discussion: long transcript + 8 statements
      if (
        (slot.includes('discussion') || part.taskFormat?.includes('discussion')) &&
        teil === 4 &&
        chunkKind === 'listening'
      ) {
        tokens = Math.min(Math.max(tokens, 9000), 10000);
      }
      // Hören Teil 1 short_texts_twice: 5 segments × 2 questions
      if (slot.includes('short_texts') && teil === 1 && chunkKind === 'listening') {
        tokens = Math.min(Math.max(tokens, 9000), 10000);
      }
    }
    return tokens;
  }

  function chunkKind(expectKey) {
    if (/lesen|reading/i.test(expectKey)) return 'reading';
    if (/horen|listening/i.test(expectKey)) return 'listening';
    if (/schreiben|writing/i.test(expectKey)) return 'writing';
    if (/sprechen|speaking/i.test(expectKey)) return 'speaking';
    return 'other';
  }

  function expandChunkPlan(spec) {
    const plan = spec.constraints?.chunkPlan || [];
    const expanded = [];
    let idx = 0;
    const totalParts = plan.reduce((s, m) => s + (m.parts || 1), 0);

    for (const mod of plan) {
      const parts = mod.parts || 1;
      for (let teil = 1; teil <= parts; teil++) {
        idx += 1;
        expanded.push({
          expectKey: mod.expectKey,
          moduleId: mod.moduleId,
          title: mod.title || mod.moduleId,
          teil,
          partsTotal: parts,
          taskTypes: mod.taskTypes || [],
          label: `${idx}/${totalParts}: ${mod.title || mod.moduleId}${parts > 1 ? ` ${teil}` : ''}`,
        });
      }
    }
    return expanded;
  }

  function getBlueprintBinding() {
    if (typeof BlueprintPromptBinding !== 'undefined') return BlueprintPromptBinding;
    try {
      return require('./blueprintPromptBinding.js');
    } catch {
      return null;
    }
  }

  function getBlueprintResolver() {
    if (typeof BlueprintResolver !== 'undefined') return BlueprintResolver;
    try {
      return require('../validation/blueprintResolver.js');
    } catch {
      return null;
    }
  }

  function aiPathBlueprintsEnabled() {
    const R = getBlueprintResolver();
    return R?.aiPathBlueprintsEnabled?.() || false;
  }

  function resolveSpecBlueprint(spec) {
    if (spec?.metadata?.blueprint) return spec.metadata.blueprint;
    const R = getBlueprintResolver();
    return R?.resolveBlueprintForSpec?.(spec) || null;
  }

  function buildExamChunkPrompt(spec, ctx) {
    const Shell = getShell();
    const Mod = getModInstr();
    const detail = Mod.forChunk(spec, ctx);
    const header = Shell.examWriterHeader(spec, ctx.expectKey, ctx.title);
    const extra = [Mod.grammarFocus(spec), Mod.canDoFocus(spec), Mod.officialMeta(spec), Mod.contentQualityRules(spec)]
      .filter(Boolean)
      .join('\n');
    const BP = getBlueprintBinding();
    const blueprintBlock =
      ctx.blueprintPart && BP
        ? [BP.partBindingDetail(spec, ctx), BP.structuredOutputRules(ctx)].join('\n\n')
        : '';
    let proactiveHint = '';
    if (ctx.blueprintPart && BP?.lesenForumTeil4ProactiveHint) {
      const slot = String(ctx.blueprintPart.slotType || '').toLowerCase();
      const teil = Number(ctx.blueprintPart.teil ?? ctx.teil);
      const isLesenT4 =
        (slot.includes('forum') || slot.includes('opinion')) &&
        teil === 4 &&
        /lesen|reading/i.test(ctx.expectKey);
      // Lesen T4 is generated via LesenTeil4Split sub-calls — avoid "all 7 in one JSON" hint.
      if (!isLesenT4) {
        proactiveHint = BP.lesenForumTeil4ProactiveHint();
      }
    }
    return `${header}\n${blueprintBlock ? `${blueprintBlock}\n` : ''}${detail}\n${extra}${proactiveHint}`;
  }

  function annotatePersonalExamChunks(chunks) {
    const EXAM_MODEL = 'claude-sonnet-4-6';
    return chunks.map((c) => {
      const slot = String(c.blueprintPart?.slotType || '').toLowerCase();
      const teil = Number(c.teil ?? c.blueprintPart?.teil);
      const expectKey = String(c.expectKey || '').toLowerCase();
      if (slot.includes('ads_matching') && teil === 3 && /lesen|reading/.test(expectKey)) {
        return {
          ...c,
          forceExamModel: EXAM_MODEL,
          chunkSlotType: 'ads_matching',
          chunkTeil: 3,
          maxTokens: Math.max(c.maxTokens || 0, 9000),
        };
      }
      if (teil === 2 && /lesen|reading/.test(expectKey) && (slot.includes('press') || Number(c.blueprintPart?.passagesPerPart) >= 2)) {
        return { ...c, chunkTeil: 2, chunkSlotType: 'press_mcq', lesenT2Split: true };
      }
      if (/horen|listening/.test(expectKey)) {
        if ((slot.includes('short_texts') && teil === 1) || (slot.includes('discussion') && teil === 4)) {
          return {
            ...c,
            forceExamModel: EXAM_MODEL,
            chunkTeil: teil,
            chunkSlotType: slot.includes('discussion') ? 'discussion_twice' : 'short_texts_twice',
            maxTokens: Math.max(c.maxTokens || 0, 9000),
          };
        }
      }
      return c;
    });
  }

  /** @deprecated alias */
  function annotatePersonalLesenChunks(chunks) {
    return annotatePersonalExamChunks(chunks);
  }

  function annotateLesenT2Split(chunks) {
    let Split = null;
    try {
      Split =
        typeof LesenTeil2Split !== 'undefined'
          ? LesenTeil2Split
          : require('../generators/lesenTeil2Split.js');
    } catch {
      return chunks;
    }
    return chunks.map((c) => {
      if (!Split.isLesenT2SplitChunk(c)) return c;
      return {
        ...c,
        lesenT2Split: true,
        lesenT2MaxTokens: Split.MAX_TOKENS,
        maxTokens: Math.min(c.maxTokens || Split.MAX_TOKENS, Split.MAX_TOKENS),
      };
    });
  }

  function annotateLesenT4Split(chunks) {
    let Split = null;
    try {
      Split =
        typeof LesenTeil4Split !== 'undefined'
          ? LesenTeil4Split
          : require('../generators/lesenTeil4Split.js');
    } catch {
      return chunks;
    }
    return chunks.map((c) => {
      if (!Split.isLesenForumT4Chunk(c)) return c;
      return {
        ...c,
        lesenT4Split: true,
        lesenT4PhaseCount: Split.phaseCount(c.blueprintPart),
        lesenT4MaxTokens: Split.MAX_TOKENS,
        maxTokens: Math.min(c.maxTokens || Split.MAX_TOKENS, Split.MAX_TOKENS),
      };
    });
  }

  function buildExamChunksFromBlueprint(spec, blueprint) {
    const BP = getBlueprintBinding();
    if (!BP || !blueprint) {
      throw new Error('buildExamChunksFromBlueprint requires blueprint and binding module');
    }
    const chunks = BP.chunkPlanFromBlueprint(blueprint, spec.language);
    if (!chunks.length) throw new Error('Blueprint produced empty chunk plan');
    return {
      mode: 'chunks',
      blueprint,
      chunks: annotatePersonalLesenChunks(
        annotateLesenT2Split(
        annotateLesenT4Split(
        chunks.map((ctx) => ({
          expectKey: ctx.expectKey,
          label: ctx.label,
          teil: ctx.teil,
          blueprintPart: ctx.blueprintPart,
          maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey), ctx),
          prompt: buildExamChunkPrompt(spec, ctx),
        })),
      ),
      ),
      ),
    };
  }

  const SKILL_MODULE_ALIASES = Object.freeze({
    lesen: ['lesen', 'reading'],
    reading: ['lesen', 'reading'],
    horen: ['horen', 'listening'],
    listening: ['horen', 'listening'],
    schreiben: ['schreiben', 'writing'],
    writing: ['schreiben', 'writing'],
    sprechen: ['sprechen', 'speaking'],
    speaking: ['sprechen', 'speaking'],
  });

  function normalizePersonalSkills(skills) {
    const raw = (skills?.length ? skills : ['lesen']).map((s) =>
      String(s || '').toLowerCase(),
    );
    const filtered = raw.filter((s) => s !== 'vocabulary' && s !== 'vocab');
    return filtered.length ? filtered : ['lesen'];
  }

  function filterBlueprintBySkills(blueprint, skills) {
    const selected = normalizePersonalSkills(skills);
    const modules = (blueprint.modules || []).filter((mod) => {
      const mid = String(mod.id || '').toLowerCase();
      return selected.some((skill) => (SKILL_MODULE_ALIASES[skill] || [skill]).includes(mid));
    });
    return { ...blueprint, modules };
  }

  function targetUsageContract(isLast) {
    if (!isLast) return 'Do NOT include targetUsage in this chunk.';
    return (
      'This is the FINAL chunk. Add top-level "targetUsage": [{"word":"<original>","surfaces":["<exact form>",…]}] ' +
      'ONLY for learner words you wove in naturally and grammatically correctly in ANY chunk of this exam. ' +
      'Do not invent usage — each surface must appear verbatim in the text. Omit forced or agrammatical appearances.'
    );
  }

  function buildPersonalExamChunkPrompt(spec, ctx) {
    const base = buildExamChunkPrompt(spec, ctx);
    const words = spec.targetWords || [];
    const isDE = spec.language === 'german';
    const Mod = getModInstr();
    const rules = vocabExamRules(spec, isDE);
    const weave = Mod.vocabWeavingRules(spec);
    const lines = [
      'PERSONAL VOCABULARY REVIEW (official part structure — items must be pool-compatible):',
    ];
    if (words.length) {
      lines.push(
        `Weave these learner words naturally where authentic: ${words.map((w) => `"${w}"`).join(', ')}.`,
      );
      lines.push(
        'Use standard dictionary spellings for vocabulary words in all generated German/English/Spanish text — never propagate obvious typos from the word list.',
      );
    }
    if (spec.vocabPolicy?.maximizeCoverage) {
      lines.push(
        `Use as many learner words as possible naturally for level ${spec.level}; do not force words artificially.`,
      );
    }
    lines.push(weave, rules, targetUsageContract(ctx.isLast));
    return `${base}\n\n${lines.join('\n')}`;
  }

  /** Generate ONLY missing scorable items for an existing Teil (preserve passage/transcript). */
  function buildRefillChunk(spec, { deficit, existingPart, need, startNum, blueprint }) {
    const BP = getBlueprintBinding();
    if (!BP || !blueprint) return null;
    const filtered = filterBlueprintBySkills(blueprint, [deficit.module]);
    const plan = BP.chunkPlanForPersonalModule(filtered, spec.language, deficit.teil);
    const ctx = plan[0];
    if (!ctx) return null;

    const base = buildPersonalExamChunkPrompt(spec, { ...ctx, chunkIndex: 0, chunkTotal: 1, isLast: false });
    const snap = JSON.stringify(existingPart, null, 0).slice(0, 12000);
    const Mod = getModInstr();
    const lines = [
      'REFILL MODE — generate ONLY the missing scorable items for this Teil.',
      `You MUST NOT change or regenerate the existing passage, transcript, ads, or textTitle.`,
      `Generate EXACTLY ${need} NEW scorable item(s) to append (total target after merge: full Teil).`,
      `Assign ids/numbers ${startNum} through ${startNum + need - 1} (official exam numbering).`,
      `Existing part (preserve text/transcript/ads — only add questions/items):`,
      snap,
      'Return ONE JSON object with the same root key and teil. Include ONLY the new items in questions[] or items[] ' +
        '(or segment questions[]). Repeat unchanged text/transcript fields exactly as above.',
      Mod.grammarRetryHint(spec.language),
    ];
    return {
      expectKey: ctx.expectKey,
      label: `${ctx.label} refill +${need}`,
      teil: ctx.teil,
      moduleId: ctx.moduleId,
      blueprintPart: ctx.blueprintPart,
      maxTokens: Math.max(maxTokensFor(spec, chunkKind(ctx.expectKey), ctx), 4000),
      prompt: `${base}\n\n${lines.join('\n')}`,
      isRefill: true,
    };
  }

  /** Personal AI exam — same official Teile as library/standard exams, plus vocab weaving. */
  function buildPersonalExamChunksFromBlueprint(spec, blueprint) {
    const BP = getBlueprintBinding();
    if (!BP || !blueprint) {
      throw new Error('buildPersonalExamChunksFromBlueprint requires blueprint and binding module');
    }
    const filtered = filterBlueprintBySkills(blueprint, spec.skills);
    const skills = normalizePersonalSkills(spec.skills);
    const teilFilter = spec.personalTeilFilter ?? 'all';
    let plan =
      skills.length === 1 && filtered.modules?.length === 1
        ? BP.chunkPlanForPersonalModule(filtered, spec.language, teilFilter)
        : BP.chunkPlanFromBlueprint(filtered, spec.language);
    let Filter = null;
    try {
      Filter =
        typeof PersonalLesenPoolFallback !== 'undefined'
          ? PersonalLesenPoolFallback
          : require('../personalLesenPoolFallback.js');
    } catch {
      Filter = null;
    }
    if (Filter?.filterPersonalAiChunks) {
      plan = Filter.filterPersonalAiChunks(plan, spec);
    }
    if (!plan.length) {
      throw new Error('Blueprint produced empty chunk plan for selected skills');
    }
    return {
      mode: 'chunks',
      blueprint: filtered,
      chunks: annotatePersonalLesenChunks(
        annotateLesenT2Split(
        annotateLesenT4Split(
        plan.map((ctx, i) => ({
          expectKey: ctx.expectKey,
          label: `${ctx.label} (personal vocab)`,
          teil: ctx.teil,
          moduleId: ctx.moduleId,
          blueprintPart: ctx.blueprintPart,
          maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey), ctx),
          prompt: buildPersonalExamChunkPrompt(spec, {
            ...ctx,
            chunkIndex: i,
            chunkTotal: plan.length,
            isLast: i === plan.length - 1,
          }),
        })),
      ),
      ),
      ),
    };
  }

  function buildPersonalExamChunks(spec, blueprintOverride) {
    if (blueprintOverride === null) return buildVocabExamChunks(spec);
    const blueprint =
      blueprintOverride || spec?.metadata?.blueprint || resolveSpecBlueprint(spec);
    if (blueprint) {
      return buildPersonalExamChunksFromBlueprint(spec, blueprint);
    }
    return buildVocabExamChunks(spec);
  }

  function buildExamChunks(spec) {
    const useBlueprint = aiPathBlueprintsEnabled();
    const blueprint = useBlueprint ? resolveSpecBlueprint(spec) : null;
    if (useBlueprint && blueprint) {
      return buildExamChunksFromBlueprint(spec, blueprint);
    }
    const chunks = expandChunkPlan(spec);
    if (!chunks.length) {
      throw new Error('Exam ContentSpecification has no chunkPlan');
    }
    return {
      mode: 'chunks',
      chunks: chunks.map((ctx) => ({
        expectKey: ctx.expectKey,
        label: ctx.label,
        maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey), ctx),
        prompt: buildExamChunkPrompt(spec, ctx),
      })),
    };
  }

  function vocabExamRules(spec, isDE) {
    const rfType = isDE ? 'rf' : 'tf';
    const rfCorrect = isDE ? '"R" or "F"' : '"T" or "F"';
    const ynCorrect = isDE ? '"J" or "N"' : '"Y" or "N"';
    const Mod = getModInstr();
    const quality = Mod.contentQualityRules(spec);
    const weave = Mod.vocabWeavingRules(spec);
    return (
      `EVERY scorable question MUST include a top-level "correct" field (never omit it). ` +
      `Types: ${rfType} → correct ${rfCorrect}; ja_nein → correct ${ynCorrect}; ` +
      `multiple-choice → options [{"key":"A","text":"…"},…] and correct as letter key only ("A","B",…). ` +
      `Every distractor option must be grammatically correct (e.g. "Er fährt…", not "Er laufen…"). ` +
      `Do NOT put answers in "answer"/"solution" only — always duplicate into "correct". ` +
      `${weave} ${quality}`
    );
  }

  function vocabExamHeader(spec) {
    const words = spec.targetWords || [];
    const Shell = getShell();
    const loc = Shell.getLocale(spec.language);
    const skills = spec.skills?.length ? spec.skills : ['lesen', 'horen'];
    const isDE = spec.language === 'german';
    const skillLbl = skills
      .map((s) => {
        if (s === 'lesen' || s === 'reading') return isDE ? 'Leseverstehen' : 'Reading';
        if (s === 'horen' || s === 'listening') return isDE ? 'Hörverstehen' : 'Listening';
        return s;
      })
      .join(' + ');
    const header = [
      loc.anti,
      `Personalized ${spec.level} ${loc.contentLang} vocabulary exam.`,
      `Use these learner words: ${words.map((w) => `"${w}"`).join(', ')}.`,
      `Topic: "${spec.topic || 'learner vocabulary'}".`,
      `Overall skills: ${skillLbl}.`,
    ];
    if (spec.vocabPolicy?.maximizeCoverage) {
      header.push(
        `Use as many learner words as possible naturally for level ${spec.level}; do not force words artificially.`,
      );
    }
    header.push(loc.global, Shell.JSON_RULES);
    return { headerBlock: header.join('\n'), loc, isDE };
  }

  function buildVocabExamChunkPlan(spec) {
    const skills = spec.skills?.length ? spec.skills : ['lesen', 'horen'];
    const isDE = spec.language === 'german';
    const plan = [];
    const has = (s) => skills.includes(s);
    if (has('lesen') || has('reading')) {
      plan.push({ expectKey: isDE ? 'lesenParts' : 'readingParts', title: isDE ? 'Lesen' : 'Reading', teilFrom: 1, teilTo: 2, partsCount: 2 });
      plan.push({ expectKey: isDE ? 'lesenParts' : 'readingParts', title: isDE ? 'Lesen' : 'Reading', teilFrom: 3, teilTo: 4, partsCount: 2 });
    }
    if (has('horen') || has('listening')) {
      plan.push({ expectKey: isDE ? 'horenParts' : 'listeningParts', title: isDE ? 'Hörverstehen' : 'Listening', teilFrom: 1, teilTo: 1, partsCount: 1 });
      plan.push({ expectKey: isDE ? 'horenParts' : 'listeningParts', title: isDE ? 'Hörverstehen' : 'Listening', teilFrom: 2, teilTo: 2, partsCount: 1 });
    }
    if (has('schreiben') || has('writing')) {
      plan.push({ expectKey: isDE ? 'schreibenParts' : 'writingParts', title: isDE ? 'Schreiben' : 'Writing', teilFrom: 1, teilTo: 1, partsCount: 1 });
    }
    if (has('sprechen') || has('speaking')) {
      plan.push({ expectKey: isDE ? 'sprechenParts' : 'speakingParts', title: isDE ? 'Sprechen' : 'Speaking', teilFrom: 1, teilTo: 1, partsCount: 1 });
    }
    if (!plan.length) {
      plan.push({ expectKey: isDE ? 'lesenParts' : 'readingParts', title: isDE ? 'Lesen' : 'Reading', teilFrom: 1, teilTo: 2, partsCount: 2 });
      plan.push({ expectKey: isDE ? 'lesenParts' : 'readingParts', title: isDE ? 'Lesen' : 'Reading', teilFrom: 3, teilTo: 4, partsCount: 2 });
    }
    return plan.map((p, i) => ({ ...p, chunkIndex: i, chunkTotal: plan.length, isLast: i === plan.length - 1 }));
  }

  function buildVocabExamChunkPrompt(spec, ctx) {
    const { headerBlock, loc, isDE } = vocabExamHeader(spec);
    const rules = vocabExamRules(spec, isDE);
    const partLabel = ctx.teilFrom === ctx.teilTo ? `teil ${ctx.teilFrom}` : `teile ${ctx.teilFrom}-${ctx.teilTo}`;
    const body = [
      `CHUNK ${ctx.chunkIndex + 1}/${ctx.chunkTotal}. Return ONLY valid JSON with root key "${ctx.expectKey}" (array of exactly ${ctx.partsCount} part(s), ${partLabel}).`,
      `Include topic, level:"${spec.level}", lang:"${loc.langCode}". Omit all other module keys.`,
      `Each part: authentic ${loc.contentLang} text/transcript and 2 verifiable questions with "correct".`,
      rules,
      targetUsageContract(ctx.isLast),
    ].join(' ');
    return `${headerBlock}\n${body}`;
  }

  function buildVocabExamChunks(spec) {
    const plan = buildVocabExamChunkPlan(spec);
    return {
      mode: 'chunks',
      chunks: plan.map((ctx) => ({
        expectKey: ctx.expectKey,
        label: `Personal ${ctx.title} ${ctx.teilFrom}${ctx.teilTo !== ctx.teilFrom ? `–${ctx.teilTo}` : ''}`,
        teilFrom: ctx.teilFrom,
        teilTo: ctx.teilTo,
        maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey), {
          teil: ctx.teilFrom,
          blueprintPart: {
            teil: ctx.teilFrom,
            layout: ctx.teilFrom >= 3 ? 'items' : 'passage_questions',
            slotType: ctx.teilFrom === 3 ? 'ads_matching' : ctx.teilFrom === 4 ? 'forum_opinions' : '',
          },
        }),
        prompt: buildVocabExamChunkPrompt(spec, ctx),
      })),
    };
  }

  function buildVocabExamPrompt(spec) {
    const { headerBlock, loc, isDE } = vocabExamHeader(spec);
    const skills = spec.skills?.length ? spec.skills : ['lesen', 'horen'];
    const skillKeys = [];
    if (skills.includes('lesen') || skills.includes('reading')) skillKeys.push(isDE ? 'lesenParts' : 'readingParts');
    if (skills.includes('horen') || skills.includes('listening')) skillKeys.push(isDE ? 'horenParts' : 'listeningParts');
    if (skills.includes('schreiben') || skills.includes('writing')) skillKeys.push(isDE ? 'schreibenParts' : 'writingParts');
    if (skills.includes('sprechen') || skills.includes('speaking')) skillKeys.push(isDE ? 'sprechenParts' : 'speakingParts');
    const keysLine = skillKeys.length ? skillKeys.join(', ') : isDE ? 'lesenParts, horenParts' : 'readingParts, listeningParts';
    const rules = vocabExamRules(spec, isDE);
    const body =
      `JSON with topic, level:"${spec.level}", lang:"${loc.langCode}". ` +
      `Include ONLY these module keys: ${keysLine}. Omit unselected modules entirely. ` +
      `Embed each target word naturally in authentic ${loc.contentLang} texts. Verifiable questions only. ` +
      `${rules} ` +
      targetUsageContract(true);

    return {
      mode: 'single',
      prompt: `${headerBlock}\n${body}`,
      maxTokens: 7000,
    };
  }

  function buildQuickExercisePrompt(spec, quickMod) {
    const Shell = getShell();
    const loc = Shell.getLocale(spec.language);
    const topic = spec.topic || 'general';
    const lv = spec.level;
    const minW = spec.constraints?.writingWordCount?.min || { A1: 40, A2: 60, B1: 80, B2: 100, C1: 130, C2: 160 }[lv] || 80;
    const isDE = spec.language === 'german';
    const rfType = isDE ? 'rf' : 'tf';
    const trueVal = isDE ? 'R' : 'T';
    const gapWords = isDE
      ? '["haben","wird","können","muss","wäre","damit","obwohl","jedoch","daher","trotzdem"]'
      : '["although","however","therefore","despite","whereas","since","moreover","consequently"]';

    let jsonShape;
    if (quickMod === 'gapfill') {
      jsonShape = `{"topic":"${topic}","level":"${lv}","lang":"${loc.langCode}","quickMod":"gapfill","gapfill":{"instruction":"...","sentences":[8 items with id,text,answer,options]}}`;
    } else if (quickMod === 'reading') {
      const key = isDE ? 'lesen' : 'reading';
      jsonShape = `{"topic":"${topic}","level":"${lv}","lang":"${loc.langCode}","quickMod":"reading","${key}":{"textTitle":"...","text":"min ${spec.constraints?.readingWordCount?.min || 180} words","questions":[6 items]}}`;
    } else if (quickMod === 'listening') {
      const key = isDE ? 'horen' : 'listening';
      jsonShape = `{"topic":"${topic}","level":"${lv}","lang":"${loc.langCode}","quickMod":"listening","${key}":{"context":"...","transcript":"dialogue min 180 words","questions":[5 items]}}`;
    } else {
      const key = isDE ? 'schreiben' : 'writing';
      jsonShape = `{"topic":"${topic}","level":"${lv}","lang":"${loc.langCode}","quickMod":"writing","${key}":{"task":"...","minWords":${minW},"criteria":[]}}`;
    }

    return {
      mode: 'single',
      prompt: [
        loc.anti,
        `Create a ${lv} ${loc.contentLang} ${quickMod || 'writing'} exercise on "${topic}".`,
        `Reply ONLY valid JSON matching: ${jsonShape}`,
        `Questions type multiple and ${rfType} where appropriate; correct "${trueVal}" or "F".`,
        loc.global,
        Shell.JSON_RULES,
      ].join('\n'),
      maxTokens: 4000,
    };
  }

  function buildFlashcardPrompt(spec) {
    const words = spec.targetWords || [];
    const Shell = getShell();
    const loc = Shell.getLocale(spec.language);
    return {
      mode: 'single',
      prompt: [
        loc.anti,
        `Create ${spec.level} ${loc.contentLang} flashcard entries for: ${words.join(', ')}.`,
        `JSON array flashcards with word, translation, example sentence, level:"${spec.level}".`,
        Shell.JSON_RULES,
      ].join('\n'),
      maxTokens: 3000,
    };
  }

  /**
   * @param {import('../domain/lexicoilDomain').ContentSpecification} spec
   * @param {{ quickMod?: string }} [options]
   */
  function buildPrompt(spec, options) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('buildPrompt requires ContentSpecification');
    }
    const Domain = getDomain();
    const v = Domain.validateContentSpecification(spec);
    if (!v.ok) {
      const err = new Error('Invalid spec for buildPrompt: ' + v.errors.join('; '));
      err.code = 'invalid_content_spec';
      throw err;
    }

    const ct = spec.contentType;
    const opts = options || {};

    if (ct === 'Exam' || ct === 'MiniExam') {
      return buildExamChunks(spec);
    }

    if (ct === 'VocabularyExercise' && spec.targetWords?.length) {
      return buildPersonalExamChunks(spec);
    }

    if (ct === 'Flashcards' && spec.targetWords?.length) {
      return buildFlashcardPrompt(spec);
    }

    if (ct === 'Story') {
      const Shell = getShell();
      const loc = Shell.getLocale(spec.language);
      return {
        mode: 'single',
        prompt: [
          loc.anti,
          `Write a ${spec.level} ${loc.contentLang} story for CEFR learners on "${spec.topic || 'daily life'}".`,
          `JSON: {topic, level, lang, story:{title, paragraphs:[...], glossary:[{word,translation}]}}.`,
          Shell.JSON_RULES,
        ].join('\n'),
        maxTokens: 4000,
      };
    }

    if (ct === 'Dialogue') {
      const Shell = getShell();
      const loc = Shell.getLocale(spec.language);
      return {
        mode: 'single',
        prompt: [
          loc.anti,
          `Create a ${spec.level} ${loc.contentLang} dialogue on "${spec.topic || 'daily life'}".`,
          `JSON: {topic, level, lang, dialogue:{title, lines:[{speaker,text}], comprehensionQuestions:[...]}}.`,
          Shell.JSON_RULES,
        ].join('\n'),
        maxTokens: 3500,
      };
    }

    if (
      ct === 'ReadingExercise' ||
      ct === 'ListeningExercise' ||
      ct === 'WritingExercise' ||
      ct === 'SpeakingExercise' ||
      opts.quickMod
    ) {
      const mod =
        opts.quickMod ||
        (ct === 'ReadingExercise'
          ? 'reading'
          : ct === 'ListeningExercise'
            ? 'listening'
            : ct === 'SpeakingExercise'
              ? 'gapfill'
              : 'writing');
      return buildQuickExercisePrompt(spec, mod);
    }

    if (spec.targetWords?.length >= 4) {
      return buildVocabExamChunks(spec);
    }

    const err = new Error(`buildPrompt: unsupported contentType ${ct}`);
    err.code = 'unsupported_content_type';
    throw err;
  }

  /** Chunk array shaped for ExamGenerator / ChunkRunner */
  function chunksForSpec(spec) {
    const result = buildPrompt(spec);
    if (result.mode !== 'chunks') {
      throw new Error('chunksForSpec requires chunked exam spec');
    }
    return result.chunks;
  }

  return Object.freeze({
    buildPrompt,
    buildExamChunks,
    buildExamChunksFromBlueprint,
    buildVocabExamChunks,
    buildPersonalExamChunks,
    buildPersonalExamChunksFromBlueprint,
    buildRefillChunk,
    filterBlueprintBySkills,
    expandChunkPlan,
    chunksForSpec,
    aiPathBlueprintsEnabled,
    resolveSpecBlueprint,
  });
})();

if (typeof window !== 'undefined') window.PromptBuilder = PromptBuilder;
if (typeof module !== 'undefined') module.exports = PromptBuilder;
