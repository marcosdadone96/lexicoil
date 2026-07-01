/**
 * Runs chunked AI generation (shared by ExamGenerator).
 *
 * Lesen Teil 2 and Teil 4 use split sub-calls (~26s each, Haiku) to stay under Netlify ~30s limit.
 * Other chunks: 55s client timeout (netlify.toml claude-chat timeout = 60s).
 */
const ChunkRunner = (() => {
  /** Below netlify.toml functions."claude-chat".timeout (60s). */
  const EXAM_CHUNK_TIMEOUT_MS = 55000;
  const CONCURRENCY_LIMIT = 3;

  function getLesenT4Split() {
    if (typeof LesenTeil4Split !== 'undefined') return LesenTeil4Split;
    try {
      return require('./lesenTeil4Split.js');
    } catch {
      return null;
    }
  }

  function getLesenT2Split() {
    if (typeof LesenTeil2Split !== 'undefined') return LesenTeil2Split;
    try {
      return require('./lesenTeil2Split.js');
    } catch {
      return null;
    }
  }

  function isTicketError(err) {
    const code = err?.code || '';
    const msg = String(err?.message || '').toLowerCase();
    return (
      code === 'ticket_invalid' ||
      code === 'ticket_required' ||
      code === 'ticket_scope_invalid' ||
      /ticket.*invalid|ticket.*expired|ticket_required/.test(msg)
    );
  }

  function moduleRank(chunk) {
    const k = String(chunk?.expectKey || chunk?.moduleId || '').toLowerCase();
    if (/lesen|reading/.test(k)) return 0;
    if (/horen|listening/.test(k)) return 1;
    if (/schreiben|writing/.test(k)) return 2;
    if (/sprechen|speaking/.test(k)) return 3;
    return 9;
  }

  function sortByModuleTeil(results) {
    return [...results].sort((a, b) => {
      const md = moduleRank(a.chunk) - moduleRank(b.chunk);
      if (md) return md;
      return (a.chunk.teil ?? 0) - (b.chunk.teil ?? 0);
    });
  }

  function logLesenTeil4(msg) {
    if (typeof lcDebug !== 'undefined') lcDebug.log(msg);
    console.log(msg);
  }

  function classifyLesenTeil4Fail(err) {
    if (!err) return 'empty';
    const code = String(err.code || '');
    const msg = String(err.message || '').toLowerCase();
    if (code === 'timeout' || msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
    if (
      msg.includes('json') ||
      msg.includes('parse') ||
      msg.includes('chunk not') ||
      msg.includes('missing lesen') ||
      msg.includes('could not parse')
    ) {
      return 'json_parse';
    }
    if (msg.includes('empty')) return 'empty';
    return 'api_error';
  }

  async function runOneChunk(chunk, hooks, ai) {
    const {
      callAI,
      onStep = () => {},
      onChunkResult = () => {},
      parseExamJson,
      validateChunkObj,
      promptSuffix = '',
      refreshExamTicket = null,
    } = hooks;

    let lastErr = null;
    const SplitT4 = getLesenT4Split();
    const SplitT2 = getLesenT2Split();
    const isLesenForumT4 = SplitT4?.isLesenForumT4Chunk?.(chunk) || false;
    const isLesenPressT2 = SplitT2?.isLesenT2SplitChunk?.(chunk) || false;

    if (isLesenPressT2 && SplitT2?.runSplit) {
      try {
        onStep('Part ' + chunk.label + '…');
        const part = await SplitT2.runSplit(chunk, hooks, ai);
        onChunkResult({ label: chunk.label, status: 'ok', attempt: 0 });
        return { ok: true, part, chunk };
      } catch (e) {
        lastErr = e;
        logLesenTeil4('[GEN lesen teil2] FAIL reason=' + classifyLesenTeil4Fail(e));
        onChunkResult({ label: chunk.label, status: 'failed' });
        return { ok: false, chunk, error: lastErr };
      }
    }

    if (isLesenForumT4 && SplitT4?.runSplit) {
      try {
        onStep('Part ' + chunk.label + '…');
        const part = await SplitT4.runSplit(chunk, hooks, ai);
        onChunkResult({ label: chunk.label, status: 'ok', attempt: 0 });
        return { ok: true, part, chunk };
      } catch (e) {
        lastErr = e;
        logLesenTeil4('[GEN lesen teil4] FAIL reason=' + classifyLesenTeil4Fail(e));
        onChunkResult({ label: chunk.label, status: 'failed' });
        return { ok: false, chunk, error: lastErr };
      }
    }

    const slotType = String(chunk.blueprintPart?.slotType || '').toLowerCase();
    const teilNum = Number(chunk.teil ?? chunk.blueprintPart?.teil);
    const expectKey = String(chunk.expectKey || '').toLowerCase();
    const isHorenDiscussionT4 =
      slotType.includes('discussion') && teilNum === 4 && /horen|listening/.test(expectKey);
    const isForumChunk = slotType.includes('forum');
    const maxAttempts = isForumChunk ? 3 : 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      try {
        onStep('Part ' + chunk.label + (attempt ? '… (retry)' : '…'));
        const slot = slotType;
        let fixHint =
          attempt > 0
            ? '\n\nFIX: Return a JSON object with required root key ' +
              chunk.expectKey +
              '. No array at root.'
            : '';
        if (attempt > 0 && slot.includes('forum')) {
          const BP =
            typeof BlueprintPromptBinding !== 'undefined'
              ? BlueprintPromptBinding
              : null;
          fixHint += BP?.forumOpinionsRetryHint?.() || '';
        }
        if (attempt > 0 && isHorenDiscussionT4) {
          fixHint +=
            '\n\nFIX (Hören Teil 4): Return ONE horenParts object with segments[]; concise transcript 280–380 words; EXACTLY 8 matching statements in segment.questions[].';
        }
        if (attempt > 0 && slot.includes('short_texts') && teilNum === 1 && /horen|listening/.test(expectKey)) {
          fixHint +=
            '\n\nFIX (Hören Teil 1): segments[] with EXACTLY 5 independent short texts. Each segment: brief transcript + exactly 2 questions (1× R/F + 1× MC a/b/c). Total 10 items — NOT 5 items in one block.';
        }
        if (attempt > 0) {
          const Mod =
            typeof ModuleInstructions !== 'undefined' ? ModuleInstructions : null;
          const ek = String(chunk.expectKey || '').toLowerCase();
          const langHint = /lesen|horen|schreiben|sprechen/.test(ek)
            ? 'german'
            : /reading|listening|writing|speaking/.test(ek)
              ? 'english'
              : 'german';
          fixHint += Mod?.grammarRetryHint?.(langHint) || '';
        }
        if (attempt > 0 && slot.includes('ads')) {
          fixHint +=
            '\n\nFIX (Lesen Teil 3): Return valid JSON with part.ads[] (10 short ads A–J, 1–2 sentences each) and items[] situations. Keep ad texts brief.';
        }
        if (attempt > 0 && teilNum === 2 && /lesen|reading/.test(expectKey)) {
          fixHint +=
            '\n\nFIX (Lesen Teil 2): passages:[{passageId:"A",text,textTitle},{passageId:"B",text,textTitle}] with 3 MC questions each (passageId A/B). No ghost Text B.';
        }
        const suffix = (attempt > 0 ? fixHint : '') + (promptSuffix || '');
        const raw = await callAI(chunk.prompt + suffix, chunk.maxTokens, {
          ...ai,
          examModel: chunk.forceExamModel || ai.examModel,
          chunkTeil: chunk.chunkTeil ?? chunk.teil,
          chunkSlotType: chunk.chunkSlotType || chunk.blueprintPart?.slotType,
        });
        const part = validateChunkObj(chunk, parseExamJson(raw));
        onChunkResult({ label: chunk.label, status: 'ok', attempt });
        return { ok: true, part, chunk };
      } catch (e) {
        lastErr = e;
        if (e.code === 'quota_exceeded') throw e;
        if (isTicketError(e) && typeof refreshExamTicket === 'function' && attempt === 0) {
          try {
            ai.genTicket = await refreshExamTicket();
            onStep('Session refreshed — retrying ' + chunk.label + '…');
            continue;
          } catch (refreshErr) {
            lastErr = refreshErr;
          }
        }
      }
    }
    onChunkResult({ label: chunk.label, status: 'failed' });
    return { ok: false, chunk, error: lastErr };
  }

  async function run(chunks, hooks) {
    const ai = { examGeneration: true, genTicket: hooks.genTicket, timeoutMs: EXAM_CHUNK_TIMEOUT_MS };
    let nextIdx = 0;
    const outcomes = [];

    async function worker() {
      while (true) {
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const chunk = chunks[idx];
        const result = await runOneChunk(chunk, hooks, ai);
        outcomes.push(result);
      }
    }

    const poolSize = Math.min(CONCURRENCY_LIMIT, chunks.length);
    await Promise.all(Array.from({ length: poolSize }, () => worker()));

    const okResults = sortByModuleTeil(outcomes.filter((o) => o.ok));
    const parts = okResults.map((o) => o.part);
    const succeeded = okResults.map((o) => o.chunk.label);
    const failed = outcomes.filter((o) => !o.ok).map((o) => o.chunk.label);
    let lastErr = outcomes.find((o) => !o.ok)?.error || null;

    const meta = { succeeded, failed, total: chunks.length };
    if (!parts.length) {
      const err = lastErr || new Error('All exam parts failed to generate.');
      err.chunkMeta = meta;
      throw err;
    }
    if (failed.length) {
      hooks.onStep?.(`Generated ${parts.length}/${chunks.length} parts. Skipped: ${failed.join(', ')}`);
    }
    return { parts, meta };
  }

  return Object.freeze({ run, EXAM_CHUNK_TIMEOUT_MS, CONCURRENCY_LIMIT });
})();

if (typeof window !== 'undefined') window.ChunkRunner = ChunkRunner;
if (typeof module !== 'undefined') module.exports = ChunkRunner;

