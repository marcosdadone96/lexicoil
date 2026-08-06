# G2 decap-only impact — germanCapsNormalize

**Gate:** v6.1-B-G2 (frozen) (sin modificar)
**Modo:** dry-run · `decapOnly: true` (sin capitalizeNouns, sin full normalize)
**Pool:** `batches/ready/lesen` · 193 archivos
**Generado:** 2026-07-08T11:41:50.527Z
**Baseline G2 report:** ✓ coincide con informe G2

---

## 1. Baseline actual (caps gate re-scan)

| Métrica | Valor |
|---|---:|
| Findings totales | 88 |
| Media / archivo | 0.456 |
| Archivos con ≥1 finding | 37 |

### Por Teil

| Teil | Archivos pool | Findings | Media/Teil-file |
|---:|---:|---:|---:|
| T1 | 17 | 9 | 0.53 |
| T2 | 15 | 36 | 2.4 |
| T3 | 125 | 2 | 0.02 |
| T4 | 17 | 14 | 0.82 |
| T5 | 19 | 27 | 1.42 |

### Reason codes (baseline)

- `verb_census_no_finite`: 33
- `lexicon_override_tag`: 12
- `modal_final_infinitive`: 12
- `prose_strict_homograph`: 10
- `adj_before_noun`: 8
- `lexicon_nn`: 5
- `modal_noun_object`: 2
- `zu_adv_capitalized`: 2
- `adv_after_pronoun`: 1
- `adv_before_verb`: 1
- `lexicon_after_adj`: 1
- `quantifier_capitalized`: 1

---

## 2. Simulación `--decap-only`

| Métrica | Antes | Después | Δ abs | Δ % |
|---|---:|---:|---:|---:|
| Findings totales | 88 | 85 | -3 | -3.4% |
| Media / archivo | 0.456 | 0.44 | -0.016 | -3.4% |
| Archivos con findings | 37 | 37 | 0 | — |

- **Findings eliminados:** 11
- **Findings nuevos:** 8

### Cambios por reason code

| Reason | Antes | Después | Δ |
|---|---:|---:|---:|
| `verb_census_no_finite` | 33 | 32 | -1 |
| `lexicon_override_tag` | 12 | 14 | 2 |
| `modal_final_infinitive` | 12 | 12 | 0 |
| `prose_strict_homograph` | 10 | 10 | 0 |
| `lexicon_nn` | 5 | 8 | 3 |
| `adj_before_noun` | 8 | 4 | -4 |
| `modal_noun_object` | 2 | 3 | 1 |
| `adv_before_verb` | 1 | 1 | 0 |
| `lexicon_after_adj` | 1 | 1 | 0 |
| `zu_adv_capitalized` | 2 | 0 | -2 |
| `adv_after_pronoun` | 1 | 0 | -1 |
| `quantifier_capitalized` | 1 | 0 | -1 |

---

## 3. Análisis de seguridad

### Fixes esperados (eliminados)

- `adj_before_noun`: 4 finding(s) eliminado(s)
- `zu_adv_capitalized`: 2 finding(s) eliminado(s)
- `adv_after_pronoun`: 1 finding(s) eliminado(s)

### Posibles regresiones (nuevos)

- `lexicon_nn`: +3 finding(s) nuevo(s)
- `lexicon_override_tag`: +2 finding(s) nuevo(s)
- `modal_noun_object`: +1 finding(s) nuevo(s)
- `verb_census_no_finite`: +1 finding(s) nuevo(s)

---

## 4. Tabla por Teil

| Teil | Antes | Después | Delta | Reason codes afectados (Δ≠0) |
|---:|---:|---:|---:|---|
| T1 | 9 | 8 | -1 | `adv_after_pronoun` 1→0 |
| T2 | 36 | 37 | 1 | `verb_census_no_finite` 25→24, `lexicon_override_tag` 4→6, `adj_before_noun` 3→2, `quantifier_capitalized` 1→0 |
| T3 | 2 | 2 | 0 | — |
| T4 | 14 | 12 | -2 | `adj_before_noun` 2→0 |
| T5 | 27 | 26 | -1 | `lexicon_nn` 5→7, `adj_before_noun` 2→1, `zu_adv_capitalized` 2→0 |

---

## 5. Tabla por regla de normalización

| Regla aplicada | Cambios token | Findings eliminados* | Posibles problemas* |
|---|---:|---:|---:|
| `decap_heuristic_adj_adv` | 164 | 13 | 4 |
| `decap_adj_after_article` | 31 | 4 | 0 |
| `decap_other` | 5 | 0 | 0 |
| `decap_modal_infinitive` | 4 | 0 | 1 |
| `decap_homograph` | 2 | 0 | 2 |

*Estimación por co-ocurrencia archivo; ver JSON para detalle.

---

## 6. Archivos con mayor impacto

| Archivo | Teil | Antes | Después | Δ |
|---|---|---:|---:|---:|
| `lesen-t5-gemini-061.json` | T5 | 6 | 3 | -3 |
| `lesen-t2-gemini-060.json` | T2 | 5 | 3 | -2 |
| `lesen-t4-gemini-035.json` | T4 | 2 | 0 | -2 |
| `lesen-t1-gemini-174.json` | T1 | 3 | 2 | -1 |
| `lesen-t2-gemini-061.json` | T2 | 1 | 0 | -1 |
| `lesen-t2-gemini-089.json` | T2 | 12 | 12 | 0 |
| `lesen-t5-gemini-062.json` | T5 | 7 | 7 | 0 |
| `lesen-t2-gemini-083.json` | T2 | 4 | 4 | 0 |
| `lesen-t5-gemini-041.json` | T5 | 4 | 4 | 0 |
| `lesen-t5-gemini-060.json` | T5 | 4 | 4 | 0 |
| `lesen-t1-gemini-154.json` | T1 | 3 | 3 | 0 |
| `lesen-t2-gemini-062.json` | T2 | 3 | 3 | 0 |
| `lesen-t2-gemini-087.json` | T2 | 3 | 3 | 0 |
| `lesen-t2-gemini-066.json` | T2 | 2 | 2 | 0 |
| `lesen-t2-gemini-072.json` | T2 | 2 | 2 | 0 |

---

## Artefactos

- Cambios simulados completos: `G2-DECAP-ONLY-IMPACT.json`
- Este informe: `G2-DECAP-ONLY-IMPACT.md`
