# Netlify included_files — admin-api & exam-part (2026-07-29)

## Method

`node scripts/analyze-netlify-function-runtime-deps.mjs` — BFS on `require`/`import` and `resolveFromRoot(...)` from:

| Seed | Purpose |
|------|---------|
| `netlify/functions/admin-api.js` | Cold start + all admin routes |
| `scripts/lib/levelPlanner.mjs` + `poolGapPlanner.mjs` | `pool_gap_probe` dynamic import chain |
| `netlify/functions/exam-part.js` | planModule, vocab pick, GET-by-id, POST quality gate |

**Note:** `netlify/functions/lib/*.js` are esbuild-bundled; they are **not** listed in `included_files`. Only repo-root files loaded at runtime (`resolveFromRoot`, `path.join(ROOT, …)`, dynamic `import(file://…)` under `scripts/`) need packaging.

## pool_gap_probe transitive chain (executed path)

```
admin-api.js
  loadPoolGapProbe()
    scripts/lib/levelPlanner.mjs
      js/data/b1Topics.js, js/data/a2Topics.js (createRequire)
      scripts/lib/examLevelCells.mjs, batchPaths.mjs, loadEnv.mjs
    scripts/lib/poolGapPlanner.mjs
      scripts/lib/lesenTemplatePrompt.mjs  (full module load on import)
        scripts/lib/lexicalCheck.mjs → ../blacklist.mjs  ← scripts/blacklist.mjs (NOT under scripts/lib/)
        scripts/lib/* (promptAssembly, topicRotation, vocabBank, …)
        data/excluded-premises.json, data/lesen-t*-*.json (via *Bank.mjs)
        plantillas-lesen-b1/** (template dir constants / optional reads)
      library/reusable-seed/** (loadPoolRecords)
```

Cold start (before any action): `reusablePartsStore.js` → `partIndex.js` → `js/data/b1Topics.js`, `js/engine/partTopicDetect.js`, `passageVocab.js` → `library/vocab/**`, `data/lexicon/**`.

## exam-part paths (same day)

| Path | Runtime FS needs |
|------|------------------|
| planModule / vocab pick | `js/data/**`, `js/engine/**`, `js/library/**`, `library/vocab/**`, `library/blueprints/**`, lemmatizer lexicon |
| GET + local seed | `library/reusable-seed/**` (`reusablePartsLocalSeed.js`) |
| POST ingest + gate | `js/engine/**` (ExamValidator, partPostprocess, … via `partQualityGate` / `examQualityGate`) — no `scripts/` unless future dynamic gates |

**Gap vs prior exam-part bundle:** missing `library/reusable-seed/**` for local-seed runtime; redundant explicit `netlify/functions/lib/*.js` entries removed.

## Gaps found vs old `included_files`

### admin-api (before unified fix)

| Missing | Why |
|---------|-----|
| `scripts/blacklist.mjs` | Parent of `scripts/lib/`, imported by `lexicalCheck.mjs` |
| `data/excluded-premises.json`, `data/lesen-t2-openings-bank.json`, `data/lesen-t3-names-bank.json` | Lesen prompt / bank helpers in `scripts/lib/*Bank.mjs` |
| `plantillas-lesen-b1/**` | `lesenTemplatePrompt.mjs` template root |
| `library/vocab/**` | `passageVocab` / pool index |
| `scripts/audit-pass-2.mjs` | Pulled by quality-gate script subgraph (same as claude-chat / vocab-bg) |
| `plantillas-horen-b1/**` | Symmetry with vocab-bg; horen prompt paths in shared `scripts/lib` |

### exam-part (before unified fix)

| Missing | Why |
|---------|-----|
| `library/reusable-seed/**` | Local seed pick when `useLocalSeedInRuntime()` |
| Same `scripts/*` + `data/*` + `plantillas/*` as above if any code path imports `scripts/lib` (POST currently uses `js/engine` only; included for parity with hybrid/plan tooling) |

## Unified bundle (both functions)

Applied in one commit to `[functions."admin-api"]` and `[functions."exam-part"]`:

- `library/blueprints/**`, `library/vocab/**`, `library/reusable-seed/**`
- admin-only extras: `library/banks/**`, `library/curated/**`, `library/schemas/**`
- `js/engine/**`, `js/data/**`, `js/library/**`
- `data/lexicon/**` + three explicit `data/*.json` banks
- `knowledge/**`
- `scripts/lib/**`, `scripts/blacklist.mjs`, `scripts/audit-pass-2.mjs`
- `plantillas-lesen-b1/**`, `plantillas-horen-b1/**`

Re-run check:

```bash
node scripts/analyze-netlify-function-runtime-deps.mjs --seeds-only netlify/functions/admin-api.js scripts/lib/levelPlanner.mjs scripts/lib/poolGapPlanner.mjs --json
# missingUnderAdminApi (runtime only): should be empty or plantillas dir edge only
```
