# Cierre `missing_grammarTags` — Hören A2 T2 (Causa E, hueco final)

**Fecha:** 2026-07-23  
**Contexto:** último pendiente de la ronda A2 (causas A–F). Apareció en la prueba de volumen B+C (`docs/volume-a2-logs-bc/`), no en el backfill sobre pool existente.  
**Evidencia ejecutada:** tests unitarios + 3 corridas de volumen (6 intentos Gemini c/u) + logs en `docs/volume-a2-logs-bc-retest2/`.

---

## Resumen ejecutivo

| Métrica | Volumen original | Retest #1 (solo `a2Matching`) | Retest #2 (fix completo) |
|---------|------------------|-------------------------------|--------------------------|
| Hören T2 pool-verified | **2/6** | **3/6** | **5/6** |
| Rechazos `missing_grammarTags` | **2** | **1** | **0** |
| Descartes calidad pedagógica | 2 | 2 | 1 |
| Hören T3 (referencia) | 6/6 | — | — |

**Veredicto:** mismo mecanismo de **Causa E** con un hueco no cubierto por el fix inicial (`sanitizeGrammarTags` + eliminar `fillGrammarDefaults` ciego). Cerrado con umbrales A2 matching + fallback Q1 desde diálogo. **`missing_grammarTags` ya no aparece como causa de fallo** en generación real.

---

## 1. Diagnóstico — ¿mismo mecanismo E o bloqueante distinto?

### Veredicto: **mismo mecanismo E, hueco en inferencia A2 T2 matching**

No es un bloqueante nuevo del pipeline de generación. Es la consecuencia prevista de quitar `fillGrammarDefaults` cuando el texto analizable es demasiado escueto para los mínimos B1.

### Cadena causal (reproducida en código)

1. **`finalizePoolReady.mjs`** en Hören T2 A2: `forceGrammar: true`, `fillGrammarDefaults: false` (fix Causa E).
2. **`enrichBatchMetadata.mjs`** infiere `grammarTags` solo desde `questionSpecificGrammarBlob(q)` (explicación de la pregunta matching, no el diálogo completo).
3. **`poolReadyCheck.mjs`** exige ≥1 pregunta con `grammarTags.length > 0`; si no → `missing_grammarTags`.

### Por qué no aparecía en backfill

El backfill opera sobre batches ya generados cuyo diálogo y explicaciones suelen ser más ricos, o batches donde el fix E anterior + inferencia estándar ya alcanzaba el umbral. En **generación nueva**, Gemini produce con frecuencia explicaciones de **una sola frase factual** («Paul fährt am Montag…») sin señales gramaticales suficientes bajo mínimos B1.

### Casos concretos medidos

#### Batch 075 — `batches/needs-regeneration/A2/horen-t2-gemini-075.json`

Explicaciones típicas (1 señal cada una, no 2):

| Q | Explicación | Señales detectables |
|---|-------------|---------------------|
| Q1 | «Tom sagt, **dass** er am Montag das neue Kunstmuseum besucht.» | 1× nebensatz (`dass`) |
| Q4 | «Katja **muss** am Donnerstag ihren Deutschkurs besuchen.» | 1× modalverben |

Con `GRAMMAR_TAG_MIN_COUNT` estándar (`nebensatz: 2`, `modalverben: 2`, `dativ: 2`): **0/5 preguntas** obtienen tags → rechazo en volumen intento 01:

```
[poolReady] REJECT → needs-regeneration/A2/horen-t2-gemini-075.json (missing_grammarTags)
```

Batch 077 pasó el gate original solo porque Q1 tenía **dass + weil** en la misma explicación (2 señales nebensatz).

#### Batch 083 — explicaciones «desnudas»

| Q | Explicación |
|---|-------------|
| Q1 | «Paul fährt am Montag mit seinem Fahrrad in den Park.» |
| Q2 | «Nina hat am Dienstag einen Deutschkurs.» |

Cero señales incluso con mínimos relajados. El diálogo sí contiene `muss`, adjetivos declinados, etc., pero **no se analizaba** porque `questionSpecificGrammarBlob` excluye el passage. Resultado retest #1:

```
Calidad Hören T2: OK ✅ (estimación ~100%)
[poolReady] REJECT → needs-regeneration/A2/horen-t2-gemini-083.json (missing_grammarTags)
```

### Conclusión diagnóstica

| Pregunta | Respuesta |
|----------|-----------|
| ¿Mismo mecanismo que Causa E? | **Sí** — eliminación de defaults ciegos + inferencia insuficiente |
| ¿Bloqueante distinto? | **No** |
| ¿Por qué solo en generación real? | Explicaciones matching A2 más cortas que el corpus backfill |
| ¿Relacionado con calidad pedagógica? | **No** — causas independientes (sección 4) |

---

## 2. Fix aplicado

**Archivo principal:** `scripts/lib/enrichBatchMetadata.mjs`

### 2a. Umbrales relajados para matching A2

```javascript
export const GRAMMAR_TAG_MIN_COUNT_A2_MATCHING = {
  'g-de-b1-nebensatz': 1,
  'g-de-b1-relativ': 1,
  'g-de-b1-modalverben': 1,
  'g-de-b1-dativ': 1,
  'g-de-b1-adjektivdeklination': 2,
};
```

Activados vía `isA2MatchingQuestion()` (type `matching`, `_keyOnlyMatch`, o respuesta a–i sin options) y `grammarMinCount(..., { a2Matching: true })` en el loop de enriquecimiento.

**Efecto en 075:** ≥2/5 preguntas reciben tags (Q1 nebensatz, Q4 modalverben) → pasa gate sin clonar.

### 2b. Fallback retrieval mínimo (caso 083)

```javascript
export function ensureBatchGrammarRetrievalMinimum(batch) {
  // Solo si: A2, todas matching, 0/5 con grammarTags
  // → inferir desde passageGrammarBlob(passage) con a2Matching
  // → asignar a Q1 únicamente, stamp _grammarRetrievalFallback: 'a2-t2-passage-q1'
}
```

**Principio Cause E preservado:** no clona tags a las 5 preguntas (comportamiento del antiguo `fillGrammarDefaults`). Solo desbloquea el gate de retrieval cuando ninguna explicación tiene señales.

### Tests de regresión

**Archivo:** `scripts/lib/__tests__/horen-t2-a2-grammar.test.mjs`

```bash
node scripts/lib/__tests__/horen-t2-a2-grammar.test.mjs
# ── Result: 13 passed, 0 failed ──
```

| Caso | Antes fix | Después fix |
|------|-----------|-------------|
| 075 — inferencia estándar | 0/5 con tags | ≥2/5 con tags (`a2Matching`) |
| 075 — enrichBatchMetadata | REJECT | ≥1 Q con tags válidos `g-de-b1-*` |
| 083 — explicaciones desnudas | REJECT | Q1 con `modalverben` desde diálogo; solo 1 Q taggeada |

---

## 3. Prueba de volumen repetida (Hören T2, 6 intentos Gemini)

**Script:** `scripts/_volume-a2-horen-bc.mjs`  
**Comando retest final:**

```bash
VOLUME_CELLS=horen-t2 VOLUME_ATTEMPTS=6 VOLUME_LOG_DIR=volume-a2-logs-bc-retest2 node scripts/_volume-a2-horen-bc.mjs
```

**Reporte:** `docs/volume-a2-logs-bc-retest2/volume-bc-report.json`  
**Ventana:** 2026-07-23T09:25:46 → 09:30:12 UTC (~4,5 min)

### Resultados por intento

| # | Archivo | Estado | `missing_grammarTags` |
|---|---------|--------|------------------------|
| 1 | `horen-t2-gemini-084.json` | pool-verified | — |
| 2 | `horen-t2-gemini-085.json` | pool-verified | — |
| 3 | — | **discarded** (calidad) | — |
| 4 | `horen-t2-gemini-086.json` | pool-verified | — |
| 5 | `horen-t2-gemini-087.json` | pool-verified | — |
| 6 | `horen-t2-gemini-088.json` | pool-verified | — |

### Métricas agregadas retest #2

| Métrica | Valor |
|---------|-------|
| **Tasa pool-verified** | **5/6 (83%)** |
| **`poolRejectMissingGrammar`** | **0** |
| Elencos distintos | 5 (`Jonas+Emma`, `Omar+Yasmin`, `Niklas+Laura`, `Tobias+Clara`, `David+Julia`) |
| Planes de claves distintos | 4/5 pares verificados |
| Comparación T3 | 6/6 (sin cambios) |

### Evolución completa de la tasa T2

```
Original (pre-fix grammar gap):  2/6  │ 2× missing_grammarTags
Retest #1 (a2Matching only):     3/6  │ 1× missing_grammarTags (083)
Retest #2 (fix completo):        5/6  │ 0× missing_grammarTags  ← CERRADO
```

**Objetivo cumplido:** `missing_grammarTags` eliminado como causa de fallo. Tasa subió de 2/6 → 5/6; el único fallo restante es calidad pedagógica (1/6), no metadata.

---

## 4. Fallos de calidad pedagógica — diagnóstico separado

**Causa distinta.** No comparte mecanismo con grammarTags. Aparece **antes** del gate pool (`Comprobando calidad pedagógica…`), bloqueando en generación con `exitCode: 1` → status `discarded`.

### Checker y umbral exacto

| Campo | Valor |
|-------|-------|
| Módulo | `scripts/lib/horenBatchQuality.mjs` → `checkHorenTeil2PictureMatching()` |
| Validador alineación | `js/engine/horenPictureMatching.js` → `validatePictureMatchingAlign()` |
| Condición PASS | `issues.length === 0` |
| Score estimado | `100 - (issues × 8) - (warnings × 2)` — informativo; **el bloqueo es binario por issues** |
| Reintentos | `fix-retries=3` con temperatura 0.3; tras 4 llamadas sin PASS → DESCARTADO |

### Reglas que dispararon fallos (volumen medido)

| Regla | Mensaje exacto | Función |
|-------|----------------|---------|
| R1 | `{Name} no menciona actividad el {Wochentag} en el diálogo` | `findSpeakerDayTurn()` → null |
| R2 | `actividad de {Name} el {Wochentag} no mapea a ficha a–i («…»)` | `inferActivityKey()` → null |
| R3 | `clave «X» no coincide con diálogo (esperada «Y»: …)` | `extractCorrectKey(q) !== inferred` |

### Instancias concretas

**Volumen original — intento 03** (`horen-t2-gemini-077`, descartado):

```
Calidad Hören T2: FAIL (3 problemas, estimación ~76%)
  - gen-q-h2-da1cc022-q3: Simon no menciona actividad el Mittwoch en el diálogo
  - gen-q-h2-da1cc022-q4: clave «h» no coincide con diálogo (esperada «f»: …)
  - gen-q-h2-da1cc022-q5: clave «g» no coincide con diálogo (esperada «c»: …)
```

**Retest #2 — intento 03** (`horen-t2-gemini-086`, descartado):

```
Calidad Hören T2: FAIL (2 problemas, estimación ~84%)
  - gen-q-h2-8f41913b-q3: clave «c» no coincide con diálogo (esperada «b»: …)
  - gen-q-h2-8f41913b-q5: actividad de Tim el Freitag no mapea a ficha a–i (…)
```

### Origen probable (no Causa E)

Gemini incumple el **plan semanal de actividades** (`horenT2ActivityScheduleBank`) al redactar el diálogo: el enunciado pide «Was macht {Name} am Mittwoch?» pero el turno del hablante ese día no contiene la actividad/clave mandada, o la clave en `correctAnswer` no coincide con lo inferido del texto.

**Relación con Causa B:** el banco de schedules rota claves, pero la validación de alineación depende de que Gemini ejecute el plan en el diálogo. Los 1–2 descartes por volumen son **fallos de cumplimiento generativo**, no de metadata post-proceso.

**Estado:** fuera del alcance de este cierre. No bloquea declarar Causa E cerrada ni la ronda A–F de metadata/pool.

---

## 5. Cierre de la ronda A2 (causas A–F)

| Causa | Tema | Estado |
|-------|------|--------|
| A | Coherencia vocab Lesen T1 | ✅ cerrada |
| B | Convergencia actividades Hören T2 | ✅ cerrada (forward); descartes calidad = cumplimiento Gemini |
| C | Rotación elencos T2/T3 | ✅ cerrada (6/6 smoke) |
| D | Vocab blob retrieval | ✅ cerrada |
| E | Grammar tags (sanitize + inferencia) | ✅ **cerrada** — incluye hueco A2 T2 matching |
| F | Lemmas rotos | ✅ cerrada |

**Evidencia final Cause E:** test 13/13 + volumen retest #2 con `poolRejectMissingGrammar: 0` y 5/6 pool-verified.

---

## Comandos de verificación reproducible

```bash
# Regresión grammar A2 T2
node scripts/lib/__tests__/horen-t2-a2-grammar.test.mjs

# Volumen Hören T2 (6 intentos)
VOLUME_CELLS=horen-t2 VOLUME_ATTEMPTS=6 VOLUME_LOG_DIR=volume-a2-logs-bc-retest2 node scripts/_volume-a2-horen-bc.mjs

# Re-enriquecer batch 083 en needs-regeneration (opcional, ahora pasa gate)
node -e "import { enrichBatchMetadata } from './scripts/lib/enrichBatchMetadata.mjs'; import fs from 'fs'; const p='batches/needs-regeneration/A2/horen-t2-gemini-083.json'; const b=JSON.parse(fs.readFileSync(p)); const {batch}=enrichBatchMetadata(b,{forceGrammar:true,fillGrammarDefaults:false}); fs.writeFileSync(p,JSON.stringify(batch,null,2)); console.log(batch.questions[0].grammarTags, batch._grammarRetrievalFallback);"
```
