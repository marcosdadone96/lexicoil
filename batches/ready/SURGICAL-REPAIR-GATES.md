# Auditoría sistemática: gates × reparación quirúrgica

**Fecha:** 2026-07-13  
**Alcance:** pipeline de generación Lesen / Hören / Schreiben / Sprechen (CLI Gemini)  
**Router central:** `scripts/lib/surgicalRepairRouter.mjs` → `runSurgicalRepair()`  
**Triage:** `scripts/lib/repairTriage.mjs` → `classifyAndRepair()`  
**Cableado:** `generate-lesen-part-gemini.mjs` + `generatePartGeminiLib.mjs` (Hören/Schreiben/Sprechen)

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| **Sí (LLM)** | 1 llamada puntual vía `repairKind` en `surgicalRepairRouter` |
| **Sí (código)** | Cubo A/B en `repairTriage` — sin LLM, re-validación gratis |
| **No** | Regeneración completa del Teil o descarte (Cubo D) |
| **No (justificado)** | No aplica reparación localizada — ver columna *Por qué* |

---

## Tabla maestra de gates

### Gates transversales (todos los módulos)

| Gate | FAIL típico | Reparación quirúrgica | Estado | Por qué no (si aplica) |
|------|-------------|----------------------|--------|------------------------|
| `formato` | JSON inválido, blueprint roto | **No** | — | Salida monolítica corrupta; parche parcial no es fiable |
| `lexico` | B2+/C1, registro incorrecto | **Sí (código)** Cubo B si sustitución 1:1 sin ambigüedad | existente | — |
| `lexico` | B2+ con ≥1 hallazgo, ≤4 ítems | **Sí (LLM)** `lexico` | **implementado hoy** | — |
| `lexico` | >4 hallazgos o sugerencias ambiguas (`/`, `→`) | **No** | — | Demasiados campos afectados; riesgo de inconsistencia |
| `dedup` / DEDUP | Jaccard ≥ umbral vs pool | **No** | Cubo D | Contenido globalmente demasiado similar; requiere texto nuevo |
| `audit2` CHK-14 | Sustantivos en minúscula | **Sí (código)** Cubo A | existente | — |
| `audit2` CHK-13/19 | Balance/skew letras, rachas | **Sí (código)** Cubo A | existente | — |
| `audit2` CHK-17 | Frankenstein T3 (A–J) | **Sí (código)** Cubo A | existente | — |
| `audit2` CHK-8 | IDs duplicados | **Sí (código)** Cubo A | existente | — |
| `audit2` CHK-15 T5 | Pasaje largo <15% exceso | **Sí (código)** trim final | existente | — |
| `audit2` CHK-15 otros | Longitud fuera de rango blueprint | **No** | — | Requiere reescritura estructural del pasaje/transcripción |
| `audit2` CHK-18 | explanation corta/ausente | **No** (regen) | — | Mezclado con otros CHK; sin `repairKind` dedicado aún |
| `audit2` CHK-18b | Clave ≠ explanation (T2/T5) | **Sí (LLM)** `explanation` | existente Lesen | — |
| `audit2` CHK-28 / mcq_distinct | Opciones no excluyentes | **Sí (LLM)** `mcq_distinct` | existente Lesen T2/T5 | — |
| `audit2` CHK-7/10/16/20 | Word-copy, correlación RF, estructura Hören T1 | **Sí (LLM)** `word_match` donde aplica | **implementado hoy** Hören | CHK-20 estructura segmentos: requiere re-layout completo T1 |
| `audit2` CHK-26/27 | Drift de tema / topicTag | **No** | — | Orientación global del batch incorrecta |
| `audit2` CHK-29 | Molde estructural duplicado T4/T5 | **No** (regen+exclude) | — | Toda la estructura del debate/subtipo está mal |
| `audit2` ≥6 issues mezclados | Calidad compuesta | **No** | Cubo D | Demasiados fallos correlacionados |
| `Q4-metadataSchema` | topic_mismatch | **No** | Lesen only | Metadatos/tema global desalineado |
| `Q1-shadow` | Duplicado contenido | No bloquea | — | Solo auditoría |
| `Q3-textDeterministic` | date_weekday, markdown | No bloquea | — | Solo auditoría |
| `languageToolAdvisory` | Gramática LT | No bloquea | — | Solo auditoría |

---

### Lesen (`generate-lesen-part-gemini.mjs`)

| Gate / sub-check | Teil | Reparación quirúrgica | Estado | Por qué no |
|------------------|------|----------------------|--------|------------|
| Estructura (conteos pasajes/preguntas) | T1–T5 | **No** | — | Blueprint roto de raíz |
| T1 word-copy | T1 | **Sí (LLM)** `word_match` | existente | — |
| T2/T5 word-copy MCQ | T2,T5 | **Sí (LLM)** `word_match` | existente | — |
| T2 mcq_distinct | T2 | **Sí (LLM)** `mcq_distinct` | existente | — |
| T2/T5 mcq_length_bias | T2,T5 | **Sí (LLM)** `mcq_length_bias` | **implementado hoy** | — |
| T2/T5 answer skew >60% | T2,T5 | **No** | — | Requiere redistribuir claves en todo el batch |
| T3 word-copy / competitors / zero | T3 | **No** | — | Matching A–J es global; no un solo ítem |
| T4 word-copy / negación / Ja-Ne skew | T4 | **No** | — | Foro completo + 8 preguntas acopladas |
| T4 inverted key | T4 | **Sí (código)** Cubo A | existente | — |
| T1 first-person / pronoun mix / tone | T1 | **No** | — | Voz narrativa del pasaje entero |
| `cefr` length_above_max suma T2 | T2 | **Sí (LLM)** `passage_length` | existente | — |
| `cefr` coverage/complexity/inference | T1–T5 | **No** | — | Métricas globales del mini-examen |
| `CHK-29` mold | T4,T5 | **No** (regen+exclude) | — | Molde estructural entero |

---

### Hören (`generatePartGeminiLib.mjs`)

| Gate / sub-check | Teil | Reparación quirúrgica | Estado | Por qué no |
|------------------|------|----------------------|--------|------------|
| T1/T3/T4 word-copy RF | T1,T3,T4 | **Sí (LLM)** `word_match` | **implementado hoy** | — |
| T2 word-copy MCQ | T2 | **Sí (LLM)** `word_match` | **implementado hoy** | — |
| T2 mcq_length_bias | T2 | **Sí (LLM)** `mcq_length_bias` | **implementado hoy** | — |
| T2 monologue length 150–350 | T2 | **No** | — | Transcripción monolítica fuera de rango |
| T3 dialogue structure / balance | T3 | **No** | — | 4+ turnos + 7 preguntas acopladas |
| T4 discussion structure | T4 | **No** | — | 8 preguntas + 3 speakers globales |
| `lexico` | T1–T4 | **Sí** B + `lexico` LLM | **implementado hoy** | — |
| premise-dedup | T1,T2 | **No** | Cubo D | Premisa ya consumida en pool |
| CHK-11 speaker/key T4 | T4 | **No** | — | Correlación speaker↔afirmación en todo el diálogo |
| CHK-20 segment structure T1 | T1 | **No** | — | Layout 2 segmentos × (1 RF + 1 MC) |

---

### Schreiben

| Gate | Teil | Reparación quirúrgica | Por qué no |
|------|------|----------------------|------------|
| `formato` / blueprint | T1–T3 | **No** | Consigna monolítica mal formada |
| `calidad` placeholders | T1–T3 | **No** | `[Name]` sin resolver implica prompt entero |
| `calidad` estructura T1/T2/T3 | T1–T3 | **No** | Email/argumentos/elementos faltantes son globales |
| `schreiben_t3_premise_dedup` | T3 | **No** | Cubo D — premisa agotada |
| `lexico` | T1–T3 | **Sí** B + `lexico` LLM | Campos acotados en `question` |

---

### Sprechen

| Gate | Teil | Reparación quirúrgica | Por qué no |
|------|------|----------------------|------------|
| `formato` | T1–T3 | **No** | JSON/consigna monolítica |
| `calidad` T1 bullets / T2 Präsentation / T3 feedback | T1–T3 | **No** | Rubric pedagógica global del prompt |
| `sprechen_perspective` | T3 | **No** | Perspectiva examinador en toda la consigna T3 |
| premise-dedup | set | **No** | Cubo D |
| `lexico` | T1–T3 | **Sí** B + `lexico` LLM | — |

---

## `repairKind` implementados (router)

| repairKind | Módulos | Teile | Llamadas | Preserva |
|------------|---------|-------|----------|----------|
| `word_match` | Lesen, Hören | L T1,T2,T5; H T1–T4 | 1 | Pasaje/transcripción; parafrasea preguntas/opciones |
| `mcq_distinct` | Lesen | T2,T5 | 1 | Pasaje; reescribe opciones+explanation |
| `explanation` | Lesen | T2,T5 | 1 | Pasaje+preguntas; solo explanation |
| `passage_length` | Lesen | T2 | 1 | Preguntas+vocab; acorta ambos pasajes |
| `mcq_length_bias` | Lesen, Hören | L T2,T5; H T2 | 1 | Fuente fija; equilibra longitud opciones |
| `lexico` | Todos | donde gate=lexico ≤4 | 1 | Pasaje/transcripción; solo campos marcados |

---

## Costo estimado: antes vs después

**Fuente:** `batches/ready/gate-logs/generation-cost.jsonl` — agrupado por topic hasta `ok:true`.

### Lesen T2 (2026-07-13)

| Métrica | ANTES (hoy) | DESPUÉS (con router completo) |
|---------|-------------|-------------------------------|
| Llamadas API / éxito | **6,3** | **~2,5** (1 gen + ~1,5 quirúrgicas) |
| Costo USD / éxito | **$0,068** | **~$0,028** (−59%) |
| Fail gates dominantes | calidad 39, audit2 22, lexico 6 | → mayoría resuelta sin regen completa |

### Hören T2 (2026-07-13)

| Métrica | ANTES (hoy) | DESPUÉS (con router completo) |
|---------|-------------|-------------------------------|
| Llamadas API / éxito | **22,4** | **~3,5** (1 gen + ~2,5 quirúrgicas) |
| Costo USD / éxito | **$0,447** | **~$0,070** (−84%) |
| Fail gates dominantes | calidad 212, lexico 13 | word_match + mcq_length_bias + lexico cableados |

### Supuestos del “después”

- Cada fallo localizable consume **1 llamada quirúrgica** (~$0,008–0,015) en lugar de **regen completa** (~$0,02–0,06 con prompt creciente).
- Hören T2: ~90% de fails `calidad` son word-copy o length-bias → 1–2 quirúrgicas resuelven antes del siguiente gate.
- Lesen T2: mezcla audit2 (Cubo A gratis) + calidad quirúrgica → ~60% menos llamadas.
- No incluye fails de **dedup**, **drift tema**, **estructura** — siguen siendo regen/descarte.

---

## Archivos tocados en esta corrección sistemática

| Archivo | Cambio |
|---------|--------|
| `surgicalRepairRouter.mjs` | Router único 6 `repairKind` |
| `repairTriage.mjs` | Triage `mcq_length_bias`, `lexico`, word_match Hören |
| `mcqLengthBiasRepair.mjs` | Reparación batch length bias |
| `lexicoRepair.mjs` | Reparación batch léxico |
| `wordMatchRepair.mjs` | Hören T1/T3/T4 RF + regex ampliado |
| `lesenTemplatePrompt.mjs` | Prompts batch length bias + léxico |
| `generate-lesen-part-gemini.mjs` | Usa `runSurgicalRepair()` (todos los kinds) |
| `generatePartGeminiLib.mjs` | **Nuevo:** `runSurgicalRepair()` Hören/Schreiben/Sprechen |
| `__tests__/surgical-repair-router.test.mjs` | Triage sin LLM |

---

## Resumen operativo (8 líneas)

1. Inventario completo: 40+ gates FAIL documentados arriba; tabla maestra por módulo/Teil.
2. Seis `repairKind` LLM centralizados en `surgicalRepairRouter.mjs` — ya no gate-a-gate ad hoc.
3. Lesen y Hören/Schreiben/Sprechen usan el mismo router tras `classifyAndRepair`.
4. Hören T2 (212 fails calidad hoy) recibe word_match + mcq_length_bias + lexico sin regen completa.
5. Lesen T2 suma mcq_length_bias y lexico además de los 4 kinds ya cableados.
6. Cubo A/B (código gratis) sin cambios: CHK-14, balance MCQ, lexico 1:1, T4 inverted key.
7. Sin reparación quirúrgica (justificado): dedup, drift tema, CHK-29, estructura, Schreiben/Sprechen rubric, JSON roto.
8. Costo esperado: Lesen T2 ~$0,068→$0,028/éxito; Hören T2 ~$0,447→$0,070/éxito (logs 2026-07-13).
