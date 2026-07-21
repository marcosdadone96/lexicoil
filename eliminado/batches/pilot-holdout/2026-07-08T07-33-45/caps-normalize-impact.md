# German caps normalize — impact report

**Gate:** v6.1-B-G2 (frozen) (sin modificar)
**Mode:** dry-run
**Files:** 18

## Caps gate findings

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings bloqueantes | 12 | 12 | 0 |
| Promedio/archivo | 0.67 | 0.67 | 0 |
| Archivos con findings | 6 | 6 | 0 |

## Normalización aplicada

- Token changes: 1
- Fields touched: 1
- decap fixes: 25
- cap fixes: 24

## Por reason code (antes → después)

- `adj_before_noun`: 6 → 6
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
| T4 | 5 | 9 | 9 | 0 |
| T5 | 5 | 1 | 1 | 0 |

Detalle por archivo en el JSON de log.
