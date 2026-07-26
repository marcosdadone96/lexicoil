# Auditoría de calibración de gates — A2 vs B1

**Fecha:** 2026-07-22  
**Método:** lectura de código fuente + verificación ejecutada donde aplica (`verify-a2-gates-live.mjs`, `test-cefr-gate.mjs`).  
**Pregunta:** ¿el umbral A2 está calibrado o reutiliza B1 por compartir función?

---

## Veredicto ejecutivo

| Área | ¿Listo para prueba de fuego? |
|------|------------------------------|
| Complejidad CEFR (subordinación, avgSent) | **Sí** — bandas A2 distintas en código |
| Blacklist preguntas (B1+ en A2) | **Parcial** — preguntas sí; pasajes no |
| Longitud por Teil (Lesen ingest) | **No** — CefrGate usa `knowledge/cefr/A2.json` (60–150), no blueprint/plantilla (120–200 T1) |
| Inferencia literal | **No operativo** — gate depende de metadata `inferenceLevel`, no del texto |
| CHK-14 / balanceMcq | **Agnóstico OK** (balanceMcq con rama A2 calibrada 2026-07-15) |
| Moldes CHK-29 T4/T5 | **N/A A2 Lesen** (formato distinto); riesgo residual si pipeline B1 T4 debate se activa en A2 |

**Recomendación:** calibrar **P7 (longitud Lesen ingest ↔ blueprint)** antes de generación masiva A2. Opcional P2 (pasajes A2). El resto no bloquea un smoke controlado de 1 parte/Teil.

---

## Tabla maestra

| # | Gate / métrica | Umbral A2 (código) | Umbral B1 (código) | Clasificación | Evidencia |
|---|----------------|-------------------|-------------------|---------------|-----------|
| **1a** | `subordinatePct` min/max | **0–12%** | **4–45%** | **Ajuste correcto** | `CefrGate.js:31-37` `COMPLEXITY` |
| **1b** | `avgSentenceLen` min/max | **6–14** | **10–22** | **Ajuste correcto** | idem |
| **1c** | `coverageVsLevel` mínimo | **≥55%** (global) | **≥55%** (global) | **Compartido** (vocab acumulado por nivel vía `CefrVocabLoader`; umbral % igual) | `CefrGate.js:9-18`, `211-236` |
| **1d** | `wordCount` Lesen (ingest CEFR) | **min 60, max 150** | **min 150, max 400** | **Ajuste parcial / riesgo P7** | `knowledge/cefr/A2.json:14-18`, `B1.json:37-41`; `CefrGate.loadLengthBounds` — **no** usa `wordsPerPassage` del blueprint en lectura |
| **1e** | `wordCount` Hören (ingest CEFR) | **por Teil blueprint** (ej. T2 80–150, T4 150–250) | por blueprint B1 | **Ajuste correcto** | `CefrGate.listeningBoundsFromPart` + `goethe_A2.json` |
| **1f** | `inferencePct` max | **≤20%** | **≤35%** | **Ajuste correcto en código; inactivo en práctica** | `CefrGate.js:22-28`, `486-510` — solo cuenta preguntas con `inferenceLevel`/`inference` = `inference`/`global` |
| **2a** | BLACKLIST C1/C2 (passages) | **misma lista `BLACKLIST`** (~30+ términos) | idem | **Compartido por diseño** (sigue siendo inválido en A2) | `audit-pass-2.mjs:446-448`, `lexicalCheck.mjs:207-208` |
| **2b** | Blacklist preguntas nivel+ | **`B1_QUESTION_BLACKLIST`** (24 términos) vía CHK-6c | **`B2_QUESTION_BLACKLIST`** (35 términos) vía CHK-6 | **Ajuste correcto (más restrictivo en preguntas que B1)** | `blacklist.mjs:115-148`, `audit-pass-2.mjs:455-488` |
| **2c** | B1+ en **passages** A2 | **No bloqueado** (comentario: «Passages may use B1 words») | N/A | **Pendiente de calibrar** si exigimos registro A2 también en pasajes | `blacklist.mjs:111-113`, CHK-6 no aplica B1+ a passages |
| **3** | CHK-14 capitalización | Sin parámetro `level` | idem | **Agnóstico por diseño** | `audit-pass-2.mjs:706-720` — `ARTICLE_RE_14`, listas `KNOWN_LOWER_NOUNS_14` |
| **4a** | CHK-18 min palabras explanation | **6** (MCQ/ja_nein); **3** (matching) | **10** (MCQ); **3** (matching) | **Ajuste correcto** | `audit-pass-2.mjs:1456` |
| **4b** | CHK-18 trivial / alemán / circular | Igual (regex trivial; `GERMAN_MARKER_RE`; Jaccard > **0.75**) | idem | **Compartido** (razonable) | `1430-1490` |
| **4c** | CHK-18b clave vs explanation | Solo **Lesen T2/T5** MCQ | idem | **N/A mayoría A2** (A2 no tiene T5; T2 sí aplica) | `keyExplanationGate.mjs:125` |
| **5a** | CHK-28 distractores MCQ | jaccard **0.42**, overlap **0.52**, literal **≥3w** | idem | **Compartido** — aplica A2 Lesen T2 (MCQ plano) | `mcqDistinctCheck.mjs:56-63`, `audit-pass-2.mjs:1910-1915` |
| **5b** | CHK-29 molde estructural (T4/T5) | **Skipped** si no hay molde B1 (`extractStructuralMold` T4 debate / T5 subtype) | Activo Lesen T4 foro + T5 subtipos | **N/A formato A2** (T4 = Anzeigen, no foro) | `structuralMoldDedup.mjs:22-34`, `59-60` |
| **5c** | CHK-29 audit-pass-2 (cronología) | Solo **Hören T4 matching ×8** (B1) | idem | **N/A A2** (A2 H4 = ja_nein ×5) | `audit-pass-2.mjs:2109-2114` |
| **6** | balanceMcq / length-bias | minPct **20%**, minChars **8**, severe **30%/**14ch, batchFail **2** | minPct **20%**, minChars **12**, severe **30%/**18ch, batchFail **2** | **Ajuste correcto A2** (calibrado 2026-07-15) | `mcqLengthBias.mjs:45-75`; `verify-a2-gates-live.mjs` output |
| **7a** | Plantillas `A2_TEIL_LENGTH_RULES` | T1 **120–200**, T2 **80–150**, T3 **100–180**, T4 **20–60/ad** | B1 `TEIL_LENGTH_RULES` (T1 150–220, etc.) | **Solo prompts** — no es gate de ingest | `lesenTemplatePrompt.mjs:78-107` |
| **7b** | Blueprint `goethe_A2.json` | T1 **120–200**, T2 **80–150**, T3 **100–180**, T4 ads **20–60** | B1 blueprint distinto | **Referencia oficial** — Hören sí cableado a CefrGate | `library/blueprints/goethe_A2.json` |
| **7c** | Gate ingest longitud Lesen | **`knowledge/cefr/A2.json` 60–150** (global por nivel) | 150–400 | **Pendiente de calibrar** — **desalineado** vs 7a/7b para T1/T3 | `CefrGate.validateExam` `545-551` no pasa `wordsPerPassage` en lectura |
| **7d** | `horenBatchQuality` longitud | Hardcoded A2: T2 **70–160**, T3 seg **15–50**, T4 **150–250** | Reglas B1 monólogo etc. | **Ajuste correcto** (alineado blueprint) | `horenBatchQuality.mjs:128-320` |
| **7e** | `ExamValidator` suelo lectura | **`LEVEL_READING_MIN.A2 = 60`** | **150** | **Compartido mecanismo, valor A2** (solo mínimo global, sin max por Teil) | `ExamValidator.js:6-12`, `150-177` |
| **8** | Inferencia / ambigüedad | max **20%** preguntas etiquetadas `inference`/`global` | max **35%** | **Pendiente de calibrar** — sin etiquetado → **0%** siempre pasa; no fuerza comprensión literal | `CefrGate.js:495-505` |

---

## Detalle por punto (evidencia de código)

### 1. CEFR Gate

Fuente única: `js/engine/validation/CefrGate.js`

```javascript
// COMPLEXITY — líneas 31-37
A2: { minAvg: 6, maxAvg: 14, minSub: 0, maxSub: 12 },
B1: { minAvg: 10, maxAvg: 22, minSub: 4, maxSub: 45 },

// INFERENCE — líneas 22-28
A2: { maxInference: 0.2 },
B1: { maxInference: 0.35 },

// coverage — resolveCoverageThreshold() default 0.55 para TODOS los niveles
```

**Riesgo descartado:** texto A2 simple no fallará por `subordinate_too_few` (minSub A2 = **0** vs B1 = **4**).

**Riesgo activo:** `validatePassage` en lectura usa `loadLengthBounds('A2')` → `knowledge/cefr/A2.json` **60–150 palabras**, no los rangos por Teil del blueprint (T1 120–200). Un texto T1 de 100 palabras **pasa ingest** pero **viola plantilla**.

**Hören:** `extractListeningPassageChecks` sí inyecta `wordsPerTranscript` del blueprint (`CefrGate.js:178-188`, `314-318`).

**Ejecutado:** `node scripts/test-cefr-gate.mjs` → PASS; `verify-a2-gates-live.mjs` confirma length-bias A2 `{ minPct: 20, minChars: 8 }`.

---

### 2. Blacklist léxica

| Capa | A2 | B1 |
|------|----|----|
| Passages + campos globales | `BLACKLIST` (C1/C2) | idem |
| Preguntas/options/explanation | `B1_QUESTION_BLACKLIST` (CHK-6c) | `B2_QUESTION_BLACKLIST` (CHK-6) |
| Pipeline generación | `questionBlacklistForLevel('A2')` → B1+ | → B2+ | `blacklist.mjs:144-148`, `lexicalCheck.mjs:201-212` |

**CHK-6** aplica `B2_QUESTION_BLACKLIST` solo si `level !== 'A2'` (`audit-pass-2.mjs:455`).

**Gap:** pasajes A2 curados pueden contener «Herausforderung», «Weiterbildung» — permitido hoy. `verify-a2-gates-live` detecta B1+ en pregunta, no en pasaje.

---

### 3. CHK-14

Funciones `chk14` / `chk14b` / `chk14c`: **ninguna referencia a `level`**. Umbrales fijos (sufijos nominales, listas empíricas).  
**Clasificación: agnóstico por diseño.**

---

### 4. CHK-18 / CHK-18b

```javascript
// audit-pass-2.mjs:1456
const minWords = isMatchingItem ? 3 : (level === 'A2' ? 6 : 10);
```

CHK-18b (`keyExplanationGate.mjs:125`): solo `lesen` teil **2 o 5** — en A2 aplica **solo T2** (no hay T5).

---

### 5. CHK-28 / CHK-29

**A2 moldes:** no hay Lesen T5; T3 = email MCQ (CHK-17 salta A2 MCQ a/b/c, `1337`); T4 = 6 Anzeigen + matching (`lesenBatchQuality.checkLesenA2Teil4`).

**CHK-29 molde B1** (`structuralMoldDedup.mjs:59`): `if (![4, 5].includes(teil) || !topicTag) return { ok: true, skipped }`. Para A2 T4 con `topicTag`, intenta molde `t4_debate` (lógica B1) — **riesgo bajo** si `detectT4DebateTopic` no match en Anzeigen, pero **no calibrado explícitamente para A2**.

**CHK-28:** corre en A2 Lesen T2 (MCQ plano) con umbrales B1 — **compartido, aceptable**.

---

### 6. balanceMcq

```javascript
// mcqLengthBias.mjs:63-74
A2: { minPct: 20, minChars: 8, severePct: 30, severeChars: 14, batchFailCount: 2 }
B1: { minPct: 20, minChars: 12, severePct: 30, severeChars: 18, batchFailCount: 2 }
```

`lesenBatchQuality.mjs:247-249` aplica length-bias también a **A2 Lesen T1/T3** MCQ.

---

### 7. Rangos de palabras por Teil

| Teil | Prompt/Blueprint A2 | Gate ingest Lesen | Gate calidad |
|------|---------------------|-------------------|--------------|
| Lesen T1 | 120–200 | 60–150 (CEFR global) | estructura MCQ, no wc pasaje |
| Lesen T2 | 80–150 | 60–150 | wc + fórmula Stock/Etage |
| Lesen T3 | 100–180 | 60–150 | estructura email |
| Lesen T4 | 20–60/anuncio | lengthOnly ads (`ads_matching`) | 6 ads, 5 matching, X |
| Hören T2 | blueprint 80–150 | blueprint vía CefrGate | 70–160 hardcoded |
| Hören T3 | 15–50/seg | blueprint | 15–50/seg hardcoded |
| Hören T4 | 150–250 | blueprint | 150–250 hardcoded |

**Desalineación crítica:** tres fuentes para Lesen T1 (prompt 120 min, CEFR 60 min, ExamValidator suelo 60).

---

### 8. Inferencia

- Banda A2: **max 20%** vs B1 **35%** (`INFERENCE_BANDS`).
- Implementación: solo metadata en preguntas; **sin etiquetado → siempre 0%** → no valida «cero inferencia» pedagógica.
- **Clasificación: pendiente de calibrar** si el requisito es literalidad real (haría falta heurística de contenido o tagging sistemático en generación).

---

## ¿Prueba de fuego ahora?

| Escenario | Recomendación |
|-----------|---------------|
| Smoke **1 parte/Teil** con revisión manual | **Sí**, con ojos en longitud Lesen T1/T3 (ingest más permisivo que plantilla) |
| Generación masiva `--from-coverage` | **No todavía** — blobs A2 vacíos + gap P7 |
| Bloqueantes antes de volumen | **P7** (pasar `wordsPerPassage` del blueprint a `CefrGate` lectura, o alinear `knowledge/cefr/A2.json`); opcional **P2** pasajes |

---

## Comandos de verificación

```bash
node scripts/test-cefr-gate.mjs
node scripts/verify-a2-gates-live.mjs
node -e "const g=require('./js/engine/validation/CefrGate.js'); /* validateExam con batch A2 T1 */"
```

---

*Diagnóstico only — sin cambios de código en esta sesión.*
