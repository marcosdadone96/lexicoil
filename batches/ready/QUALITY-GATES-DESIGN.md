# Diseño — gates de calidad no-caps (Q1–Q4)

**Estado:** propuesta — sin implementar  
**Fecha:** 2026-07-09  
**Alcance:** categorías 1, 2, 4 y 6 de la auditoría manual  
**Fuera de alcance:** caps (M1–M4), gramática sintáctica general (cat. 3), colocaciones (cat. 5), idempotencia caps (cat. 7)

**Restricciones respetadas:**
- No tocar `pos-caps-check.py` (v6.1-B-G2)
- No modificar `publish-lesen-generated.mjs` ni SEM-1/SEM-2
- Módulos independientes, testeables en aislamiento
- Paralelo a Phase 2 (M4 `-chen`); no lo sustituye ni lo bloquea

**Índice:** [`INDEX.md`](INDEX.md)

---

## Contexto: qué ya existe y por qué falla

| Problema manual | Infraestructura actual | Por qué no basta |
|---|---|---|
| T3 duplicado (qeh7ew↔tz7n7y) | `semanticDedup.mjs` en generación | Solo compara **`passages`**; T3 no tiene passages |
| T3 duplicado | `t3GroupFingerprint.mjs` | Existe pero **no está cableado** al gate de generación |
| Dup pasajes T1/T2 | `semanticDedup` vs `generated/` umbral 55% | No compara vs **`library/de/B1/questions.json`** |
| Dup plantilla (Teaterverein) | CHK-5 en `audit-pass-2` | Cross-file solo en **auditoría bulk**; en generación CHK-5 ve 1 archivo |
| Clave↔explicación | CHK-18b `keyExplanationGate.mjs` | **Determinista por overlap de tokens**; no entiende semántica (Nein/Ja invertido) |
| Markdown en T5 | — | Sin linter |
| topicTag inconsistente | CHK-26 en POOL-2 | Bloquea en `isPartPoolReady`, pero no valida **esquema completo** ni familia semántica blanda |

**Conclusión de diseño:** no ampliar POOL-2 ni publish. Añadir **4 módulos nuevos** (`qualityGates/`) invocados desde `finalizeBatch` / `runQualityAndStructuralGates`, con corpus de referencia ampliado (generated + bank).

---

## Arquitectura común

```
scripts/lib/qualityGates/
  duplicateContentGate.mjs      # Q1
  answerKeyCoherenceGate.mjs  # Q2
  passageCoherenceGate.mjs    # Q3
  metadataSchemaGate.mjs      # Q4
  qualityGateRunner.mjs       # orquestador + tipos
  __tests__/
```

### Formato estándar de salida (todos los gates)

```typescript
/** @typedef {object} QualityGateFinding
 * @property {string} gate       — 'Q1'|'Q2'|'Q3'|'Q4'
 * @property {string} reason     — reason code estable (ver cada gate)
 * @property {string} severity    — 'block'|'warn'
 * @property {string} [field]     — JSON path, ej. questions[2].explanation
 * @property {string} [itemId]    — id pregunta/pasaje
 * @property {string} message     — human-readable
 * @property {object} [evidence] — datos para debug (similitud, letra inferida, etc.)
 */

/** @typedef {object} QualityGateResult
 * @property {boolean} ok
 * @property {QualityGateFinding[]} findings
 * @property {QualityGateFinding[]} warnings
 * @property {object} [stats]     — contadores, coste LLM, etc.
 */
```

### Modos de ejecución

| Modo | Uso |
|---|---|
| `block` | Generación: fallo → `.rejected/` con `_rejectedGate: 'Qn'` |
| `warn` | Transición: log + warning en calidad, archivo pasa |
| `audit` | Dry-run bulk sobre holdout 193 + generated 364 (sin escribir) |

### Artefactos dry-run (mismo espíritu que Phase 1)

```
batches/ready/Qn-G2-AUDIT.json      — 193 archivos ready/lesen
batches/ready/Qn-GENERATED-AUDIT.json
batches/ready/Qn-PRODUCTION-15-AUDIT.json
```

Métricas por archivo: `beforeViolations`, `afterViolations` (N/A para gates nuevos = solo detección), `wouldReject`, `findings[]`.

---

# Q1 — Gate de duplicados (`duplicate_content`)

## 1. Causa raíz

- Dedup actual es **pasaje-céntrico** y corpus **solo `generated/`**.
- T3 guarda contenido en `questions[]` + `options[]` compartidos, no en `passages[]`.
- Duplicados **semánticos con distinto ID** (misma plantilla, distinto sufijo auto) no alcanzan umbral Jaccard si los anuncios cambian pero las 7 situaciones no.

## 2. Funciones / datos

| Pieza | Rol |
|---|---|
| **Nuevo:** `duplicateContentGate.mjs` | Orquesta fingerprints + similitud |
| **Reutilizar:** `t3SituationFingerprintFromBatch` | T3: 7 situaciones ordenadas |
| **Reutilizar:** `normalizeForHash` / `tokenize` de `semanticDedup.mjs` | Normalización texto |
| **Nuevo:** `buildDuplicateCorpus({ generatedDir, bankPath })` | Índice histórico |
| **Referencia:** `partContentHash.mjs` | Hash canónico para publicados (opcional tier 3) |

## 3. Fingerprints por Teil

| Teil | Campos fingerprintados | Algoritmo |
|---:|---|---|
| T1 | `passages[].text` | `sha256(normalize(text))` |
| T2 | cada `passages[].text` + concat preguntas | hash + Jaccard tokens (umbral 90%) |
| T3 | 7× `question` (ignorar orden opciones A–J) | **`t3SituationFingerprint`** (ya existe) |
| T4 | `questions[].signText` agregado | hash normalizado del multiset de signTexts |
| T5 | `passages[].text` | igual T1/T2 |

**Normalización** (común):

```text
lowercase → NFKD strip accents → collapse whitespace
→ strip punctuation [^a-zäöüß0-9 ]
→ optional: strip MCQ prefixes ^[a-j]\)\s*
```

## 4. Corpus de comparación

1. `batches/generated/*.json` (excl. self)
2. `library/de/B1/questions.json` — partes Lesen ya publicadas (extraer batches por teil)
3. Opcional fase 2: `batches/ready/lesen/` como holdout de calibración

## 5. Umbral de rechazo

| Tier | Condición | Acción |
|---|---|---|
| **T1 exacto** | hash idéntico en corpus | `block` · reason `duplicate_content_exact` |
| **T2 near** | Jaccard ≥ **0.90** en passage text **o** T3 fingerprint igual | `block` · `duplicate_content_near` |
| **T3 situaciones** | `t3SituationFp` match (16 hex) | `block` · `duplicate_content_t3_situations` |
| **T4 advisory** | Jaccard signTexts 0.75–0.89 | `warn` · vigilar |

**Calibración:** el par qeh7ew↔tz7n7y debe dar **T3 fingerprint idéntico** → block. Umbral 90% alinea con petición del usuario (vs 55% actual en generación).

## 6. Entrada / salida

**Entrada:**

```json
{
  "batch": { "module": "lesen", "teil": 3, "passages": [], "questions": [...] },
  "corpus": { "entries": [...] },
  "opts": { "threshold": 0.90, "mode": "block" }
}
```

**Salida (rechazo):**

```json
{
  "ok": false,
  "findings": [{
    "gate": "Q1",
    "reason": "duplicate_content_t3_situations",
    "severity": "block",
    "message": "T3 situation fp a3f2… coincide con lesen-t3-auto-qeh7ew.json",
    "evidence": {
      "fingerprint": "a3f2b1c…",
      "matchFile": "lesen-t3-auto-qeh7ew.json",
      "similarity": 1.0
    }
  }]
}
```

## 7. Reglas afectadas

- `semanticDedup` en `partGate` — conviene **delegar en Q1** o desactivar para evitar doble lógica.
- CHK-5 bulk — complementario (auditoría offline), no sustituto.
- CHK-29 mold T4/T5 — ortogonal (subtipo+título, no texto completo).

## 8. Riesgo de regresión

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Falsos positivos T2 (temas parecidos, texto distinto) | Medio | Umbral 90%; excluir si `topicTag` distinto y sim < 0.95 |
| Rechazar variante legítima T3 (mismas situaciones, anuncios totalmente nuevos) | Bajo | Es **deseable** en banco — mismo examen para el alumno |
| Lentitud al escanear bank | Bajo | Índice precalculado JSON cache `data/coverage/duplicate-corpus-de_B1.json` |

## 9. Cobertura estimada (auditoría manual)

**Base:** ~18 defectos no-caps en revisión ampliada; en `V3-POST-HUMAN-REVIEW-15` hay **3 duplicados confirmados/posibles** de ~20 ítems checklist.

| Fuente | Q1 lo habría capturado |
|---|---|
| t3 qeh7ew↔tz7n7y | **Sí** (100%) |
| t1-177 Theaterverein (sesión previa) | **Probable** si está en bank con hash/sim ≥90% |
| t2-091 Familienzeit | **Probable** idem |

**Estimación:** **15–20%** de todos los defectos no-caps del lote de 15; **~60–100%** de la categoría 1 (duplicados) si el corpus incluye bank + generated.

---

# Q2 — Gate consistencia `correct` ↔ `explanation` (`answer_key_mismatch`)

## 1. Causa raíz

CHK-18b detecta cuando la explicación **comparte más tokens con una opción incorrecta** que con la correcta. Falla cuando:
- La explicación es **semánticamente coherente** pero apunta a otra letra (caso oficial Nein/Ja).
- T1 RF, T3 matching, T4 ja/nein: **fuera de alcance** de CHK-18b.
- Explicación parafrasea sin overlap léxico con la opción correcta.

## 2. Funciones

| Pieza | Rol |
|---|---|
| **Nuevo:** `answerKeyCoherenceGate.mjs` | LLM + comparación letra |
| **Reutilizar:** `keyExplanationGate.mjs` | Pre-filtro determinista (gratis): si CHK-18b fire → skip LLM |
| **Reutilizar:** `geminiClient.mjs` / Haiku | Una llamada por parte (batch), no por pregunta |

## 3. Alcance por tipo

| Teil | Tipo | ¿Q2 aplica? |
|---:|---|---|
| T1 | richtig_falsch | Sí — inferir Richtig/Falsch desde explanation |
| T2 | MCQ a/b/c | Sí (principal) |
| T3 | matching A–J | Sí — «¿qué letra A–J justifica la explanation?» |
| T4 | ja/nein | Sí |
| T5 | MCQ | Sí |

## 4. Prompt (una llamada / parte)

```
Eres auditor de exámenes Goethe B1 Lesen.

Para cada ítem, lee: enunciado, opciones, explanation, y la clave declarada (correct).

Pregunta: ¿La explicación justifica la clave declarada?
Responde JSON array:
[{ "itemId": "...", "justified": true|false, "inferredKey": "a"|"b"|...|"Ja"|"Richtig", "confidence": "high"|"low" }]

Solo JSON. Sin texto adicional.
```

## 5. Umbral de rechazo

| Condición | Acción |
|---|---|
| `justified === false` y `confidence === 'high'` | `block` · `answer_key_mismatch` |
| `justified === false` y `confidence === 'low'` | `warn` · revisión manual |
| `inferredKey !== declaredKey` y confidence high | `block` |
| CHK-18b ya bloqueó (determinista) | No llamar LLM (dedup coste) |

**Modo generación recomendado:** empezar `warn` 2 semanas → `block` cuando FP < 5% en holdout.

## 6. Entrada / salida

**Entrada:** batch normalizado + `opts.model = 'gemini-2.0-flash'` (o Haiku vía API disponible).

**Salida:**

```json
{
  "ok": false,
  "findings": [{
    "gate": "Q2",
    "reason": "answer_key_mismatch",
    "severity": "block",
    "itemId": "q-lesen-t4-03",
    "field": "questions[2]",
    "message": "correct=Nein pero explanation justifica Ja",
    "evidence": { "declared": "Nein", "inferred": "Ja", "confidence": "high" }
  }],
  "stats": { "llmCalls": 1, "itemsChecked": 6 }
}
```

## 7. Reglas afectadas

- CHK-18b — Q2 es **capa superior**; mantener CHK-18b como pre-filtro rápido.
- SEM-1 — ortogonal (coherencia con pasaje); no duplicar en publish.

## 8. Riesgo de regresión

| Riesgo | Nivel |
|---|---|
| LLM infiere mal con explicaciones vagas | Medio |
| Coste API (~1 call/parte) | Bajo-medio |
| Falsos positivos T3 matching (letra vs situación) | Medio — acotar prompt a letra de correct |

## 9. Cobertura estimada

| Métrica | Valor |
|---|---|
| Caso grave examen oficial (cat. 2) | **Sí** — objetivo principal |
| Del total ~18 no-caps | **5–10%** (1–2 ítems si solo hay 1 mismatch confirmado) |
| De la categoría 2 sola | **50–80%** (CHK-18b cubre subset overlap; Q2 cubre el resto semántico) |

---

# Q3 — Gate coherencia de pasaje (`passage_incoherent`)

## 1. Causa raíz

Gemini inserta fragmentos incoherentes, deja **markdown** (`**`, `##`), o mezcla registros. No hay pasada de «sentido global» en generación (SEM-1 va a publish y mira ítems, no markdown).

## 2. Funciones

| Pieza | Rol |
|---|---|
| **Nuevo:** `passageCoherenceGate.mjs` | LLM + linter determinista markdown |
| **Nuevo:** `markdownLeakLint(text)` | Regex `\*\*|##|^-\s|^\*\s` en campos prosa |
| Campos escaneados | `passages[].text`, `questions[].signText`, `questions[].explanation` (T4), `passages[].text` T5 |

## 3. Dos capas (mínimo)

### Capa A — determinista (sin LLM)

| Patrón | reason | severity |
|---|---|---|
| `\*\*[^*]+\*\*` en prosa | `markdown_leak` | **block** |
| `^#{1,6}\s` | `markdown_heading_leak` | block |
| `` ` `` backticks | `markdown_code_leak` | block |

**Cubre:** t5-063, t5-065 (`**Umkleid…`, `**Datensch…`) sin LLM.

### Capa B — LLM (una llamada / parte)

Prompt:

```
Lies den folgenden deutschen Text. Gibt es einen Satz der
(a) grammatisch abgebrochen ist,
(b) logisch widersprüchlich zum Rest,
(c) offensichtlich aus einer anderen Quelle stammt?
Antwort JSON: { "ok": true } oder { "ok": false, "quote": "...", "reason": "..." }
```

Solo sobre `passages[].text` concatenados (máx. 4000 chars).

## 4. Umbral

| Condición | Acción |
|---|---|
| Capa A match | `block` inmediato |
| LLM `ok: false` | `block` · `passage_incoherent` |
| LLM `ok: false` + quote < 15 chars | `warn` |

## 5. Entrada / salida

**Salida ejemplo:**

```json
{
  "ok": false,
  "findings": [
    {
      "gate": "Q3",
      "reason": "markdown_leak",
      "severity": "block",
      "field": "passages[0].text",
      "message": "Restos markdown: «**Umkleide und Schließfächer:**»",
      "evidence": { "match": "**Umkleide und Schließfächer:**" }
    }
  ]
}
```

## 6. Cobertura estimada

| Métrica | Valor |
|---|---|
| Markdown T5 (2 archivos en lote 15) | **100%** vía capa A |
| Frase rota «kümmere mich… welche Pflanzen» (cat. 3) | **30–60%** vía capa B (LLM impreciso) |
| Colocaciones antinaturales (cat. 5) | **< 10%** — explícitamente fuera de scope |
| Del total no-caps ~18 | **10–15%** confirmado; hasta **25%** con LLM bien calibrado |

**Nota:** cat. 3 y 5 requieren otro gate futuro (Q5/Q6) si se priorizan.

---

# Q4 — Linter de metadatos (`metadata_invalid`)

## 1. Causa raíz

`_requestedTopic` se setea en generación pero `topicTag` en passages/questions puede divergir. Campos pedagógicos (`difficulty`, `skills`, `examType`) inconsistentes entre archivos publicados. CHK-26 cubre parte del topicTag pero no esquema completo.

## 2. Funciones

| Pieza | Rol |
|---|---|
| **Nuevo:** `metadataSchemaGate.mjs` | 100% determinista |
| **Reutilizar:** `normalizeB1Topic`, `detectTopic` de `b1Topics.js` | Familia semántica |
| **Reutilizar:** lógica CHK-26 de `audit-pass-2.mjs` | Extraer a módulo compartido (sin cambiar gate G2) |

## 3. Reglas

### R4.1 — Campos obligatorios (batch publicable)

```json
{
  "required": ["module", "teil", "lang", "level", "_requestedTopic"],
  "questionsEach": ["id", "module", "teil", "correct", "correctAnswer", "type"]
}
```

Faltante → `metadata_missing_field` · block.

### R4.2 — `correct === correctAnswer`

Ya CHK-2 en POOL-2 — Q4 **repite** para fail-fast temprano (barato).

### R4.3 — topicTag coherencia

| Regla | Umbral |
|---|---|
| `normalizeB1Topic(passage.topicTag) === normalizeB1Topic(_requestedTopic)` | exacto → pass |
| Si detectTopic(text) ≠ expected | **familia** permitida si comparten padre en `b1Topics.js` (ej. `umwelt` ↔ `nachhaltigkeit`) |
| Sin match exacto ni familia | `metadata_topic_mismatch` · block |

### R4.4 — Esquema uniforme en bank

Al comparar con últimos N publicados en bank: el set de keys de metadata debe ser idéntico. Campo nuevo en generado no presente en 95% del bank → `metadata_schema_drift` · warn (fase 1) / block (fase 2).

## 4. Entrada / salida

```json
{
  "ok": false,
  "findings": [{
    "gate": "Q4",
    "reason": "metadata_topic_mismatch",
    "severity": "block",
    "field": "passages[0].topicTag",
    "message": "topicTag «technik» ≠ _requestedTopic «familie»",
    "evidence": { "expected": "familie", "actual": "technik", "familyMatch": false }
  }]
}
```

## 5. Cobertura estimada

| Métrica | Valor |
|---|---|
| Lote 15 POST-HUMAN | **0%** explícito (no se reportaron mismatches topic) |
| Cat. 6 en auditoría ~20 archivos | **20–40%** si hay drift real |
| Del total no-caps | **5–15%** (baja en muestra actual, alta preventiva) |

---

## Matriz de cobertura — 16/17 no-caps (estimación)

Asumiendo **~17 defectos** en revisión humana ampliada, **~5 caps** (25–30%) y **~12 no-caps**:

| Cat. | Descripción | ~Casos | Gate | Cobertura gate |
|---:|---|---:|---|---:|
| 1 | Duplicados | 3 | **Q1** | **3/3** (100% cat.) |
| 2 | Clave↔explanation | 1+ | **Q2** | **0.5–1/1** (50–100% cat.) |
| 3 | Gramática rota | 1+ | Q3 capa B | **0.3–0.6** (parcial) |
| 4 | Markdown/incoherencia | 2 | **Q3** capa A | **2/2** markdown |
| 5 | Colocaciones | ? | — | 0% (fuera scope) |
| 6 | Metadatos | ? | **Q4** | variable |
| 7 | Regresión caps/idempotencia | ? | M1–M4 | caps track |

**Total no-caps cubiertos por Q1–Q4:** **~6–9 de ~12** → **50–75%** de defectos no-caps; **~35–45%** de todos los defectos (incl. caps sin M4).

Los **caps restantes** siguen en track M1–M4 (paralelo).

---

## Orden de integración en el pipeline

### Punto de enganche único

`runQualityAndStructuralGates()` en `generate-lesen-part-gemini.mjs` — **después** de `normalizeBatch` / `decapOnly`, **sin tocar** `publish-lesen-generated`.

### Secuencia propuesta

```
coerceGeneratedLesenPart
  → normalizeBatch (FULL) + decapOnly        [existente]
  → Q4 metadataSchemaGate                    [determinista, primero]
  → Q1 duplicateContentGate                  [determinista, antes de caps]
  → checkLesenBatchQuality + pos-caps-check  [existente, G2 congelado]
  → validatePart / POOL-2                    [existente]
  → Q3 passageCoherenceGate capa A (markdown)  [determinista]
  → Q2 answerKeyCoherenceGate (LLM)          [si budget API]
  → Q3 capa B (LLM coherencia)                [opcional / warn]
  → write batches/generated/ o .rejected/
```

### ¿Antes o después de pos-caps-check?

| Gate | Posición | Motivo |
|---|---|---|
| **Q4** | **Antes** caps | Barato; metadatos malos no merecen spaCy |
| **Q1** | **Antes** caps | Duplicado no es problema de ortografía |
| **Q3-A markdown** | **Antes** caps | Limpieza estructural |
| **Q2, Q3-B** | **Después** POOL-2 o después caps | Coste LLM; solo si estructura ya válida |
| **Caps G2** | Sin mover | Congelado |

### ¿Generación o publish?

| Gate | Generación | Publish |
|---|---|---|
| Q1 | **Sí** block | Auditoría opcional (no bloquear doble) |
| Q2 | **Sí** (warn→block) | No tocar SEM-1 |
| Q3-A | **Sí** block | — |
| Q3-B | Generación warn | — |
| Q4 | **Sí** block | — |

**sync-lesen-ready / publish:** sin cambios. Q1–Q4 evitan que basura entre en `generated/`.

### Integración paralela a M4

| Track | Cuándo | Archivo |
|---|---|---|
| **M4** (`hasNominalSuffix`) | Phase 2 caps | `capitalizeNouns.mjs` |
| **Q1** | Primera quality gate | `duplicateContentGate.mjs` |
| Calibración común | Mismo protocolo métricas | `PHASE-ACCEPTANCE-PROTOCOL` adaptado para Q gates |

---

## Roadmap de implementación (propuesto)

| Fase | Gate | Esfuerzo | ROI | Dependencias |
|:---:|---|---|---|---|
| **Q1a** | T3 fingerprint + corpus bank | 1–2 días | Alto | `t3GroupFingerprint` |
| **Q1b** | Passage hash 90% + cache corpus | 1 día | Alto | — |
| **Q3a** | Markdown lint determinista | 0.5 día | Alto | — |
| **Q4** | Metadata linter | 1 día | Medio | extraer CHK-26 |
| **Q2** | LLM answer key | 2 días | Medio (caso crítico) | API + tests |
| **Q3b** | LLM coherencia | 2 días | Medio-bajo | calibración FP |

**Recomendación:** implementar **Q1a + Q3a + Q4** antes que Q2 (máximo impacto, cero LLM, cero conflicto con M4).

---

## Criterios de aceptación (adaptados de PHASE-ACCEPTANCE-PROTOCOL)

Por cada Qn implementado:

1. Tests unitarios en `qualityGates/__tests__/`
2. Dry-run G2 (193) + generated (364) + prod-15 reportando `wouldReject` por archivo
3. **No aumentar** rechazos en archivos ya marcados «buenos» en ready sin motivo documentado
4. Casos positivos de la auditoría manual (t3 pair, t5 markdown) → **must reject**
5. Entrada en [`INDEX.md`](INDEX.md)

---

## Referencias

- Auditoría humana: `V3-POST-HUMAN-REVIEW-15.md`
- Dedup actual: `scripts/lib/semanticDedup.mjs`
- T3 fp: `scripts/lib/t3GroupFingerprint.mjs`
- CHK-18b: `scripts/lib/keyExplanationGate.mjs`
- POOL-2 blocking: `scripts/audit-pass-2.mjs` `GATE_BLOCK_CHECKS`
- Generación: `scripts/generate-lesen-part-gemini.mjs` `runQualityAndStructuralGates`
