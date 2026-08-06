# AUDITORÍA TÉCNICA — LexiLoop Goethe B1 Pipeline
> Generada el 1 Jul 2026. Basada en lectura directa del código fuente, ejecución de auditorías
> en vivo sobre los archivos de producción, y análisis de cuatro subagentes especializados.
>
> **Para Claude**: este documento es un informe técnico completo del sistema de generación de
> exámenes Goethe B1 de LexiLoop. Contiene hallazgos verificados (no estimaciones), números
> reales de errores en producción, y un análisis de todos los validadores. Léelo entero antes
> de proponer cambios.

---

## 1. CONTEXTO DEL SISTEMA

LexiLoop genera exámenes Goethe B1 en alemán. El flujo tiene dos partes:

**Pipeline offline** (scripts Node.js):
```
Gemini API → extractJson → normalizeBatch → validate-batch → lesenBatchQuality
→ lexicalCheck → semanticDedup → audit-pass-2 → batches/generated/
→ ExamBlueprint.assemble() → publishCuratedExam() [GATE-1]
→ library/curated/de/B1/ → curated-to-served.mjs [GATE-1 segunda vez]
→ data/exams/de_B1.json
```

**Runtime browser** (JavaScript):
```
fetchExamFromPool → ExamLibrary (data/exams/) → QuestionLibrary.buildExam()
→ validateExamCandidate() [solo renderabilidad] → examRunner.renderExam()
```

### Estructura del examen Goethe B1

Un examen completo tiene estos módulos:
- **Lesen** (65 min): T1 richtig_falsch×6, T2 multiple_choice×6, T3 matching×7, T4 ja_nein×7, T5 multiple_choice×4
- **Hören** (40 min): T1 richtig_falsch+multiple_choice×10, T2 multiple_choice×5, T3 richtig_falsch×7, T4 matching×8
- **Schreiben** (85 min): 3 partes (short_answer)
- **Sprechen**: 3 partes (short_answer)

---

## 2. HALLAZGOS CRÍTICOS VERIFICADOS EN PRODUCCIÓN

### 2.1 `data/exams/de_B1.json` (archivo servido a usuarios reales)

Ejecutado: `node scripts/audit-pass-2.mjs data/exams/de_B1.json --json`

```
Total findings: 102
CRITICAL: 48   IMPORTANT: 46   INFO: 8

CHK-1  CRITICAL ×40:  type:"multiple" (debería ser "multiple_choice")
CHK-8  CRITICAL ×8:   IDs duplicados / campos faltantes
CHK-20 IMPORTANT ×10: Hören T1 segmentos sin estructura correcta
CHK-18 IMPORTANT ×27: explanations < 10 palabras
CHK-6  IMPORTANT ×3:  vocabulario C1/C2 ("kontextualisieren", "Polyphonie")
CHK-7  IMPORTANT ×1:  T4 signText dice "sehr gut" pero correct="Nein"
CHK-14 IMPORTANT ×1:  sustantivo alemán en minúscula ("deadline")
CHK-10 IMPORTANT ×2:  palabras absolutas predicen la respuesta
```

**Causa raíz de las 40 CHK-1**: `curated-to-served.mjs` convierte `multiple_choice` → `multiple`
en el formato servido (líneas 74–76) **después** de que el gate ya corrió. El gate valida con
`multiple_choice` pero el archivo final tiene `multiple`.

### 2.2 `library/pool-seed/de_B1.json`

```
Total findings: 127
CRITICAL: 68   IMPORTANT: 37   INFO: 20   MINOR: 2

CHK-8  CRITICAL ×68:  IDs duplicados cross-exam (esperado al mezclar muchos exámenes en un pool)
CHK-18 IMPORTANT ×27: explanations cortas
CHK-6  IMPORTANT ×3:  C1/C2 ("Gardening" en minúscula → anglicismo)
CHK-10 IMPORTANT ×2:  palabras absolutas
CHK-12 IMPORTANT ×1:  Hören T1 bloque R/F desbalanceado (4R/1F = 80%)
CHK-15 IMPORTANT ×1:  Lesen T5 demasiado largo (291 palabras, máx 280)
```

### 2.3 `library/curated/de/B1/` — Exámenes nuevos con GATE-1 activo

Los 3 exámenes en el path protegido por GATE-1 (`publishCuratedExam`):

```
curated_de_B1_26c8db0e8d85.json: 23 findings, 0 CRITICAL, 19 IMPORTANT
  CHK-6×2, CHK-7×1, CHK-10×1, CHK-13×1, CHK-14×1, CHK-18×13

curated_de_B1_4ef471830279.json: 22 findings, 0 CRITICAL, 18 IMPORTANT
  CHK-6×1, CHK-10×1, CHK-12×1, CHK-15×1, CHK-18×14

curated_de_B1_ce5df074ba14.json: 22 findings, 0 CRITICAL, 18 IMPORTANT
  CHK-7×2, CHK-10×1, CHK-17×1, CHK-18×11, CHK-19×1, CHK-21×2
  ⚠️  GATE BYPASS CONFIRMADO:
    CHK-17: "L3 usa opciones distintas por ítem (MCQ per-ítem real)" — FRANKENSTEIN L3
    CHK-21: "L4: signTexts duplicados" + "autores repetidos (Die×4, Viele×2)"
```

Verificado directamente en el archivo: `items[0].options !== items[1].options` — listas A-J
diferentes por ítem. Ambas CHK (CHK-17, CHK-21) están en `GATE_BLOCK_CHECKS` y deberían
haber bloqueado la publicación.

---

## 3. ANÁLISIS DE TODOS LOS VALIDADORES

### 3.1 Pipeline de generación (antes del banco)

| Script | ¿Se ejecuta siempre? | Bypass | Errores silenciosos |
|--------|---------------------|--------|---------------------|
| `validate-batch.mjs` | Solo si `!args.skipValidate` | `--no-validate` | Ajv skipped silenciosamente si falla el import |
| `lesenBatchQuality.mjs` | Solo si `!args.skipQuality` | `--skip-quality` | `checkMcq` hace `continue` si no encuentra la opción correcta (silent skip) |
| `lexicalCheck.mjs` | Solo si `!args.skipQuality` | `--skip-quality` | warnings no fallan `ok` |
| `semanticDedup.mjs` | Siempre (no flag en parseArgs) | — | **Excepción → warn y CONTINÚA** (no bloquea) |
| `audit-pass-2.mjs` (en batch) | Solo si `!args.skipQuality` | `--skip-quality` | **spawnSync falla → warn y CONTINÚA** |
| `lesenBatchIngestCheck` | Solo si `!args.skipIngest` | `--skip-ingest` | Falla pero archivo ya escrito queda en disco (huérfano) |

**Bug importante**: cuando el subproceso `audit-pass-2.mjs` lanza una excepción (crash, ENOMEM,
timeout), el try/catch hace `console.warn` y **continúa** — el batch pasa al banco sin audit.

### 3.2 `validate-batch.mjs` — ¿Qué valida exactamente?

✅ Valida: esquema JSON, tipos canónicos, IDs únicos vs banco, passageId existe, blueprint placement (¿llena algún slot?), conformance por tipo  
❌ No valida: si la respuesta correcta es factualmente correcta, si los distractores son distintos semánticamente, ambigüedad, dos respuestas correctas

**Bug**: `ExamValidator` (que sí verifica `mcq_multiple_correct`, `mcq_duplicate_options`,
`mcq_correct_not_in_options`) se ejecuta en `lesenBatchIngestCheck`, **no** en `validate-batch`.

### 3.3 `lesenBatchQuality.mjs` — ¿Qué valida exactamente?

✅ Valida: 1 pasaje + 6 preguntas (T1), pronombres primera persona, anti word-matching 4-gramas, ≥2 Richtig + ≥2 Falsch, tono educativo, sesgo de respuesta >60%, T3 ads, T4 signText heurístico  
❌ No valida: ambigüedad, dos respuestas correctas, correctness semántico, explanations

### 3.4 `audit-pass-2.mjs` — CHK-N completo

| CHK | Detecta | No detecta | Sev habitual | ¿Bloquea gate? |
|-----|---------|-----------|-------------|---------------|
| CHK-1 | tipo no canónico | contenido | CRITICAL | ✅ sí |
| CHK-2 | correct/correctAnswer formato y valor | si la respuesta es correcta semánticamente | CRITICAL | ✅ sí (CRITICAL only) |
| CHK-3 | conteo ítems vs blueprint (solo Teile presentes) | Teile ausentes — **silencioso si 0 preguntas de ese Teil** | CRITICAL | ✅ sí |
| CHK-4 | distribución de respuestas desequilibrada | sesgos sutiles con n<6 | IMPORTANT | ❌ advisory |
| CHK-5 | pasajes duplicados (hash+Jaccard) | repetición de tema sin copia | IMPORTANT | ❌ advisory |
| CHK-6 | vocabulario C1/C2 (lista finita) | gramática, anglicismos fuera de lista | IMPORTANT | ❌ advisory |
| CHK-7 | T4: negación en pregunta, patrón "Ist X für…?", coherencia Ja/Nein heurística | inversiones sutiles sin keywords; **filtra ja_nein globalmente, no solo lesen T4** | CRITICAL/IMPORTANT | ⚠️ solo CRITICAL (negación) |
| CHK-8 | campos obligatorios, IDs únicos, passageId referenciado | calidad de los campos | CRITICAL | ✅ sí |
| CHK-9 | ausencia de ítem "Beispiel (0)" | — | INFO | ❌ no (ni en auditExam) |
| CHK-10 | palabras absolutas que predicen respuesta en L1/H1 | otros tipos de sesgo | IMPORTANT | ❌ advisory |
| CHK-11 | H4: balance hablantes, anti-copia 5 palabras | coherencia semántica postura↔enunciado | IMPORTANT | ❌ advisory |
| CHK-12 | R/F balance >70% | desequilibrios sutiles | IMPORTANT | ❌ advisory |
| CHK-13 | MC distribución letras >55% | sesgo con n<3 | IMPORTANT | ❌ advisory |
| CHK-14 | sustantivos alemanes en minúscula (lista ~100 + sufijos) | sustantivos no cubiertos; errores al inicio de frase | IMPORTANT | ❌ advisory |
| CHK-15 | longitud pasajes vs blueprint | calidad del contenido | IMPORTANT | ❌ advisory |
| CHK-16 | anti word-matching L1 y H3 (4-gramas) | otros Teile; sinónimos | IMPORTANT | ❌ advisory |
| CHK-17 | L3 Frankenstein (opciones distintas por ítem) + clave inválida + sin cero | calidad de los anuncios | IMPORTANT | ✅ BLOQUEANTE (bypass confirmado) |
| CHK-18 | explanation corta (<10 palabras), trivial, no alemán, circular (Jaccard>0.75) | precisión semántica, coherencia con pasaje | IMPORTANT | ❌ advisory |
| CHK-19 | runs ≥4 respuestas iguales consecutivas | distribuciones no aleatorias cortas | IMPORTANT | ❌ advisory |
| CHK-20 | H1: 5 segmentos, cada uno 1 RF + 1 MC | coherencia transcript↔pregunta | IMPORTANT | ❌ advisory |
| CHK-21 | T4 Frankenstein: signTexts cortos/duplicados, autores repetidos | calidad del contenido signTexts | IMPORTANT | ✅ BLOQUEANTE (bypass confirmado) |

**Nota importante sobre CHK-3**: solo verifica conteos de Teile que ya están presentes en el batch.
Si un examen no tiene ningún ítem de lesen-1, CHK-3 no emite ningún finding — pasa silenciosamente.

### 3.5 GATE_BLOCK_CHECKS — fuente de verdad

```javascript
// scripts/audit-pass-2.mjs, líneas 1332-1335
export const GATE_BLOCK_CHECKS = new Set([
  'CHK-17', // L3 Frankenstein
  'CHK-21', // T4 Frankenstein
]);
// isExamPublishable bloquea si: severity === 'CRITICAL' || GATE_BLOCK_CHECKS.has(f.id)
```

Los siguientes CHK son **ADVISORY** (loguean pero no bloquean): CHK-4, CHK-5, CHK-6, CHK-7
(excepto negación CRITICAL), CHK-10, CHK-11, CHK-12, CHK-13, CHK-14, CHK-15, CHK-16, CHK-18,
CHK-19, CHK-20.

El comentario en el código (líneas 1329-1330) documenta que esta es una decisión intencional:
bloquear todos los IMPORTANT congela el pipeline porque el banco histórico tiene muchos
defectos de contenido preexistentes.

---

## 4. GAPS — CASOS QUE ESCAPAN A TODOS LOS VALIDADORES

### GAP-1 — Gramática alemana ❌ 0% cobertura
Ningún corrector gramatical determinista. CHK-6 tiene ~6 patrones de error gramatical
(blacklist.mjs con `grammar: true`). CHK-14 detecta ~40% de errores de capitalización de
sustantivos. El resto pasa.

**Ejemplos reales en el banco**:
- `"für die bewohner meiner Straße"` — sustantivo sin mayúscula
- `"wenn Sie uns mit Zeit oder Geld unterstützt"` — conjugación incorrecta (Sie-forma)
- `"Sanierung der Dächern"` — pluralización incorrecta (`der Dächer`)

### GAP-2 — Dos respuestas correctas / ninguna respuesta correcta ❌ 0% cobertura
CHK-2 verifica el formato del campo `correct` (a/b/c, Richtig/Falsch, etc.) pero no si la
respuesta es factualmente correcta ni si los distractores son definitivamente incorrectos.
`ExamValidator.validate` sí tiene `mcq_multiple_correct` pero solo detecta si hay dos letras
marcadas como correctas en el JSON — no si el texto de dos opciones podría ser igualmente
defendible desde el pasaje.

### GAP-3 — Preguntas ambiguas ❌ 0% cobertura
No detectadas en ningún punto del pipeline.

### GAP-4 — Naturalidad del texto alemán ❌ <5% cobertura
Solo heurísticas: frases educativas (lista de 8), tono en CHK-7/10. No hay scorer de
complejidad sintáctica, collocaciones, ni registro.

**Ejemplos reales en el banco**:
- `"Die Bewässerung von Wissen braucht Zeit"` — metáfora sin sentido
- `"Beistand leisten"` para pedir ayuda técnica — registro inadecuado
- `"interne Reserven an Papier"` — colocación antinatural

### GAP-5 — Anglicismos fuera de la blacklist ❌ parcial (~20% cobertura)
CHK-6 tiene una lista de anglicismos específicos. Fuera de la lista, pasan. Ejemplos en
producción: `FOMO`, `Homeoffice`, `Work-Life-Balance`, `implementieren`, `deadline` (en minúscula).

### GAP-6 — Vocabulary stuffing / repetición de plantilla ❌ 0% cobertura
CHK-5 detecta pasajes duplicados (hash/Jaccard). No detecta repetición de estructura narrativa
("mudarse a ciudad → organización → vecino → familia") que aparece en 14+ textos Lesen T1.

**Datos del banco**: en 50 pasajes del pool-sample, 57 ocurrencias de
`Nachbar/Organisation/Programm/Gemeinschaft`. Clonación masiva de plantilla que pasa todos los CHKs.

### GAP-7 — Coherencia Hören transcript↔preguntas ❌ <20% cobertura
CHK-20 verifica estructura de segmentos H1. CHK-11 verifica balance hablantes H4.
Ningún CHK verifica que el transcript responda de forma unívoca a las preguntas.

### GAP-8 — Nivel CEFR del texto (más allá de vocabulario) ❌ ~30% cobertura
Solo blacklist de C1/C2 finita. No hay scorer automático de complejidad sintáctica.
Ejemplos en producción: `Polyphonie`, `kontextualisieren`, `gesellschaftstheorie`, `Antithese`.

### GAP-9 — Accuracy de las explanations ❌ ~15% cobertura
CHK-18 detecta explanations cortas/triviales/circulares. No detecta si la explanation afirma
algo incorrecto sobre el pasaje. En producción: 27 findings CHK-18 en pool-seed, 11-14 por examen curado.

---

## 5. BUGS CONCRETOS IDENTIFICADOS

### BUG-1 — `type:"multiple"` llega a producción (CONFIRMADO)
**Causa**: `curated-to-served.mjs` líneas 74–76 convierte `multiple_choice` → `multiple` en el
formato servido, DESPUÉS de que `isExamPublishable` ya corrió con el tipo correcto.
**Evidencia**: 40 CHK-1 CRITICAL en `data/exams/de_B1.json`.
**Fix**: normalizar al tipo canónico `multiple_choice` en el formato servido, o actualizar
el BLUEPRINT para aceptar `multiple`.

### BUG-2 — GATE-1 bypass para CHK-17/CHK-21 (CONFIRMADO)
**Evidencia**: `library/curated/de/B1/curated_de_B1_ce5df074ba14.json` tiene CHK-17 IMPORTANT
(L3 Frankenstein: `items[0].options !== items[1].options`) y CHK-21 IMPORTANT (autores repetidos:
`Die×4, Viele×2`). Ambos están en `GATE_BLOCK_CHECKS`. El archivo llegó al directorio protegido.
**Causa probable**: La `flattenExam` puede no estar exponiendo correctamente los items de
`part.items[]` en el formato específico del exam wrapper que se pasa a `publishCuratedExam`,
haciendo que CHK-17/CHK-21 no tengan items que auditar en el momento del gate.

### BUG-3 — `semanticDedup` y `audit-pass-2` fail-open en generación
**Causa**: En `generate-lesen-part-gemini.mjs`, ambos corren dentro de try/catch que hace
`console.warn` y continúa. Una excepción en el subprocess de audit-pass-2 no bloquea el batch.
**Impacto**: Un batch con problemas auditables puede entrar al banco si audit falla silenciosamente.

### BUG-4 — `build-disjoint-pool.mjs` referencia campo inexistente
**Causa**: Líneas 227–231 referencian `gate.audit.critical` pero `isExamPublishable` devuelve
`{ ok, blocking, advisory }`. Puede lanzar `TypeError` en ciertos paths del pool disjunto.

### BUG-5 — `repairTriage` no conectado en generador Lesen
**Causa**: `repairTriage.classifyAndRepair` está importado y usado en `generatePartGeminiLib.mjs`
(Hören/Schreiben/Sprechen) pero **no en `generate-lesen-part-gemini.mjs`**. El generador Lesen
siempre usa reintentos LLM de pago en lugar de reparaciones en código.

### BUG-6 — `tryRepairT1Questions` es código muerto
**Causa**: La función existe en `generate-lesen-part-gemini.mjs` (líneas 299–331) pero tras
la eliminación de `usesFreshRegenOnQuality` en P9, nunca se llama.

### BUG-7 — `CefrGate` bypass en promote
**Causa**: `promote-bank-to-curated.mjs` pasa un fake CefrGate result:
```javascript
cefrGate: { withinRange: true, metrics: {}, reasons: [] }  // línea 293
```
`curate.mjs` sí aplica CefrGate real. Dos paths con gates inconsistentes.

### BUG-8 — CHK-3 no detecta Teile completamente ausentes
**Causa**: CHK-3 solo itera `groups` construido a partir de las preguntas presentes. Si un
examen tiene 0 preguntas de lesen-1, no hay ningún finding — el Teil ausente pasa silenciosamente.

---

## 6. ANÁLISIS DEL ENSAMBLADOR

### `ExamBlueprint.assemble()` + `pickFromPool()`

**Invariantes que SÍ se imponen** (post ROOT-1):
- L3: solo reutiliza set si todos los 7 ítems tienen la misma lista A-J; si no → genera fresco
- T4: solo reutiliza si ≥7 ítems de misma fuente, autores únicos, signText ≥15 palabras; si no → fresco
- `exclude` set para evitar ítems duplicados entre exámenes
- `used` Set para evitar IDs duplicados dentro de un examen

**Invariantes que NO se imponen** (gaps):
- Distribución de dificultad entre Teile — solo soft filter con retry
- Duración estimada del examen — no calculada
- Repetición de temas entre L1/L2/L3/L4/L5 del mismo examen
- Consistencia de metadata lang/level/module de los ítems seleccionados
- Calidad de ítems individuales más allá de estructura T3/T4

**Comportamiento ante pool vacío**:
- T3/T4: `picked = []` → parte ausente en el examen, `coverage.complete = false`
- Otros Teile: shuffle aleatorio de lo que haya (puede ser menos del target)
- El ensamblador **nunca lanza** — siempre devuelve un objeto

**`LesenPartGenerators` solo disponible en Node**, no en browser. Si el banco no tiene
sets T3/T4 coherentes en el browser, las partes se omiten silenciosamente.

---

## 7. RUNTIME DEL BROWSER

### Cascade de fuentes (orden):
1. **Pool** — `fetchExamFromPool` → API → validación **omitida** (`source: 'pool'`)
2. **QuestionLibrary** — ensamblado live → sin gate de cobertura, `blueprintComplete` exempt
3. **ExamLibrary** — `data/exams/de_B1.json` → lo que llegó del pipeline offline

### Validación antes de mostrar al usuario:

`validateExamCandidate` verifica:
- `isExamRenderable`: para `libraryBuilt`, basta con **un módulo** (no lesen+horen)
- `isExamBlueprintComplete`: omitido para pool y question-library
- `lcExamPassesValidator`: omitido para pool; no-strict por defecto para otros
- `examHasUnanswerableQuestions`: sí corre (sin unanswerable questions = pregunta sin opciones)

**No verifica**: gramática, naturalidad, dos respuestas correctas, nivel CEFR, coherencia transcript.

---

## 8. CALIDAD REAL DEL BANCO — DATOS OBSERVADOS

### Distribución del banco (análisis de 50 pasajes + ~200 preguntas en pool-sample-audit.json)

| Módulo/Tipo | Calidad observada |
|-------------|------------------|
| Lesen T1 (blog/email) | Bimodal: 30-40% bueno (Gemini reciente), 60-70% templado ("mudarse→organización→vecino") |
| Lesen T2 (prensa) | Mayoritariamente usable pero con metáforas forzadas |
| Lesen T3 (matching ads) | Estructura correcta post ROOT-1; calidad de anuncios variable |
| Lesen T4 (foro opiniones) | Coherente post ROOT-1; 3 casos de CHK-7 invertido en producción |
| Hören T1 (anuncios) | Gemini reciente: bueno. Antiguo: grammar errors, vocabulary stuffing |
| Hören T2/T3/T4 | Variable; anticuado tiene anglicismos, registro incorrecto |
| Schreiben/Sprechen | Generalmente bien formados (son solo prompts/rubrics) |

### Problemas recurrentes en contenido real

1. **Vocabulary stuffing**: `Mangel`, `Reserven`, `Beistand`, `Beförderung`, `Bewässerung`
   forzados en contextos incorrectos semánticamente
2. **Template cloning**: "mudarse a ciudad → organización → vecinos → familia" repetido 14+ veces
3. **Grammar slips** que los validators no detectan: case errors, conjugaciones Sie-forma,
   plurales incorrectos
4. **Anglicismos/Denglish**: `deadline`, `FOMO`, `Homeoffice`, `implementieren`, `Work-Life-Balance`
5. **Registro incorrecto**: `Beistand leisten` para pedir ayuda técnica, `Bewässerung von Wissen`
6. **C1+ leakage**: `Polyphonie`, `kontextualisieren`, `gesellschaftstheorie`, `Antithese`
7. **Explanations thin**: 27 findings CHK-18 en pool — explicaciones de 5-9 palabras que no enseñan
8. **T4 key contradictions**: signText con `befürworte` (positivo) pero `correct="Nein"` — al menos
   3 casos en producción que causaron rechazos de exámenes curados

---

## 9. COBERTURA FINAL

| Área | Cobertura real | Riesgo | Prioridad |
|------|---------------|--------|-----------|
| Estructura JSON (tipos, campos, IDs) | 95% | Bajo | — |
| Conteo de ítems por blueprint | 80% (CHK-3 blind spot para Teile ausentes) | Medio | Alta |
| Balance de respuestas | 85% | Bajo-medio | Baja |
| Frankenstein L3/T4 | 80% — **bypass confirmado** | **Alto** | **Urgente** |
| Capitalización sustantivos alemanes | 40% — lista parcial | Medio | Alta |
| Gramática alemana | **0%** | **Alto** | **Crítica** |
| Naturalidad del texto | **5%** | **Alto** | **Crítica** |
| Dos respuestas correctas / ninguna | **0%** | **Alto** | **Crítica** |
| Preguntas ambiguas | **0%** | **Alto** | **Crítica** |
| Nivel CEFR (más allá de vocab) | 30% — solo blacklist | Medio | Alta |
| Coherencia Hören transcript↔preguntas | 20% — solo estructura | **Alto** | Alta |
| Accuracy de explanations | 15% | Medio | Media |
| Word-matching L1/H3 | 70% | Medio | — |
| Deduplicación de pasajes | 75% | Bajo | — |
| Repetición de temas cross-examen | 10% | Medio | Media |
| Distribución de dificultad | **0%** | Medio | Media |
| `type:"multiple"` en producción servida | **0%** — 40 CRITICALs activos | **Urgente** | **P0** |

---

## 10. PLAN DE MEJORAS — POR IMPACTO

### P0 — Urgente (producción rota ahora mismo)

**P0-A**: Regenerar `data/exams/de_B1.json` ejecutando `curated-to-served.mjs` para eliminar
las 40 preguntas con `type:"multiple"`. O mejor: corregir el script para no convertir a
`multiple` y mantener `multiple_choice` en el archivo servido.

**P0-B**: Investigar el bypass GATE-1 para `ce5df074ba14`. Hipótesis principal: `flattenExam`
no expone correctamente `part.items[]` del formato específico que llega a `publishCuratedExam`.
Añadir test de regresión que llame directamente `publishCuratedExam` con un exam Frankenstein
y verifique que devuelve `{ blocked: true }`.

### P1 — Alta (gaps críticos con solución factible)

**P1-A**: Normalizar `type:"multiple"` → `"multiple_choice"` en `normalizeBatch.mjs` de forma
determinista antes de cualquier escritura al banco. `normType()` existe en `ExamBlueprint.js`
para selección pero no normaliza al guardar.

**P1-B**: Ampliar `KNOWN_LOWER_NOUNS_14` (CHK-14) con los 200 sustantivos B1 más frecuentes
no cubiertos por la lista actual de ~100. Considerar integrar LanguageTool como subprocess
opcional para los batches nuevos.

**P1-C**: Conectar `repairTriage.classifyAndRepair` en el generador Lesen
(`generate-lesen-part-gemini.mjs`) — actualmente solo está en Hören/Schreiben/Sprechen.

**P1-D**: Cerrar el fail-open de `semanticDedup` y `audit-pass-2` en `runDualGates` —
diferenciar entre "subprocess crashed" (debería bloquear) y "found no issues" (continúa).

**P1-E**: Corregir CHK-3 para detectar Teile completamente ausentes. Añadir verificación
explícita de que todos los Teile del blueprint están representados con el conteo correcto,
incluso si tienen 0 ítems.

### P2 — Media

**P2-A**: Mover CHK-18 a `GATE_BLOCK_CHECKS` para lotes **nuevos** (no retroactivamente al
banco existente). Subir el mínimo de 10 a 15 palabras. Las explanations son la herramienta de
aprendizaje principal y 27 en el pool no son aceptables a largo plazo.

**P2-B**: Añadir CHK-22 para repetición temática de Lesen T1: si el blob del pasaje comparte
>3 de las frases-plantilla detectadas (`Nachbarschaft/Organisation/Programm/Gemeinschaft` +
"mich nützlich machen" + "neue Stadt"), emitir IMPORTANT.

**P2-C**: Corregir `build-disjoint-pool.mjs` BUG-4 (`gate.audit.critical` → `gate.blocking`).

**P2-D**: Aplicar CefrGate real en `promote-bank-to-curated.mjs` — actualmente usa un fake pass.

### P3 — Baja

**P3-A**: Eliminar código muerto `tryRepairT1Questions` del generador Lesen.

**P3-B**: Mover CHK-10 de advisory a bloqueante cuando la correlación es perfecta (≥2 ítems
con palabra absoluta y todos en Falsch/Nein, 0 en Richtig/Ja).

**P3-C**: Añadir estimación de duración del examen y verificarla contra estándar
Goethe B1 (65+40+85 min).

---

## 11. CONFIANZA EN PUBLICACIÓN AUTOMÁTICA SIN REVISIÓN HUMANA

**Estimación: 55–62 %**

No es posible alcanzar el 95% en el estado actual. Razones específicas:

| Factor | Pérdida estimada |
|--------|-----------------|
| Gramática y naturalidad (100% LLM-dependiente) | ~15 pp |
| Correctness semántica de respuestas (no verificada) | ~10 pp |
| Gate bypass confirmado (CHK-17/21 en curated) | ~8 pp |
| Explanations cortas/circulares en producción | ~5 pp |
| Coherencia Hören no verificada | ~5 pp |

**Para alcanzar el 95% serían necesarios como mínimo**:
1. Un corrector gramatical alemán determinista (LanguageTool headless o lista expandida de patrones)
2. Validación cruzada pasaje↔opción-correcta con evidencia textual
3. Cierre verificado del bypass GATE-1 con test de regresión
4. CHK-18 como gate bloqueante para nuevos lotes
5. Regeneración del banco histórico (40-50% de contenido antiguo necesita reescritura)

---

## 12. ARCHIVOS CLAVE REFERENCIADOS

```
scripts/audit-pass-2.mjs                    — CHK-1 a CHK-21, GATE_BLOCK_CHECKS, isExamPublishable
scripts/pipeline/lib/publishCurated.js      — gate antes de escribir a library/curated/
scripts/curated-to-served.mjs               — segunda barrera + conversión type bug (líneas 74-76)
scripts/promote-bank-to-curated.mjs         — CefrGate bypass (línea 293)
scripts/build-disjoint-pool.mjs             — BUG-4 gate.audit.critical (líneas 227-231)
scripts/generate-lesen-part-gemini.mjs      — fail-open dedup/audit (líneas ~431-466)
scripts/lib/lesenBatchQuality.mjs           — calidad pedagógica heurística
scripts/lib/normalizeBatch.mjs              — normalización + mutaciones silenciosas
scripts/lib/repairTriage.mjs                — reparación automática (NO conectado en Lesen)
js/library/ExamBlueprint.js                 — assemble() + pickFromPool() (líneas 166-307)
js/ui/exam/examGeneration.js                — assembleModuleFromPool, validación browser
js/ui/exam/examValidation.js                — validateExamCandidate
data/exams/de_B1.json                       — 40 CHK-1 CRITICAL activos en producción
library/curated/de/B1/curated_de_B1_ce5df074ba14.json  — Frankenstein que pasó el gate
library/pool-seed/de_B1.json                — pool completo
```

---

*Fin del informe. Última actualización: 1 Jul 2026.*
