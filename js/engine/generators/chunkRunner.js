/**
 * Runs chunked AI generation (shared by ExamGenerator).
 *
 * Timeout: 55s per chunk — aligned with Netlify claude-chat timeout (60s).
 * Up to 3 chunks run in parallel; genTicket CAS counter on the server is concurrency-safe.
 */
const ChunkRunner = (() => {
  /** Below netlify.toml functions."claude-chat".timeout (60s). */
  const EXAM_CHUNK_TIMEOUT_MS = 55000;
  const CONCURRENCY_LIMIT = 3;

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
    for (let attempt = 0; attempt < 2; attempt++) {
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
