# Pool metadata backfill — 2026-07-10

## Tarea 1 — Diagnóstico

| Tag | ¿Automatizable? | Cómo | Coste |
|-----|-----------------|------|------:|
| **vocabularyTags** | Sí | Reutilizar `enrich-bank-vocab-tags` / lemmatizer + `library/vocab/de/B1.json` | **$0** |
| **grammarTags** | Sí (heurístico) | No había extractor; reglas B1 (`weil`→nebensatz, modal, Perfekt…) + default por Teil | **$0** |
| **topicTag** | Sí | `detectTopic` + `tagBatchWithTopic` (ya validado Schreiben/Sprechen) | **$0** |

Merged Schreiben de referencia lleva tags LLM (`g-de-a2-*`, vocab multi-palabra). Nuestro backfill usa IDs B1 del contrato Gemini + lemmas B1 — suficiente para gate 8 / retrieval.

**LLM no necesario** para este backfill.

## Tarea 2 — topicTags

- Primera pasada: **251** archivos (missing/legacy puro)
- Segunda pasada (mixed `daily_life` + canónico): **+151**
- Tras unificar: **0** REJECT solo por metadata de topic

## Tarea 3 — grammar + vocabulary

- Aplicado a **467/467** (determinista)
- Tras re-check: **`pool-verified` = 45** (acumulado)

| Módulo | pool-verified |
|--------|--------------:|
| Hören | 34 |
| Schreiben | 6 |
| Sprechen | 5 |
| Lesen | **0** |

Lesen bloqueado por **Q1 duplicados** (exact/near vs banco/`ready/lesen` y entre sí), no por metadata.

## Tarea 4 — Contenido real a regenerar/reparar

Tras quitar falsos-REJECT de metadatos:

| | N |
|--|--:|
| **REJECT por contenido** | **422** |
| Solo metadata | **0** |

Motivos (un archivo puede tener varios):

| Motivo | Archivos |
|--------|--------:|
| exact_duplicate | 248 |
| near_duplicate | 187 |
| content_topic_mismatch | 132 |
| topic_mismatch | 21 |
| q2_answer_key_mismatch | 16 |
| discard_list | 5 |

**Conclusión:** el siguiente cuello de botella es **deduplicación Lesen (Q1)**, no caps ni tags.
