# German caps normalize — impact report

**Gate:** v6.1-B-G2 (frozen) (sin modificar)
**Mode:** dry-run
**Files:** 364

## Caps gate findings

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings bloqueantes | 209 | 192 | -17 |
| Promedio/archivo | 0.57 | 0.53 | -0.05 |
| Archivos con findings | 116 | 115 | -1 |

## Normalización aplicada

- Token changes: 534
- Fields touched: 447
- decap fixes: 376
- cap fixes: 155

## Por reason code (antes → después)

- `adj_after_prep`: 2 → 0
- `adj_before_noun`: 24 → 16
- `adv_after_pronoun`: 1 → 0
- `adv_before_verb`: 2 → 1
- `adv_capitalized`: 2 → 0
- `lexicon_after_adj`: 6 → 9
- `lexicon_nn`: 16 → 11
- `lexicon_override_tag`: 47 → 47
- `modal_final_infinitive`: 27 → 27
- `modal_noun_object`: 2 → 4
- `prose_strict_homograph`: 17 → 17
- `quantifier_capitalized`: 1 → 1
- `verb_census_no_finite`: 60 → 59
- `zu_adv_capitalized`: 2 → 0

## Por Teil

| Teil | archivos | antes | después | Δ |
|---:|---:|---:|---:|---:|
| T1 | 80 | 26 | 25 | -1 |
| T2 | 53 | 87 | 82 | -5 |
| T3 | 139 | 7 | 7 | 0 |
| T4 | 35 | 34 | 27 | -7 |
| T5 | 57 | 55 | 51 | -4 |

Detalle por archivo en el JSON de log.
