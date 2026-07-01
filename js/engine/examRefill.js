/**
 * Refill short exam parts after verification — AI (same passage) then bank fallback.
 */
const ExamRefill = (() => {
  const MAX_AI_ATTEMPTS = 2;

  function getPart(exam, deficit) {
    return (exam[deficit.key] || []).find((p) => Number(p.teil) === Number(deficit.teil));
  }

  function passageSnapshot(part, mod) {
    if (mod === 'lesen') {
      return {
        text: part.text || '',
        textTitle: part.textTitle || '',
        ads: part.ads || null,
        instruction: part.instruction || '',
      };
    }
    if (mod === 'horen') {
      const segs = (part.segments || []).map((s) => ({
        label: s.label,
        transcript: s.transcript || '',
      }));
      return {
        transcript: part.transcript || '',
        segments: segs,
        instruction: part.instruction || '',
      };
    }
    return {};
  }

  function restorePassage(part, mod, snap) {
    if (!part || !snap) return;
    if (mod === 'lesen') {
      if (snap.text) part.text = snap.text;
      if (snap.textTitle) part.textTitle = snap.textTitle;
      if (snap.ads?.length) part.ads = snap.ads;
      if (snap.instruction) part.instruction = snap.instruction;
    } else if (mod === 'horen') {
      if (snap.transcript) part.transcript = snap.transcript;
      if (snap.segments?.length && part.segments?.length) {
        snap.segments.forEach((ss, i) => {
          if (part.segments[i] && ss.transcript) part.segments[i].transcript = ss.transcript;
        });
      }
      if (snap.instruction) part.instruction = snap.instruction;
    }
  }

  async function buildRefillSpec(subject, level, words, deficit, blueprint) {
    const Domain = typeof LexiCoilDomain !== 'undefined' ? LexiCoilDomain : null;
    const KE = typeof KnowledgeEngine !== 'undefined' ? KnowledgeEngine : null;
    if (!Domain || !KE) throw new Error('KnowledgeEngine not loaded');
    const provider = { de: 'goethe', en: 'cambridge', es: 'dele' }[subject];
    let targetWords = [...(words || [])];
    if (typeof ManualVocab !== 'undefined' && ManualVocab.canonicalizeForGeneration) {
      const canon = await ManualVocab.canonicalizeForGeneration(targetWords, subject, level);
      targetWords = canon.words;
    }
    const spec = await KE.buildSpec({
      language: Domain.languageFromSubjectCode(subject),
      level,
      provider,
      contentType: 'VocabularyExercise',
      targetWords,
      topic: 'Personal vocabulary review',
      skills: [deficit.module],
      vocabPolicy: { targetWords, maximizeCoverage: true },
    });
    if (blueprint) spec.metadata = { ...(spec.metadata || {}), blueprint };
    spec.personalTeilFilter = deficit.teil;
    return spec;
  }

  async function refillWithAI({
    exam,
    deficit,
    configWords,
    subject,
    level,
    blueprint,
    hooks,
    genTicket,
  }) {
    const ER = typeof ExamRenumber !== 'undefined' ? ExamRenumber : null;
    if (!ER) return { added: 0, ok: false };

    const existing = getPart(exam, deficit);
    if (!existing) return { added: 0, ok: false };

    const need = deficit.missing ?? deficit.expected - deficit.actual;
    if (need <= 0) return { added: 0, ok: true };

    const snap = passageSnapshot(existing, deficit.module);
    const before = ER.countScorableInPart(existing, deficit.module);
    const range = ER.teilRange(blueprint, deficit.module, deficit.teil, existing);
    const startNum = range.start + before;

    const PB = typeof PromptBuilder !== 'undefined' ? PromptBuilder : null;
    if (!PB?.buildRefillChunk) return { added: 0, ok: false };

    const spec = await buildRefillSpec(subject, level, configWords, deficit, blueprint);
    const chunk = PB.buildRefillChunk(spec, {
      deficit,
      existingPart: existing,
      need,
      startNum,
      blueprint,
    });
    if (!chunk) return { added: 0, ok: false };

    const CR = typeof ChunkRunner !== 'undefined' ? ChunkRunner : null;
    if (!CR?.run) return { added: 0, ok: false };

    const runHooks = {
      ...hooks,
      genTicket: genTicket || exam._genTicket,
      promptSuffix: '',
    };

    const result = await CR.run([chunk], runHooks);
    const parts = result.parts || [];
    if (!parts.length) return { added: 0, ok: false };

    const refillExam = hooks.mergeExamParts(...parts, exam.topic || 'Refill');
    ER.mergeTeilPart(exam, refillExam, deficit.module, deficit.teil, blueprint);
    restorePassage(getPart(exam, deficit), deficit.module, snap);

    const after = ER.countScorableInPart(getPart(exam, deficit), deficit.module);
    return { added: Math.max(0, after - before), ok: after > before };
  }

  async function refillFromBank({ exam, deficit, subject, level, blueprint }) {
    const ER = typeof ExamRenumber !== 'undefined' ? ExamRenumber : null;
    const EB = typeof ExamBlueprint !== 'undefined' ? ExamBlueprint : null;
    if (!ER || !EB) return { added: 0, ok: false };
    if (typeof LibraryLoader === 'undefined' || !LibraryLoader.hasLibrary(subject, level)) {
      return { added: 0, ok: false };
    }

    const existing = getPart(exam, deficit);
    if (!existing) return { added: 0, ok: false };

    const need = deficit.missing ?? deficit.expected - deficit.actual;
    if (need <= 0) return { added: 0, ok: true };

    const before = ER.countScorableInPart(existing, deficit.module);
    const snap = passageSnapshot(existing, deficit.module);

    try {
      const bank = await LibraryLoader.load(subject, level);
      const mod = blueprint?.modules?.find((m) => m.id === deficit.module);
      if (!mod) return { added: 0, ok: false };
      const partialBp = { ...blueprint, modules: [mod] };
      const assembled = EB.assemble(bank, partialBp, {});
      ER.mergeTeilPart(exam, assembled, deficit.module, deficit.teil, blueprint);
      restorePassage(getPart(exam, deficit), deficit.module, snap);

      const part = getPart(exam, deficit);
      const over = ER.countScorableInPart(part, deficit.module) - (deficit.expected || before + need);
      if (over > 0 && part) {
        const trim = over;
        if (deficit.module === 'lesen' && part.questions?.length) {
          part.questions = part.questions.slice(0, Math.max(0, part.questions.length - trim));
        } else if (deficit.module === 'horen' && part.segments?.[0]?.questions?.length) {
          const qs = part.segments[0].questions;
          part.segments[0].questions = qs.slice(0, Math.max(0, qs.length - trim));
        }
      }

      const after = ER.countScorableInPart(getPart(exam, deficit), deficit.module);
      return { added: Math.max(0, after - before), ok: after > before };
    } catch (err) {
      if (typeof lcDebug !== 'undefined') lcDebug.warn('[refill] bank fallback failed:', err);
      return { added: 0, ok: false };
    }
  }

  async function verifyExam(exam, validateFn) {
    if (typeof validateFn !== 'function') return exam;
    const srv = await validateFn(exam, { verifyAnswerKeys: true, discardFailedItems: true });
    if (!srv?.exam) return exam;
    for (const k of ['lesenParts', 'horenParts']) {
      if (Array.isArray(srv.exam[k])) exam[k] = srv.exam[k];
    }
    return exam;
  }

  /**
   * Refill all deficits: up to 2 AI attempts per Teil, then bank, then re-verify.
   */
  async function refillAllDeficits({
    exam,
    deficits,
    subject,
    level,
    blueprint,
    configWords,
    hooks,
    genTicket,
    validateFn,
    onProgress,
  }) {
    const ER = typeof ExamRenumber !== 'undefined' ? ExamRenumber : null;
    if (!ER || !deficits?.length) return { refilled: 0, remaining: deficits?.length || 0 };

    let refilled = 0;
    const sorted = [...deficits].sort(
      (a, b) => a.module.localeCompare(b.module) || a.teil - b.teil,
    );

    for (const d of sorted) {
      onProgress?.(`Refilling ${d.module} Teil ${d.teil} (${d.actual}/${d.expected})…`);
      let part = getPart(exam, d);
      let actual = ER.countScorableInPart(part, d.module);
      let missing = d.expected - actual;
      if (missing <= 0) continue;

      for (let attempt = 0; attempt < MAX_AI_ATTEMPTS && missing > 0; attempt++) {
        const freshDeficit = { ...d, actual, missing };
        const res = await refillWithAI({
          exam,
          deficit: freshDeficit,
          configWords,
          subject,
          level,
          blueprint,
          hooks,
          genTicket,
        });
        if (res.added > 0) {
          exam = await verifyExam(exam, validateFn);
          ER.renumberExam(exam, blueprint);
          refilled += 1;
        }
        part = getPart(exam, d);
        actual = ER.countScorableInPart(part, d.module);
        missing = d.expected - actual;
      }

      if (missing > 0) {
        onProgress?.(`Bank fallback ${d.module} Teil ${d.teil}…`);
        const bankRes = await refillFromBank({ exam, deficit: { ...d, missing }, subject, level, blueprint });
        if (bankRes.added > 0) {
          exam = await verifyExam(exam, validateFn);
          ER.renumberExam(exam, blueprint);
          refilled += 1;
        }
      }
    }

    ER.renumberExam(exam, blueprint);
    const remaining = ER.collectDeficits(exam, blueprint).length;
    return { refilled, remaining, exam };
  }

  return Object.freeze({
    refillAllDeficits,
    refillWithAI,
    refillFromBank,
    MAX_AI_ATTEMPTS,
  });
})();

if (typeof window !== 'undefined') window.ExamRefill = ExamRefill;
if (typeof module !== 'undefined') module.exports = ExamRefill;
