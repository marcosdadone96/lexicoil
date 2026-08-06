# German caps normalize — impact report

**Gate:** v6.1-B-G2 (frozen) (sin modificar)
**Mode:** dry-run
**Files:** 18

## Caps gate findings

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings bloqueantes | 12 | 7 | -5 |
| Promedio/archivo | 0.67 | 0.39 | -0.28 |
| Archivos con findings | 6 | 5 | -1 |

## Normalización aplicada

- Token changes: 25
- Fields touched: 22
- decap fixes: 25
- cap fixes: 0

## Por reason code (antes → después)

- `adj_before_noun`: 6 → 1
- `lexicon_after_adj`: 1 → 1
- `lexicon_nn`: 1 → 1
- `lexicon_override_tag`: 3 → 3
- `verb_census_no_finite`: 1 → 1

## Por Teil

| Teil | archivos | antes | después | Δ |
|---:|---:|---:|---:|---:|
| T1 | 2 | 0 | 0 | 0 |
| T2 | 3 | 2 | 2 | 0 |
| T3 | 3 | 0 | 0 | 0 |
| T4 | 5 | 9 | 4 | -5 |
| T5 | 5 | 1 | 1 | 0 |

Detalle por archivo en el JSON de log.
