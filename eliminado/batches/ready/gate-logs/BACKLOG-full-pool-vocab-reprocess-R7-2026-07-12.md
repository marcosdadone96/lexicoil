# BACKLOG — full-pool vocabularyTags reprocess (R7 / v2.3.10)

**Status:** pending (do not run standalone)

**Done surgically (2026-07-12):** only the 3 files with genuine explanation-only meta residue:
- `horen-t3-gemini-008.json`
- `horen-t3-gemini-009.json`
- `lesen-t1-gemini-177.json`

**Still pending:** force-reprocess of the remaining pool (~145 files; 148 total) under `VOCAB_TAGS_NORMALIZE_VERSION = v2.3.10-no-explanation-2026-07-12`.

**Why not now:** excluding `explanation` from the vocab blob can reshuffle tag ranking even when there is no meta residue. Touching all 148 without another reason creates noise and conflicts with other pool work.

**When to run:** bundle with the next *real* reason to rewrite pool-wide `vocabularyTags` (e.g. another lemmatizer/caps vocab version bump). Do **not** schedule a dedicated “R7 full pool” pass by itself.

**Evidence of surgical pass:** `batches/ready/gate-logs/r7-vocab-3files-reprocess-2026-07-12.json`
