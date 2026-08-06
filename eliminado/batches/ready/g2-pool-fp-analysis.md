# Análisis pool G2 (88 findings) — ¿justifica B3 u otra regla?

**Fuente:** `german-caps-gate-report-v6.1-B-G2.json`  
**Harness congelado:** MUST_CATCH 30/30, MUST_NOT_FLAG 47/47  
**G1/G1.1/G2:** congelados — no implementar B3 en esta fase

---

## 1. Composición del pool (88)

| Clase | N | % |
|---|---:|---:|
| **Errores reales confirmados** | 48 | 54,5 % |
| **FP claros** | 23 | 26,1 % |
| **Ambiguos** | 17 | 19,3 % |

- MUST_CATCH presentes en pool: **30/30**
- Ratio ruido/real: **40/48 ≈ 0,83:1** (ruido = FP + ambiguos)

Evolución:

| Versión | Findings | Real confirmado (aprox.) |
|---|---:|---:|
| v6.1-B baseline | 104 | ~45 |
| G1.1 | 89 | ~48 |
| **G2** | **88** | **48** |

---

## 2. Distribución por reason code

| Reason | N | Real | FP | Amb |
|---|---:|---:|---:|---:|
| `verb_census_no_finite` | 33 | 21 | 8 | 4 |
| `lexicon_override_tag` + `lexicon_nn` + … | 20 | 5 | 14 | 1 |
| `modal_final_infinitive` | 12 | — | — | (observaciones relajadas en bulk) |
| `prose_strict_homograph` | 10 | 6 | 0 | 4 |
| `adj_before_noun` | 8 | 6 | 1 | 1 |
| `quantifier_capitalized` | 1 | 1 | 0 | 0 |
| Otros | 4 | — | — | — |

*(Clasificación conservadora; ver `g2-pool-fp-analysis.json`.)*

---

## 3. Familias estructurales con ≥5 FP

| Familia | FP | Real | Amb | ¿Regla nueva? |
|---|---:|---:|---:|---|
| **lexicon_noun_lowercase** | **14** | 5 | 1 | Dominio **B1** (ya congelado); residuos dispersos (ADV+VVINF) |
| **verb_census_no_finite** | **8–9** | 19–21 | 4–5 | Candidato **B3** a nivel familia |
| adj_before_noun | 1 | 6 | 1 | Agotado tras G1/G2 |
| quantifier | 0 | 1 | 0 | Agotado tras G2 |

**Conclusión parcial:** a nivel **familia**, sí hay ≥5 FP en dos grupos. A nivel **patrón homogéneo** (criterio G1/G2), **ningún subpatrón alcanza ≥5**.

---

## 4. Desglose B3 (`verb_census_no_finite`) — 33 findings

| Subestructura | FP | Real | Notas |
|---|---:|---:|---|
| `must_catch` / coord sujeto+verbo | 0 | 19 | Unternehmen wir, Sie Berichten, Spielen… |
| `noun_object_not_verb` | 2 | 0 | *Wissen sammeln* |
| `option_label` | 2 | 0 | *Ausschließlich Kurse* / *Nur Kurse* |
| `noun_in_pp` | 2 | 0 | *Teamarbeit*, *Verspätung* |
| `infinitive_zu` | 1 | 0 | *zu Besuchen* |
| `noun_not_verb` | 1 | 0 | *Interesse* (efecto colateral G1) |
| `noun_predicate` | 1 | 0 | *10 Euro Kosten* |
| **Sin clasificar** | — | **5** | Ambiguos |

**Máximo por subpatrón: 2 FP.** No hay un único guard estructural que cubra ≥5 FP sin mezclar 6 mecanismos distintos (objeto nominal, etiqueta de opción, PP, infinitivo, predicado…).

Riesgo de regresión: en la misma familia conviven **~21 errores reales** y solo **~9 FP** — ratio real/FP ≈ **2,3:1** dentro de `verb_census`. Cualquier guard amplio tendría colisión alta (el problema que motivó simular G1/G2 antes de implementar).

---

## 5. Residuos `lexicon_*` (14 FP)

Patrones dominantes (2× cada uno, resto 1×):

- ADV + `machen` / `buchen` / `suchen` / `laufen` / `treffen`
- Prev adj/adv + infinitivo en léxico

Esto es **extensión de B1**, no B3. B1 está congelado; los 14 FP son residuos **dispersos** (7–8 lemmas × contextos distintos), no un solo patrón ≥5.

---

## 6. `adj_before_noun` restante (8)

| Token | Veredicto |
|---|---|
| Viele, Vielen×2, Ganzen | Real (MUST_CATCH) |
| Bessere, Öffentlicher | Real (TITLE/PROSE) |
| Rasenflächen | FP (1) — mis-tag NE |
| Besuchen | Ambiguo (1) |

Sin masa para nueva regla ADJ.

---

## 7. Veredicto

| Criterio | Resultado |
|---|---|
| ¿Familia con ≥5 FP? | **Sí** — `verb_census` (~9) y `lexicon` (~14) |
| ¿**Un** patrón estructural homogéneo ≥5 FP? | **No** — máximo **2 FP** por subpatrón |
| ¿B3 viable con 1–2 guards generales (estilo G1)? | **No demostrado** — requeriría ~4–6 guards o listas |
| ¿Mejora marginal G2→B3? | **−1 a −9 findings** estimado vs **~21 reales** en riesgo |
| Harness | Ya en 100% / 0 FP sintéticos |

### Recomendación: **congelar el gate en G2**

Motivos:

1. **No queda un grupo estructural único ≥5 FP** homogéneo — condición que G1/G2 exigieron antes de implementar.
2. El ruido restante está **fragmentado** entre familias (`verb_census`, `lexicon`, `homograph`, TITLE) y subpatrones (≤2 ocurrencias).
3. **Rendimiento marginal decreciente:** 104→88 (−15,5 %); los últimos 9 FP de verb_census cuestan alto riesgo de recall.
4. El pool actual tiene **54,5 % errores reales confirmados** — apto para **validación externa**, no para más tuning en el mismo corpus.

### Fase siguiente propuesta

1. **Congelar** `pos-caps-check.py` + harness + clasificador en estado **v6.1-B-G2**.
2. **Validación con exámenes nuevos** generados por IA (fuera de `batches/ready/lesen` usado para calibrar).
3. Medir en holdout: recall sobre errores humanos/ground truth nuevo, FP rate en prosa limpia, drift por Teil.
4. Solo reabrir B3 si el holdout muestra **≥5 FP recurrentes del mismo subpatrón** no visto en calibración.

---

Detalle machine-readable: `batches/ready/g2-pool-fp-analysis.json`  
Script: `node scripts/analyze-g2-pool-fp.mjs`
