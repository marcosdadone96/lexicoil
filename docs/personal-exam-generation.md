# Personal AI exam generation — timeouts & orchestration

## Netlify function limit

`claude-chat` runs with **timeout = 60s** (`netlify.toml`). The browser client uses **55s** per chunk (`ChunkRunner.EXAM_CHUNK_TIMEOUT_MS`).

Generation uses **Claude Haiku** (`CLAUDE_EXAM_MODEL=claude-haiku-4-5`) for speed; Lesen Teil 3 uses Sonnet when needed for ads_matching.

## Local dev (`netlify dev`)

The Netlify CLI often enforces a **30s** function timeout locally unless the linked site has `functions_timeout` ≥ 60. Run `netlify link` against production (Site → Functions → timeout **60s**). Do **not** add `[dev.functions."claude-chat"]` in `netlify.toml` — it breaks `netlify dev` (TypeError on path).

For best parity with production:

1. Run `netlify link` against the production site (Site settings → Functions → timeout should be **60s**).
2. Start with `netlify dev` (not `--offline` unless you accept 30s limits).
3. If chunks still time out, rely on **reusable-parts pool fallback** (seed with `npm run seed:reusable-curated -- --apply`).

## Split generation (under 30s per call)

Long Lesen Teile are split into sequential Haiku sub-calls (~26s each):

| Teil | Strategy |
|------|----------|
| Lesen 2 | Shell + Text A (3 MCQ) + Text B (3 MCQ) — `LesenTeil2Split` |
| Lesen 3 | Single Sonnet call (10 ads + 7 items) — already stable |
| Lesen 4 | Shell + opinion batches — `LesenTeil4Split` |
| Hören 2 / 3 | AI (Haiku); 1 retry then pool if count invalid |
| Hören 1 / 4 | **Always from pool** (never AI) — curated bank via `preloadHorenPoolFirstTeils` |

## Hard item counts

A Teil with fewer scorable items than the blueprint (`itemsTotal`) is **invalid**. Flow: 1 AI retry → pool replacement for that Teil. Official B1 targets: Lesen 6/6/7/7/4, Hören 10/5/7/8. Hören T4 also requires coherent M+A+B speaker attribution (no third guest).

## Vocabulary coverage (informational)

After assembly, `PersonalExamCoverage` sets `exam._coverageByPart` and `exam._coverageOverall`. Pool-served Teile count as 0 user words (expected). Toast + exam banner explain X/N words used; no blocking or credit impact.

## Pool fallback (reusable parts)

When AI generation or retry fails, `finalizePersonalExam` fetches a verified part from the **reusable-parts store** (`exam-part.js` + `fetchExamPart` with `teil` filter).

Seed the fallback network from the 12 curated B1 exams:

```bash
node scripts/seed-reusable-from-curated.mjs --dry-run
NETLIFY_SITE_ID=... NETLIFY_API_TOKEN=... node scripts/seed-reusable-from-curated.mjs --apply --verify
```

This yields ≥12 parts per Teil (Lesen 1–5, Hören 1–4). Parts from pool are **not** re-ingested after serving.

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

We do **not** use background generation + polling. Split sub-calls + Haiku + pool fallback + per-module serial tickets keep latency acceptable within function limits.
