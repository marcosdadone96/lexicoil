# Spike ROI — pos-caps repair mecánico

**Fecha:** 2026-07-09T14:41:46Z  
**Corpus:** 37 archivos con findings (88/88 del holdout)  
**Método:** repair mecánico token-a-token según `type`, re-G2 con gate congelado

## 1. Clasificación on-paper

| Clase | N | % | Notas |
|---|---:|---:|---|
| repair-by-type **puro** | 33 | 37.5% | adj, lexicon, modal+obj, zu+adv… |
| repair-by-type **risky** | 55 | 62.5% | verb_census, homograph, modal_final_inf |
| **Total con fix mecánico obvio** | **88** | **100%** | Todos tienen `wrong_capitalized` o `noun_lowercase` |

Ningún finding requiere información extra para saber *qué hacer* (bajar o subir). El riesgo está en las **consecuencias** del fix, no en la ambigüedad del `type`.

## 2. Simulación

| Estrategia | Findings tras fix | Δ vs 88 | addedFindings |
|---|---:|---:|---:|
| Baseline | 88 | — | 0 |
| **Repair mecánico naive** | **22** | **−66 (75%)** | **22** |
| Lists normalize (mismo subset) | 80 | −8 (9%) | (no medido en subset) |
| Lists normalize (holdout ref) | 85 | −3 (3.4%) | 3 net en dryrun |

**Interpretación:** el repair naive **elimina los 88 findings originales** pero **introduce 22 nuevos** (p. ej. `Kochen→kochen` genera `lexicon_after_adj`; `Interesse→interesse` genera `lexicon_nn`). Viola el protocolo `addedFindings=0`.

Los 22 restantes son casi todos **regresiones** de haber corregido de más en contextos donde la mayúscula era correcta (sustantivos genuinos en PROSE, nombres en anuncios T3).

## 3. Recomendación ROI

| Pregunta | Respuesta |
|---|---|
| ¿100% repair-by-type en papel? | Sí |
| ¿Repair naive sin guards G2 es seguro? | **No** — 22 addedFindings |
| ¿Lists resuelven más que el 3% de findings? | Poco en métrica G2, pero 241 token-fixes preventivos |
| ¿Vale 2–3 semanas? | **Solo si** el repair **reutiliza la misma lógica** que `should_flag_*` (no flip ciego). El spike demuestra que el flip ciego ya llega a 22 findings pero **no es mergeable** |

**Veredicto:** ROI **bajo** para arquitectura completa *ahora*, salvo que el objetivo pase de «menos waves de listas» a «cero findings G2». El problema no es detectar — es **no romper** al corregir. Eso exige duplicar los ~15 guards de G2 en modo repair (= el proyecto de 2–3 semanas propuesto), con ganancia estimada netta ~66 findings en holdout vs ~3 actual — **pero** el pipeline ya opera en `GERMAN_CAPS_GATE=warn`.

Artefacto JSON: `spike-pos-caps-repair-roi.json`
