# v3.0-stable — validación producción (15 generados)

**Normalización:** `v3.0-stable` (full pipeline, dry-run)
**Gate:** v6.1-B-G2 (frozen)
**Origen:** `batches/generated` · 15 archivos más recientes **antes** de v3 (2026-07-08)
**Generado:** 2026-07-08T15:53:20.988Z

## Archivos seleccionados

| # | archivo | mtime |
|---:|---|---|
| 1 | `lesen-t5-gemini-067.json` | 2026-07-08T08:36:41.988Z |
| 2 | `lesen-t5-gemini-066.json` | 2026-07-08T08:33:53.313Z |
| 3 | `lesen-t5-gemini-065.json` | 2026-07-08T08:29:48.791Z |
| 4 | `lesen-t5-gemini-064.json` | 2026-07-08T08:27:32.208Z |
| 5 | `lesen-t5-gemini-063.json` | 2026-07-08T08:26:49.816Z |
| 6 | `lesen-t4-gemini-037.json` | 2026-07-08T08:16:47.937Z |
| 7 | `lesen-t4-gemini-036.json` | 2026-07-08T08:10:55.908Z |
| 8 | `lesen-t3-auto-qeh7ew.json` | 2026-07-08T08:08:51.931Z |
| 9 | `lesen-t3-auto-omsq86.json` | 2026-07-08T08:07:18.930Z |
| 10 | `lesen-t3-auto-tz7n7y.json` | 2026-07-08T08:06:37.321Z |
| 11 | `lesen-t2-gemini-093.json` | 2026-07-08T07:54:50.765Z |
| 12 | `lesen-t2-gemini-092.json` | 2026-07-08T07:52:45.736Z |
| 13 | `lesen-t2-gemini-091.json` | 2026-07-08T07:48:14.214Z |
| 14 | `lesen-t1-gemini-177.json` | 2026-07-08T07:43:31.779Z |
| 15 | `lesen-t1-gemini-176.json` | 2026-07-08T07:34:06.284Z |

## Resumen antes / después

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Findings totales | 7 | 7 | +0 |
| Findings eliminados | — | — | 0 |
| Findings nuevos | — | — | 0 |
| Archivos con cambios de texto | — | — | 1 |

## Reason codes

| Reason | Antes | Después | Δ |
|---|---:|---:|---:|
| `adj_before_noun` | 4 | 4 | +0 |
| `lexicon_nn` | 1 | 1 | +0 |
| `lexicon_override_tag` | 1 | 1 | +0 |
| `verb_census_no_finite` | 1 | 1 | +0 |

## Clasificación de cambios

| Clasificación | Token changes |
|---|---:|
| cambio neutro | 1 |

## Reglas aplicadas

| Regla | Cambios |
|---|---:|
| `decap_adj_after_article` | 1 |

## Findings nuevos

_Ninguno._

## Findings eliminados

_Ninguno._

## Findings persistentes (7) — fuera de alcance v3

El gate sigue reportando los mismos 7 casos tras normalizar. Ninguno coincide con los patrones G2 corregidos en Iter3 (Alter, Sorgen, Kosten, modal+prep, etc.):

| archivo | palabra | reason | campo |
|---|---|---|---|
| `lesen-t5-gemini-063.json` | `online` | `lexicon_nn` | `passages.text` |
| `lesen-t4-gemini-037.json` | `Kleinen` | `adj_before_noun` | `questions.signText` (×2) |
| `lesen-t4-gemini-036.json` | `machen` | `lexicon_override_tag` | `questions.explanation` |
| `lesen-t4-gemini-036.json` | `Wichtiger` | `adj_before_noun` | `questions.signText` |
| `lesen-t2-gemini-093.json` | `Täglichen` | `adj_before_noun` | `passages.text` |
| `lesen-t2-gemini-093.json` | `Wettkämpfe` | `verb_census_no_finite` | `questions.options` |

Estos reason codes (`lexicon_nn`, `lexicon_override_tag`, `verb_census_no_finite`, y `adj_before_noun` en contextos de sustantivación) son responsabilidad del **gate**, no de `germanCapsNormalize`.

## Actividad interna normalizer (net-zero)

Varios archivos muestran `decapFixed` + `capFixed` iguales con `fieldsChanged: 0`: el pipeline full (decap → cap) revierte cambios intermedios sin alterar el texto final ni los findings. Ej.: `lesen-t2-gemini-091` (5+5), `lesen-t2-gemini-093` (4+4).

## Conclusión

| Criterio | Resultado |
|---|---|
| Regresiones nuevas vs baseline gate | **0** |
| Findings G2-type eliminados | **0** (no había casos G2 en esta muestra) |
| Correcciones de texto netas | **1** (`Freien`→`freien`) |
| Producción reciente vs pool G2 | Baseline **7 findings / 15 archivos** vs **88 / 193** en G2 |

**v3.0-stable no introduce regresiones** en los 15 generados más recientes. Los patrones G2 ya no aparecen en producción nueva; el único cambio neto es una corrección ortográfica esperada no cubierta por el gate.

## Ejemplos de cambios (muestra)

| archivo | clasificación | regla | original (extracto) | corregido (extracto) |
|---|---|---|---|---|
| `lesen-t5-gemini-067.json` | cambio neutro | `decap_adj_after_article` | Freien→freien en `passages[0].text` | Die Stadtbibliothek 'Lesewelt' hat folgende Regeln:

1.  **Ö |

## Por archivo

### `lesen-t5-gemini-067.json` — caps 0→0 · 1 campo(s)
- **cambio neutro** · `decap_adj_after_article`: `Freien`→`freien` (passages[0].text)

**Texto original (extracto):** «…um den **Freien** Verkehr und die Sicherheit zu gewährleisten.»

**Texto corregido:** «…um den **freien** Verkehr und die Sicherheit zu gewährleisten.»

**Regla:** `decap_adj_after_article` — adjetivo tras artículo (`den`) no sustantivado.

**Clasificación:** cambio neutro (el gate no tenía finding previo ni posterior en este archivo).

JSON: `V3-PRODUCTION-15-GENERATED.json`
