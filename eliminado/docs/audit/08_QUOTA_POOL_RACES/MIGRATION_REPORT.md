# Phase 08 — QUOTA_POOL_RACES — Migration Report

**Status:** Complete  
**Date:** 2026-06-12  
**Scope:** Patch-only on Netlify Blobs (no DB/auth migration)

## Problem

1. **Quota TOCTOU** — `checkQuota` read count, then `incrementQuota` wrote `count+1` without atomicity. Concurrent requests could both read the same value and only one increment would survive (lost quota charges or over-grants depending on ordering).

2. **Pool index races** — `exam-pool.js` stored one JSON array per level (`pool_index:{lang}:{level}`), mutated with `push`/`shift`. Concurrent POST handlers performed read-modify-write on the same blob → last-write-wins, lost index entries, and orphaned exam blobs.

## Changes

### Quota (`netlify/functions/lib/quotaLib.js`)

- Added **compare-and-set** via `casBlob.js` using Netlify Blobs `getWithMetadata` + `setJSON({ onlyIfMatch })`.
- First write uses `onlyIfNew` so concurrent creators serialize safely.
- Exponential backoff (max 5 retries) with structured logs: `[quota-cas] conflict …` / `resolved …`.
- **Idempotency:** optional `requestId` → blob `quota:{email}:idem:{requestId}` (or guest equivalent) with `onlyIfNew`. Retries of the same generation do not double-charge.
- Payload now includes a `version` counter (informational; etag is the CAS token).

**Client:** `js/services/claudeClient.js` — `commitExamQuota()` sends a stable `requestId` per commit attempt (cleared on success, retained on failure for retry).

**Server:** `netlify/functions/claude-chat.js` — forwards `body.requestId` to `incrementQuota` for both `quotaOnly` and post-generation paths.

### Pool index (`netlify/functions/lib/poolIndex.js`, `exam-pool.js`)

- **Per-exam blobs:** `pool:{lang}:{level}:{id}` (unchanged key shape).
- **Append-only index entries:** `pool_idx:{lang}:{level}:{id}` — one small blob per exam, created with `onlyIfNew` (never rewrite a shared array).
- **Serve:** `list({ prefix })` + random sample; legacy `pool_index:*` arrays migrated lazily on first read.
- **Rotation:** delete oldest entries by `createdAt` when count exceeds `MAX_PER_LEVEL` (50) — not `shift` on a shared blob.
- **servedCount** updates use CAS on the exam blob (`[pool-serve]` log tag).

### New modules

| File | Role |
|------|------|
| `netlify/functions/lib/casBlob.js` | Generic etag CAS + idempotency helpers |
| `netlify/functions/lib/poolIndex.js` | Append-only pool publish/serve/rotate |
| `scripts/test-concurrency-quota-pool.mjs` | In-memory CAS mock tests |

## Tests

```
node scripts/test-concurrency-quota-pool.mjs
```

Covers:

- 25 concurrent quota increments → final `used === 25`
- Same `requestId` retried 3× → `used === 1`
- 15 concurrent pool publishes → 15 index entries + exam blobs
- Rotation caps at `MAX_PER_LEVEL`, drops oldest by timestamp

Wired into `npm run test:engine`.

## Acceptance checklist

- [x] Quota with compare-and-set + retries + idempotency
- [x] Pool index without push/shift on shared blob (per-item keys / append-only)
- [x] Rotation by timestamp, not shift
- [x] Conflict/retry logging (`[quota-cas]`, `[pool-index]`, `[pool-serve]`)
- [x] Concurrency tests: correct final quota count; no lost pool entries
- [x] Residual risk documented below
- [x] No DB or auth changes
- [x] This report

## Residual risk

CAS **reduces but does not eliminate** contention:

| Area | Residual window |
|------|-----------------|
| Quota | If all 5 CAS retries fail (`cas_write_exhausted`), increment throws → caller may surface 503; count is not silently wrong. Extremely hot keys (same user, many parallel tabs) may see transient failures. |
| Quota check vs increment | `checkQuota` is still a separate read; a burst can pass check then fail increment (429/503). Idempotency prevents double-charge on retry, not over-admission at check time. |
| Guest quota | Still keyed by IP hash (spoofable via `X-Forwarded-For`). Documented for phase 09; not hardened here. |
| Pool rotation | Delete index + exam blob is not transactional; a crash mid-rotation could leave a dangling exam blob (harmless) or index pointing to deleted exam (skipped on serve). |
| Pool list | `store.list` is eventually consistent; a just-published exam may not appear for a few hundred ms. GET falls back to seed file when empty. |
| Legacy index | Old `pool_index:*` blobs are migrated on read but not deleted; safe to garbage-collect later. |

**Bridge note:** Full transactional guarantees (Postgres/Supabase) remain **design-only in phase 09**.

## Files touched

- `netlify/functions/lib/casBlob.js` (new)
- `netlify/functions/lib/poolIndex.js` (new)
- `netlify/functions/lib/quotaLib.js`
- `netlify/functions/exam-pool.js`
- `netlify/functions/claude-chat.js`
- `js/services/claudeClient.js`
- `scripts/test-concurrency-quota-pool.mjs` (new)
- `package.json` (`test:engine`)
