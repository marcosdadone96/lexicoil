# German caps normalize — impact report

**Gate:** v6.1-B-G2 (frozen) (sin modificar)
**Mode:** dry-run
**Files:** 193

## Caps gate findings

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings bloqueantes | 88 | 97 | 9 |
| Promedio/archivo | 0.46 | 0.5 | 0.05 |
| Archivos con findings | 37 | 40 | 3 |

## Normalización aplicada

- Token changes: 333
- Fields touched: 304
- decap fixes: 206
- cap fixes: 178

## Por reason code (antes → después)

- `adj_before_noun`: 8 → 18
- `adv_after_pronoun`: 1 → 0
- `adv_before_verb`: 1 → 1
- `lexicon_after_adj`: 1 → 1
- `lexicon_nn`: 5 → 5
- `lexicon_override_tag`: 12 → 14
- `modal_final_infinitive`: 12 → 12
- `modal_noun_object`: 2 → 3
- `prose_strict_homograph`: 10 → 10
- `quantifier_capitalized`: 1 → 1
- `verb_census_no_finite`: 33 → 32
- `zu_adv_capitalized`: 2 → 0

## Por Teil

| Teil | archivos | antes | después | Δ |
|---:|---:|---:|---:|---:|
| T1 | 17 | 9 | 10 | 1 |
| T2 | 15 | 36 | 37 | 1 |
| T3 | 125 | 2 | 2 | 0 |
| T4 | 17 | 14 | 22 | 8 |
| T5 | 19 | 27 | 26 | -1 |

Detalle por archivo en el JSON de log.
