# G2 decap-only — Iteration 3 results

> **Baseline estable:** `germanCapsNormalize v3.0-stable` — implementación de referencia para normalización alemana post-generación. Ver `scripts/lib/GERMAN-CAPS-NORMALIZE.md`.

**Gate:** v6.1-B-G2 (frozen)
**Pool:** `batches/ready/lesen` · 193 archivos
**Generado:** 2026-07-08T14:28:44.278Z

## Comparación global

| Métrica | Baseline | Iteration2 | Iteration3 |
|---|---:|---:|---:|
| Findings totales | 88 | 85 | 79 |
| Eliminados (vs baseline) | — | 11 | 9 |
| Nuevos (vs baseline) | — | 8 | 0 |
| avg/file | 0.456 | 0.440 | 0.409 |
| Archivos con findings | 37 | 37 | 35 |

## Por Teil

| Teil | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |
|---:|---:|---:|---:|---:|
| T1 | 9 | 8 | 8 | +0 |
| T2 | 36 | 37 | 33 | -4 |
| T3 | 2 | 2 | 2 | +0 |
| T4 | 14 | 12 | 12 | +0 |
| T5 | 27 | 26 | 24 | -2 |

## Reason codes

| Reason | Baseline | Iteration2 | Iteration3 | Δ I2→I3 |
|---|---:|---:|---:|---:|
| `adj_before_noun` | 8 | 4 | 4 | +0 |
| `adv_after_pronoun` | 1 | 0 | 0 | +0 |
| `adv_before_verb` | 1 | 1 | 1 | +0 |
| `lexicon_after_adj` | 1 | 1 | 1 | +0 |
| `lexicon_nn` | 5 | 8 | 5 | -3 |
| `lexicon_override_tag` | 12 | 14 | 12 | -2 |
| `modal_final_infinitive` | 12 | 12 | 12 | +0 |
| `modal_noun_object` | 2 | 3 | 2 | -1 |
| `prose_strict_homograph` | 10 | 10 | 10 | +0 |
| `quantifier_capitalized` | 1 | 0 | 0 | +0 |
| `verb_census_no_finite` | 33 | 32 | 32 | +0 |
| `zu_adv_capitalized` | 2 | 0 | 0 | +0 |

## Verificación Iter2 → Iter3

| Check | Resultado |
|---|---|
| Alter/Sorgen/Kosten ausentes en added | ✓ PASS (0 restantes) |
| Findings totales bajan (85 → 79) | ✓ PASS |
| Sin nuevos reason codes | ✓ PASS |
| Modal+Kosten no decapitalizados | ✓ PASS |
| Ganzen/Bessere/Junge/Spät siguen decapándose | ✓ PASS |

### Regresiones Iter2 corregidas

- `lesen-t2-gemini-076.json`: `sorgen` / `lexicon_override_tag` → ausente ✓
- `lesen-t2-gemini-076.json`: `sorgen` / `lexicon_override_tag` → ausente ✓
- `lesen-t2-gemini-079.json`: `alter` / `lexicon_nn` → ausente ✓
- `lesen-t2-gemini-086.json`: `kosten` / `modal_noun_object` → ausente ✓
- `lesen-t5-gemini-046.json`: `alter` / `lexicon_nn` → ausente ✓
- `lesen-t5-gemini-046.json`: `alter` / `lexicon_nn` → ausente ✓

### Fixes conservados (Ganzen, Bessere, Junge, Spät)

- **Ganzen**: ✓ (9 ocurrencia(s) en corpus)
- **Bessere**: ✓ (1 ocurrencia(s) en corpus)
- **Junge**: ✓ (1 ocurrencia(s) en corpus)
- **Spät**: ✓ (3 ocurrencia(s) en corpus)

_Iteration3: **0 findings nuevos** vs baseline (los 2 swaps de Iter2 ya no cuentan como added)._

## Escaneo modal + Kosten/kosten

Ocurrencias: **2**

| archivo | modal | forma | decap incorrecta? | contexto |
|---|---|---|---|---|
| `lesen-t2-gemini-086.json` | kann | Kosten | no ✓ | bieten oft Vorteile: Man kann Kosten für Miete oder Instandhaltung tei |
| `lesen-t5-gemini-062.json` | kann | kosten | no ✓ | orsätzliche Beschädigung kann kosten für die Familie Verursachen. 7. * |

## Patch Iteration 3

1. `german-noun-supplement.json` cargado en `buildLexicon()`
2. `'alter'` eliminado de `ADJ_NEEDS_ARTICLE_GUARD`
3. Guard modal: known noun + prep objeto → no decap
