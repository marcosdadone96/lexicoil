# Pool ready — reporte ejecutivo

**Fecha:** 2026-07-20T13:24:10.544Z
**Analizados:** 41

## Totales (veredicto oficial = gates 1–8)

| Estado | N |
|--------|--:|
| READY | 0 |
| REPAIRABLE → READY (tras fix) | 9 |
| REJECT | 32 |
| **Listos para pool** (READY + fixed) | **9** |

## Contenido solo (gates 1–7, sin grammarTags/vocabularyTags/topic)

| Estado | N |
|--------|--:|
| READY | 39 |
| REPAIRABLE | 0 |
| REJECT | 2 |

## Por módulo / Teil

| Celda | Total | READY | Fixed | REJECT |
|-------|------:|------:|------:|-------:|
| horen-t1 | 4 | 0 | 2 | 2 |
| horen-t2 | 5 | 0 | 0 | 5 |
| horen-t3 | 4 | 0 | 4 | 0 |
| horen-t4 | 4 | 0 | 3 | 1 |
| lesen-t1 | 4 | 0 | 0 | 4 |
| lesen-t2 | 4 | 0 | 0 | 4 |
| lesen-t3 | 4 | 0 | 0 | 4 |
| lesen-t4 | 4 | 0 | 0 | 4 |
| schreiben | 4 | 0 | 0 | 4 |
| sprechen | 4 | 0 | 0 | 4 |

## Por módulo

| Módulo | Total | READY | Fixed | REJECT |
|--------|------:|------:|------:|-------:|
| horen | 17 | 0 | 9 | 8 |
| lesen | 16 | 0 | 0 | 16 |
| schreiben | 4 | 0 | 0 | 4 |
| sprechen | 4 | 0 | 0 | 4 |

## Motivos REJECT (top)

| Motivo | Archivos |
|--------|--------:|
| missing_grammarTags | 29 |
| missing_vocabularyTags | 28 |
| missing_topicTag | 16 |
| non_canonical_topicTag | 4 |
| legacy_or_daily_life_topic | 2 |
| topic_mismatch | 1 |
| content_topic_mismatch | 1 |
| exact_duplicate | 1 |
| near_duplicate | 1 |

## Carpetas

- Listos: `batches/ready/pool-verified/` (9)
- Regenerar: `batches/needs-regeneration/` (32)

## Notas

- Q2: cache dry-run + CHK-18b en no evaluados (sin LLM). Usa --q2-llm para forzar LLM.
- Sin metadata retrieval (gates 1–7): READY 39 · REPAIRABLE 0 · REJECT 2.
