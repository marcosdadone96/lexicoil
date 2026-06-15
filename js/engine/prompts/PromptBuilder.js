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

  function maxTokensFor(spec, chunkKind) {
    const base = TOKEN_BY_LEVEL[spec.level] || 2800;
    if (chunkKind === 'writing' || chunkKind === 'speaking') return Math.round(base * 0.85);
    if (chunkKind === 'listening') return Math.round(base * 0.95);
    return base;
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
    const extra = [Mod.grammarFocus(spec), Mod.canDoFocus(spec), Mod.officialMeta(spec)]
      .filter(Boolean)
      .join('\n');
    const BP = getBlueprintBinding();
    const blueprintBlock =
      ctx.blueprintPart && BP
        ? [BP.partBindingDetail(spec, ctx), BP.structuredOutputRules(ctx)].join('\n\n')
        : '';
    return `${header}\n${blueprintBlock ? `${blueprintBlock}\n` : ''}${detail}\n${extra}`;
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
      chunks: chunks.map((ctx) => ({
        expectKey: ctx.expectKey,
        label: ctx.label,
        teil: ctx.teil,
        blueprintPart: ctx.blueprintPart,
        maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey)),
        prompt: buildExamChunkPrompt(spec, ctx),
      })),
    };
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
        maxTokens: maxTokensFor(spec, chunkKind(ctx.expectKey)),
        prompt: buildExamChunkPrompt(spec, ctx),
      })),
    };
  }

  function buildVocabExamPrompt(spec) {
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
      `Build ${skillLbl} using these learner words: ${words.map((w) => `"${w}"`).join(', ')}.`,
      `Topic: "${spec.topic || 'learner vocabulary'}".`,
      loc.global,
      Shell.JSON_RULES,
    ].join('\n');

    const skillKeys = [];
    const sk = spec.skills || ['lesen', 'horen'];
    if (sk.includes('lesen') || sk.includes('reading')) skillKeys.push(isDE ? 'lesenParts' : 'readingParts');
    if (sk.includes('horen') || sk.includes('listening')) skillKeys.push(isDE ? 'horenParts' : 'listeningParts');
    if (sk.includes('schreiben') || sk.includes('writing')) skillKeys.push(isDE ? 'schreibenParts' : 'writingParts');
    if (sk.includes('sprechen') || sk.includes('speaking')) skillKeys.push(isDE ? 'sprechenParts' : 'speakingParts');
    const keysLine = skillKeys.length ? skillKeys.join(', ') : isDE ? 'lesenParts, horenParts' : 'readingParts, listeningParts';

    const body =
      `JSON with topic, level:"${spec.level}", lang:"${loc.langCode}". ` +
      `Include ONLY these module keys: ${keysLine}. Omit unselected modules entirely. ` +
      `Embed each target word naturally in authentic ${loc.contentLang} texts. Verifiable questions only. ` +
      `After writing the texts, add a top-level array "targetUsage": for each learner word you actually used, ` +
      `output {"word":"<original>","surfaces":["<exact form as written>",…]} including inflected forms. ` +
      `List only words you genuinely used in the passages or questions. Do not invent usage.`;

    return {
      mode: 'single',
      prompt: `${header}\n${body}`,
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
      return buildVocabExamPrompt(spec);
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
      return buildVocabExamPrompt(spec);
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
    expandChunkPlan,
    chunksForSpec,
    aiPathBlueprintsEnabled,
    resolveSpecBlueprint,
  });
})();

if (typeof window !== 'undefined') window.PromptBuilder = PromptBuilder;
if (typeof module !== 'undefined') module.exports = PromptBuilder;
