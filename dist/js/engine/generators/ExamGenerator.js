/**
 * ExamGenerator — Phase 07
 * Content types: Exam, MiniExam, personalized vocabulary exams
 */
const ExamGenerator = (() => {
  function getPromptBuilder() {
    if (typeof PromptBuilder !== 'undefined') return PromptBuilder;
    return require('../prompts/PromptBuilder.js');
  }

  function getChunkRunner() {
    if (typeof ChunkRunner !== 'undefined') return ChunkRunner;
    return require('./chunkRunner.js');
  }

  function getExamValidator() {
    if (typeof ExamValidator !== 'undefined') return ExamValidator;
    try {
      return require('../validation/ExamValidator.js');
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

  function getBlueprintBinding() {
    if (typeof BlueprintPromptBinding !== 'undefined') return BlueprintPromptBinding;
    try {
      return require('../prompts/blueprintPromptBinding.js');
    } catch {
      return null;
    }
  }

  function aiPathBlueprintsEnabled() {
    const R = getBlueprintResolver();
    if (R?.aiPathBlueprintsEnabled) return R.aiPathBlueprintsEnabled();
    const PB = getPromptBuilder();
    return PB?.aiPathBlueprintsEnabled?.() || false;
  }

  function resolveBlueprint(spec, options) {
    if (options?.blueprint) return options.blueprint;
    if (spec?.metadata?.blueprint) return spec.metadata.blueprint;
    const R = getBlueprintResolver();
    return R?.resolveBlueprintForSpec?.(spec) || null;
  }

  function assertExamValid(exam, hooks, validationOpts) {
    const Validator = getExamValidator();
    if (!Validator) return exam;
    const normalized =
      typeof hooks.normalizeExam === 'function' ? hooks.normalizeExam(exam) : exam;
    const strict =
      validationOpts?.strict ??
      (typeof process !== 'undefined' && process.env?.VALIDATOR_STRICT === '1');
    const blueprint = validationOpts?.blueprint ?? false;
    const result = new Validator().validate(normalized, { strict, blueprint });
    if (!result.valid) {
      const err = new Error('Generated exam failed validation: ' + result.errors.join(', '));
      err.code = 'exam_invalid';
      err.validationErrors = result.errors;
      err.validationWarnings = result.warnings;
      throw err;
    }
    return normalized;
  }

  function resolveChunks(spec, blueprint) {
    const PB = getPromptBuilder();
    if (blueprint && PB.buildExamChunksFromBlueprint) {
      return PB.buildExamChunksFromBlueprint(spec, blueprint).chunks;
    }
    const built = PB.buildPrompt(spec);
    if (built.mode === 'chunks' && built.chunks?.length) return built.chunks;
    throw new Error('Exam spec did not produce chunks');
  }

  function computeMaxChunks(chunkCount) {
    return Math.min(chunkCount * 4 + 2, 20);
  }

  async function maybeReleaseTicketQuota(genTicket, hooks) {
    if (!genTicket) return { released: false };
    try {
      const release =
        typeof hooks?.releaseExamGeneration === 'function'
          ? hooks.releaseExamGeneration
          : typeof releaseExamGeneration === 'function'
            ? releaseExamGeneration
            : null;
      if (!release) return { released: false };
      return await release(genTicket);
    } catch (err) {
      if (typeof lcDebug !== 'undefined') {
        lcDebug.warn('[exam] quota release failed:', err.message);
      }
      return { released: false };
    }
  }

  function attachChunkMeta(err, meta) {
    if (err && meta && !err.chunkMeta) err.chunkMeta = meta;
    return err;
  }

  async function throwAfterRelease(genTicket, hooks, err) {
    const release = await maybeReleaseTicketQuota(genTicket, hooks);
    if (release?.released) err.quotaReleased = true;
    throw err;
  }

  function isPersonalSpec(spec, options) {
    return (
      options.personalExam === true ||
      spec?.contentType === 'VocabularyExercise' ||
      spec?.vocabPersonal === true
    );
  }

  async function runGeneration(spec, hooks, options) {
    const blueprint = options.blueprint || null;
    const personal = isPersonalSpec(spec, options);
    const strictValidate = !!blueprint && options.useBlueprint !== false && !personal;
    const chunks = options.legacyChunks || resolveChunks(spec, blueprint);
    let validationFeedback = null;
    let lastChunkMeta = null;
    const maxAttempts = personal ? 1 : 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const runHooks = validationFeedback
        ? {
            ...hooks,
            validationFeedback,
            promptSuffix: getBlueprintBinding()?.validationRetryHint?.(validationFeedback) || '',
          }
        : hooks;

      const runResult = await getChunkRunner().run(chunks, runHooks);
      const parts = Array.isArray(runResult) ? runResult : runResult.parts;
      lastChunkMeta = Array.isArray(runResult) ? null : runResult.meta;
      const topic = spec.topic || 'Exam';
      const merged = hooks.mergeExamParts(...parts, topic);
      const normalized =
        typeof hooks.normalizeExam === 'function' ? hooks.normalizeExam(merged) : merged;

      if (lastChunkMeta) {
        normalized._chunkMeta = lastChunkMeta;
      }
      const partialChunks = (lastChunkMeta?.failed?.length ?? 0) > 0;

      if (strictValidate) {
        const Validator = getExamValidator();
        if (Validator) {
          const check = new Validator().validate(normalized, {
            blueprint,
            strict: !partialChunks,
          });
          if (!check.valid) {
            if (partialChunks) {
              if (typeof lcDebug !== 'undefined') {
                lcDebug.warn('[exam] partial chunk run — blueprint validation relaxed:', check.errors);
              }
            } else if (attempt === 0) {
              validationFeedback = check.errors;
              continue;
            } else {
              const err = attachChunkMeta(
                new Error(
                  'Generated exam failed blueprint validation: ' + check.errors.join(', '),
                ),
                lastChunkMeta,
              );
              err.code = 'blueprint_validation_failed';
              err.validationErrors = check.errors;
              throw err;
            }
          }
        }
      } else if (personal && blueprint) {
        const Validator = getExamValidator();
        if (Validator) {
          const check = new Validator().validate(normalized, { blueprint, strict: false });
          if (!check.valid && typeof lcDebug !== 'undefined') {
            lcDebug.warn('[personal] blueprint warnings (non-blocking):', check.errors, check.warnings);
          }
        }
      }

      if (personal) {
        normalized.vocabPersonal = true;
      }

      try {
        return assertExamValid(normalized, hooks, {
          strict: personal ? false : strictValidate && !partialChunks,
          blueprint: personal ? false : strictValidate && !partialChunks ? blueprint : false,
        });
      } catch (validErr) {
        throw attachChunkMeta(validErr, lastChunkMeta);
      }
    }

    throw attachChunkMeta(new Error('Exam generation failed after validation retry'), lastChunkMeta);
  }

  async function generate(spec, hooks, options) {
    const opts = options || {};
    const useBlueprint = opts.useBlueprint ?? aiPathBlueprintsEnabled();
    let blueprint = useBlueprint ? resolveBlueprint(spec, opts) : null;

    if (useBlueprint && !blueprint) {
      lcDebug.warn('[exam] AI_PATH_BLUEPRINTS enabled but no blueprint found — legacy chunk plan');
    }

    // Request a ticket once for the whole exam (covers both the normal run and
    // a possible blueprint-validation retry).  Each attempt may re-use the same
    // ticket because the maxChunks budget includes both runs.
    const startTicket = hooks.startExamTicket;
    if (typeof startTicket !== 'function') {
      throw new Error('hooks.startExamTicket is required for exam generation');
    }
    const chunks = resolveChunks(spec, blueprint || resolveBlueprint(spec, {}));
    const maxChunks = computeMaxChunks(chunks.length);
    const genTicket = await startTicket('exam_generation', maxChunks);
    const runHooksBase = { ...hooks, genTicket };

    try {
      const exam = await runGeneration(spec, runHooksBase, {
        ...opts,
        blueprint,
        useBlueprint: !!blueprint,
      });
      return exam;
    } catch (e) {
      if (useBlueprint && blueprint && opts.allowLegacyFallback !== false) {
        lcDebug.warn('[exam] Blueprint AI path failed, falling back to provider chunk plan:', e.message);
        try {
          const exam = await runGeneration(spec, runHooksBase, {
            ...opts,
            blueprint: null,
            useBlueprint: false,
            allowLegacyFallback: false,
          });
          return exam;
        } catch (fallbackErr) {
          await throwAfterRelease(genTicket, hooks, fallbackErr);
        }
      }
      await throwAfterRelease(genTicket, hooks, e);
    }
  }

  /** Chunked personalized / vocabulary exam — official blueprint Teile when available. */
  async function generatePersonal(spec, hooks, options = {}) {
    const PB = getPromptBuilder();
    const useBlueprint = options.useBlueprint !== false;
    let blueprint =
      options.blueprint !== undefined ? options.blueprint : resolveBlueprint(spec, options);
    if (!useBlueprint) blueprint = null;

    let built;
    if (blueprint && PB.buildPersonalExamChunksFromBlueprint) {
      built = PB.buildPersonalExamChunksFromBlueprint(spec, blueprint);
    } else if (options.useBlueprint === false) {
      built = PB.buildVocabExamChunks ? PB.buildVocabExamChunks(spec) : PB.buildPrompt(spec);
    } else if (PB.buildPersonalExamChunks) {
      built = PB.buildPersonalExamChunks(spec, blueprint);
    } else if (PB.buildVocabExamChunks) {
      built = PB.buildVocabExamChunks(spec);
    } else {
      built = PB.buildPrompt(spec);
    }
    if (built.mode !== 'chunks' || !built.chunks?.length) {
      throw new Error('Personal exam requires chunked prompt mode');
    }
    const startTicket = hooks.startExamTicket;
    if (typeof startTicket !== 'function') {
      throw new Error('hooks.startExamTicket is required for personal exam generation');
    }
    const chunks = built.chunks;
    const bpForValidation = built.blueprint || blueprint || null;
    const maxChunks = computeMaxChunks(chunks.length);
    let genTicket = options.genTicket || null;
    if (!genTicket) {
      genTicket = await startTicket('personal_exam', maxChunks);
    }
    const refreshExamTicket =
      typeof hooks.refreshExamTicket === 'function'
        ? () => hooks.refreshExamTicket('personal_exam', maxChunks)
        : null;
    const runHooksBase = { ...hooks, genTicket, refreshExamTicket };

    try {
      const exam = await runGeneration(spec, runHooksBase, {
        ...options,
        blueprint: bpForValidation,
        useBlueprint: !!bpForValidation,
        legacyChunks: chunks,
        personalExam: true,
        allowLegacyFallback: false,
      });
      exam.vocabPersonal = true;
      exam.personalizedExam = true;
      exam._genTicket = genTicket;
      if (exam._chunkMeta?.failed?.length) {
        exam._partialGen = true;
        exam._failedTeile = exam._chunkMeta.failed.slice();
        exam._succeededTeile = exam._chunkMeta.succeeded.slice();
      }
      return exam;
    } catch (e) {
      await throwAfterRelease(genTicket, hooks, e);
    }
  }

  return Object.freeze({
    contentTypes: ['Exam', 'MiniExam'],
    generate,
    generatePersonal,
    aiPathBlueprintsEnabled,
    computeMaxChunks,
  });
})();

if (typeof window !== 'undefined') window.ExamGenerator = ExamGenerator;
if (typeof module !== 'undefined') module.exports = ExamGenerator;
