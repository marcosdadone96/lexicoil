# vocabularyTags v2.3 — light verbs + exam stems (2026-07-10)

**Version:** `v2.3-lightverb-examstem-2026-07-10`  
**Scope:** `pool-verified/` 134/134 stamped; also reprocessed `pool-content-ok-lesen/` (155).

## Changes (incremental on v2.2)

1. **Light-verb demote** — `machen`, `gehen`, `nehmen`, `geben`, `tun` fill leftover slots only after more specific lemmas; solid/split separables suppress bare root (`mitmachen` → no `machen`). `haben`/`sein` already in STOP.
2. **Collocations** — `es geht darum` / `geht es darum` (emit tag + suppress `gehen`); `worum geht es` / `worum geht's` (suppress only, no learning tag).
3. **Exam-stem strip** — full `Worum geht es …?` formula removed from token text so boilerplate (`Vortrag`, `hauptsächlich`) does not become tags. Fuller per-Teil catalog → BACKLOG `VOCAB-EXAM-STEM`.

## Frequency (pool-verified, question-level tag hits)

| Tag | v2.2 | v2.3 | Δ |
|-----|-----:|-----:|--:|
| `machen` | 31 | **0** | −31 |
| `gehen` | 23 | **1** | −22 |
| `mitmachen` | 14 | 14 | 0 |

Residual `gehen` (1): inspect if legitimate motion verb with thin competing candidates.

## Tests

`node scripts/lib/__tests__/enrichBatchMetadata.vocab.test.mjs` — 38 passed (fixtures 007 / 057 + worum/darum).
