# Personal AI exam generation — timeouts & orchestration

## Netlify function limit

`claude-chat` runs with **timeout = 60s** (`netlify.toml`). The browser client uses **55s** per chunk (`ChunkRunner.EXAM_CHUNK_TIMEOUT_MS`).

Generation uses **Claude Haiku** (`CLAUDE_EXAM_MODEL=claude-haiku-4-5`) for speed; full `TOKEN_BY_LEVEL` budgets (e.g. B1 → 2800) are kept so passages are not truncated.

## Chunk concurrency

`ChunkRunner.run` executes up to **3 chunks in parallel**. The server `genTicket` CAS counter is concurrency-safe — no server changes required.

Completed parts are sorted by `(module, teil)` before merge.

## Multi-module queue (UI)

The configurator generates **one module at a time by default**; optional second module runs serially with its own ticket (`maxChunks` sized per module).

## Answer-key verification (AI only)

When `EXAM_ANSWER_KEY_VERIFY=1`, `finalizePersonalExam` calls `lcValidateExamOnServer` with `verifyAnswerKeys: true` **only for `examSource === 'ai'`**. Library/pool assemblies skip the Sonnet verify pass.

Failed verification rejects the exam (no pool contribution, return to workspace with toast).

## Quota refund on total failure

`startGeneration` charges monthly quota upfront. If generation fails before any usable output, the client calls `releaseGeneration` with `{ unusable: true }` so the server refunds via `decrementQuota` (idempotent per ticket nonce). Partial successes keep the charge.

We do **not** use background generation + polling. Parallel chunks + Haiku + per-module serial tickets keep latency acceptable within function limits.
