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

  async function runGeneration(spec, hooks, options) {
    const blueprint = options.blueprint || null;
    const strictValidate = !!blueprint && options.useBlueprint !== false;
    const chunks = options.legacyChunks || resolveChunks(spec, blueprint);
    let validationFeedback = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const runHooks = validationFeedback
        ? {
            ...hooks,
            validationFeedback,
            promptSuffix: getBlueprintBinding()?.validationRetryHint?.(validationFeedback) || '',
          }
        : hooks;

      const parts = await getChunkRunner().run(chunks, runHooks);
      const topic = spec.topic || 'Exam';
      const merged = hooks.mergeExamParts(...parts, topic);
      const normalized =
        typeof hooks.normalizeExam === 'function' ? hooks.normalizeExam(merged) : merged;

      if (strictValidate) {
        const Validator = getExamValidator();
        if (Validator) {
          const check = new Validator().validate(normalized, { blueprint, strict: true });
          if (!check.valid) {
            if (attempt === 0) {
              validationFeedback = check.errors;
              continue;
            }
            const err = new Error(
              'Generated exam failed blueprint validation: ' + check.errors.join(', '),
            );
            err.code = 'blueprint_validation_failed';
            err.validationErrors = check.errors;
            throw err;
          }
        }
      }

      return assertExamValid(normalized, hooks, {
        strict: strictValidate,
        blueprint: strictValidate ? blueprint : false,
      });
    }

    throw new Error('Exam generation failed after validation retry');
  }

  async function generate(spec, hooks, options) {
    const opts = options || {};
    const useBlueprint = opts.useBlueprint ?? aiPathBlueprintsEnabled();
    let blueprint = useBlueprint ? resolveBlueprint(spec, opts) : null;

    if (useBlueprint && !blueprint) {
      lcDebug.warn('[exam] AI_PATH_BLUEPRINTS enabled but no blueprint found — legacy chunk plan');
    }

    try {
      const exam = await runGeneration(spec, hooks, {
        ...opts,
        blueprint,
        useBlueprint: !!blueprint,
      });
      if (hooks.commitExamQuota) await hooks.commitExamQuota();
      return exam;
    } catch (e) {
      if (useBlueprint && blueprint && opts.allowLegacyFallback !== false) {
        lcDebug.warn('[exam] Blueprint AI path failed, falling back to provider chunk plan:', e.message);
        const exam = await runGeneration(spec, hooks, {
          ...opts,
          blueprint: null,
          useBlueprint: false,
          allowLegacyFallback: false,
        });
        if (hooks.commitExamQuota) await hooks.commitExamQuota();
        return exam;
      }
      throw e;
    }
  }

  /** Single-shot personalized / vocabulary exam */
  async function generatePersonal(spec, hooks) {
    const PB = getPromptBuilder();
    const built = PB.buildPrompt(spec);
    if (built.mode !== 'single') {
      throw new Error('Personal exam requires single prompt mode');
    }
    const raw = await hooks.callAI(built.prompt, built.maxTokens, {
      consumeQuota: true,
      examGeneration: true,
    });
    const parsed = hooks.parseExamJson(raw.replace(/```json|```/g, '').trim());
    return assertExamValid(parsed, hooks);
  }

  return Object.freeze({
    contentTypes: ['Exam', 'MiniExam'],
    generate,
    generatePersonal,
    aiPathBlueprintsEnabled,
  });
})();

if (typeof window !== 'undefined') window.ExamGenerator = ExamGenerator;
if (typeof module !== 'undefined') module.exports = ExamGenerator;
