# Changelog

All notable changes to the LexiCoil content pipeline and German caps tooling.

## [germanCapsNormalize v3.0-stable] — 2026-07-08

### Stable baseline (G2 Iteration 3)

Validated on 193 files (`batches/ready/lesen`), decap-only dry-run against frozen gate **v6.1-B-G2**:

- Findings: **88 → 79** (−9 vs baseline, −6 vs Iteration 2)
- **0** new findings vs baseline (Iteration 2 had 8, including 6 real regressions)

### Added

- `GERMAN_CAPS_NORMALIZE_VERSION = 'v3.0-stable'` in `germanCapsNormalize.mjs`
- Technical documentation: `scripts/lib/GERMAN-CAPS-NORMALIZE.md`
- Permanent regression corpus: `scripts/lib/__tests__/germanCapsNormalize.corpus.json`
- Regression tests: `scripts/lib/__tests__/germanCapsNormalize.iter3.test.mjs`
- npm script: `test:german-caps-normalize`
- Gate ground-truth cases for Iter3 (`ok-iter3-*` in `germanCapsGate.groundtruth.json`)

### Fixed (evidence-based, Iteration 2 → 3)

- **Alter:** removed `'alter'` from `ADJ_NEEDS_ARTICLE_GUARD` — noun *Alter* after article no longer decapitalized
- **Sorgen:** load `german-noun-supplement.json` in `buildLexicon()` — plural noun *Sorgen* protected from homograph decap
- **Kosten:** `isModalInfinitiveOvercapitalized` skips when `isKnownGermanNoun(word)` and next token is a nominal-object preposition (`MODAL_NOUN_OBJECT_PREPS`)

### Unchanged (by design)

- `scripts/pos-caps-check.py` / caps gate v6.1-B-G2
- `decap_heuristic_adj_adv`, `fixZuInfinitiveCapitals`, and other heuristics without new false-positive evidence

### Reference artifacts

- `batches/ready/G2-DECAP-ONLY-ITERATION3-RESULTS.md`
- `batches/ready/G2-DECAP-ONLY-ITERATION2-ANALYSIS.md`

## Prior work (summary)

- **G2 decap-only layer** — post-gen normalization separated from gate; `decapOnly` mode for pre-audit
- **v6.1-B-G2 gate frozen** — double-pass POS caps check; holdout validation before pool scale-up
