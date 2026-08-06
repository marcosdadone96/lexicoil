# Hören T1 staging → pool-verified (2026-07-11)

**Files:** `horen-t1-gemini-001` … `005`  
**Topics:** Arbeit, Freizeit, Gesundheit, Wohnen, Familie  
**Dest:** `batches/ready/pool-verified/` (also mirrored in `batches/generated/`)

## Promote path

1. `finalizePoolReady` → **REJECT** all 5 (`topic_mismatch` / `content_topic_mismatch`).
2. Cause: batch umbrella `topicTag` applied to all 5 T1 segments; lexical detector scores alternate topics (e.g. Medien/Konsum under Arbeit). Generation treats Q4 as audit-only; poolReady blocks.
3. Human approval → enrich + `applyPoolRepairs` (caps) → `writePoolVerified` with `_poolContentTopicOverride`.

## Pool Hören T1 after promote

| File | Topic |
|------|--------|
| 001 | Arbeit |
| 002 | Freizeit |
| 003 | Gesundheit |
| 004 | Wohnen |
| 005 | Familie |
| 016 | Sport (pre-existing) |

Staging dir kept as archive: `batches/ready/horen-t1-staging-2026-07-11/`.
