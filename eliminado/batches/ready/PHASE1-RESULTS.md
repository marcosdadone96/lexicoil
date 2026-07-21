# Phase 1 — resultados dry-run (v3.1-stable)

**Fix:** `shouldCapitalizeLowerNoun` respeta `ADJ_NEEDS_ARTICLE_GUARD` tras artículo.  
**Tests:** 50/50 (`npm run test:german-caps-normalize`)

## Producción — 15 archivos

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings gate | 7 | 4 | **-3** |
| Findings nuevos | — | — | **0** |
| decap fixes | — | 18 | |
| cap fixes | — | **0** | (ya no revierte) |

**Eliminados:** `Wichtiger` (t4-036), `Kleinen`×2 (t4-037), más decaps en t2/t3/t5 sin finding gate.

**Reason codes:** `adj_before_noun` 4→1

## G2 — 193 archivos (`batches/ready/lesen`)

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings gate | 88 | 85 | **-3** |
| Eliminados | — | 9 | |
| Nuevos | — | 6 | |
| decap / cap | 200 / 41 | | cap sigue subiendo sustantivos reales |

**Findings nuevos (6)** — no son reverts Art+Adj; son otros patrones (cap sube adj fuera del guard):

| archivo | palabra | reason |
|---|---|---|
| lesen-t1-gemini-163 | Vielen | quantifier_capitalized |
| lesen-t2-gemini-089 | Positiven | adj_before_noun |
| lesen-t4-gemini-028 | Frischen | adj_before_noun |
| lesen-t4-gemini-029 | Positiven | adj_before_noun |
| lesen-t4-gemini-034 | Langen | adj_before_noun |
| lesen-t5-gemini-021 | Blaue | adj_before_noun |

**Mayores mejoras:** t5-061 (6→3), t2-060 (5→3), t4-035 (2→0).

Artefactos: `PHASE1-PRODUCTION-15-DRYRUN.json`, `PHASE1-G2-DRYRUN.json`
