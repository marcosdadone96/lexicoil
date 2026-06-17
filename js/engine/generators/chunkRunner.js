/**
 * Runs chunked AI generation (shared by ExamGenerator).
 */
const ChunkRunner = (() => {
  async function run(chunks, hooks) {
    const {
      callAI,
      onStep = () => {},
      parseExamJson,
      validateChunkObj,
      promptSuffix = '',
      genTicket = null,  // server-signed ticket issued via startGeneration
    } = hooks;

    // genTicket is REQUIRED for server calls; absence means misconfiguration
    const ai = { examGeneration: true, genTicket, timeoutMs: 40000 };
    const parts = [];
    const failed = [];
    let lastErr = null;

    for (const chunk of chunks) {
      let done = false;
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
        try {
          onStep('Part ' + chunk.label + (attempt ? '… (retry)' : '…'));
          const fixHint =
            attempt > 0
              ? '\n\nFIX: Return a JSON object with required root key ' +
                chunk.expectKey +
                '. No array at root.'
              : '';
          const suffix = (attempt > 0 ? fixHint : '') + (promptSuffix || '');
          const raw = await callAI(chunk.prompt + suffix, chunk.maxTokens, ai);
          parts.push(validateChunkObj(chunk, parseExamJson(raw)));
          done = true;
        } catch (e) {
          lastErr = e;
          if (e.code === 'quota_exceeded') throw e;
        }
      }
      if (!done) failed.push(chunk.label);
    }

    if (!parts.length) throw lastErr || new Error('All exam parts failed to generate.');
    if (failed.length) {
      onStep(`Generated ${parts.length}/${chunks.length} parts. Skipped: ${failed.join(', ')}`);
    }
    return parts;
  }

  return Object.freeze({ run });
})();

if (typeof window !== 'undefined') window.ChunkRunner = ChunkRunner;
if (typeof module !== 'undefined') module.exports = ChunkRunner;
