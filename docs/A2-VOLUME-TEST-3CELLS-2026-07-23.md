# A2 — Prueba de volumen (n=6) · 3 celdas demostradas

**Fecha:** 2026-07-23  
**Objetivo:** Confirmar fiabilidad del pipeline más allá de n=1 (mismo comando que prueba de fuego, 6 intentos/celda).  
**Orquestador:** `scripts/_volume-a2-3cells.mjs`  
**Logs completos:** `docs/volume-a2-logs/` (18 archivos `*-attempt-NN.log` + `summary.json` + `_orchestrator.log`)

---

## Comandos (idénticos a prueba de fuego)

| Celda | Comando |
|-------|---------|
| **Lesen T1** | `node scripts/generate-lesen-part-gemini.mjs --teil 1 --level A2 --from-bank --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed` |
| **Hören T2** | `node scripts/generate-part-gemini.mjs --module horen --teil 2 --level A2 --from-bank --topic Freizeit --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed` |
| **Hören T3** | `node scripts/generate-part-gemini.mjs --module horen --teil 3 --level A2 --from-bank --topic Freizeit --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed` |

---

## 1. Tasa real de éxito (pool-verified, sin intervención manual)

Criterio de éxito: log contiene `[poolReady] READY → pool-verified/A2/<archivo>.json` y el archivo existe en `batches/ready/pool-verified/A2/`.

| Celda | Éxitos | Intentos | Tasa | API calls (total 6) | Coste approx. |
|-------|--------|----------|------|---------------------|---------------|
| **Lesen T1** | **2** | 6 | **33%** | 36 | ~$0.22 |
| **Hören T2** | **6** | 6 | **100%** | 9 | ~$0.09 |
| **Hören T3** | **5** | 6 | **83%** | 21 | ~$0.15 |
| **Global** | **13** | 18 | **72%** | 66 | ~$0.46 |

### Detalle por intento

#### Lesen T1

| # | Log | Resultado | API | Artefacto / causa final |
|---|-----|-----------|-----|-------------------------|
| 1 | `lesen-t1-attempt-01.log` | **DESCARTADO** | 6 | Calidad OK tras retries → `content_topic_mismatch` ×3 (tema Gesundheit) |
| 2 | `lesen-t1-attempt-02.log` | **pool-verified** | 5 | `lesen-t1-gemini-199.json` (MCQ length bias + 1× missing_grammarTags en retry intermedio) |
| 3 | `lesen-t1-attempt-03.log` | **DESCARTADO** | 8 | Fix retries → **`options_missing` ×6** (blueprint FAIL) |
| 4 | `lesen-t1-attempt-04.log` | **DESCARTADO** | 8 | Mismo patrón **`options_missing` ×6** |
| 5 | `lesen-t1-attempt-05.log` | **pool-verified** | 1 | `lesen-t1-gemini-200.json` (1ª llamada, limpio) |
| 6 | `lesen-t1-attempt-06.log` | **DESCARTADO** | 8 | **`options_missing` ×6** tras varios retries de calidad |

#### Hören T2

| # | Log | Resultado | API | Artefacto |
|---|-----|-----------|-----|-----------|
| 1 | `horen-t2-attempt-01.log` | **pool-verified** | 1 | `horen-t2-gemini-069.json` |
| 2 | `horen-t2-attempt-02.log` | **pool-verified** | 1 | `horen-t2-gemini-070.json` |
| 3 | `horen-t2-attempt-03.log` | **pool-verified** | 1 | `horen-t2-gemini-071.json` |
| 4 | `horen-t2-attempt-04.log` | **pool-verified** | 2 | `horen-t2-gemini-072.json` (1 retry alineación clave) |
| 5 | `horen-t2-attempt-05.log` | **pool-verified** | 3 | `horen-t2-gemini-073.json` (2 retries alineación) |
| 6 | `horen-t2-attempt-06.log` | **pool-verified** | 1 | `horen-t2-gemini-074.json` |

#### Hören T3

| # | Log | Resultado | API | Artefacto / causa |
|---|-----|-----------|-----|-------------------|
| 1 | `horen-t3-attempt-01.log` | **pool-verified** | 2 | `horen-t3-gemini-040.json` |
| 2 | `horen-t3-attempt-02.log` | **pool-verified** | 2 | `horen-t3-gemini-041.json` |
| 3 | `horen-t3-attempt-03.log` | **pool-verified** | 2 | `horen-t3-gemini-042.json` |
| 4 | `horen-t3-attempt-04.log` | **DESCARTADO** | 10 | MCQ length bias loop; agotó fix-retries sin pool-verified |
| 5 | `horen-t3-attempt-05.log` | **pool-verified** | 3 | `horen-t3-gemini-043.json` |
| 6 | `horen-t3-attempt-06.log` | **pool-verified** | 2 | `horen-t3-gemini-044.json` |

---

## 2. Fallos NUEVOS no vistos en n=1

### Lesen T1 — **`options_missing` en cadena de fix-retry** (NUEVO, volumen)

- **No apareció** en la prueba de fuego n=1 (`lesen-t1-gemini-197`).
- **Sí apareció** en intentos 3, 4 y 6 (3/6 = 50% de intentos Lesen).
- Evidencia literal (`lesen-t1-attempt-03.log`):

```
Conformidad blueprint: FAIL (6 ítems)
  - gen-q-1-d7701203-1: options_missing
  … (×6)
```

- **Hipótesis (sin fix aplicado):** tras varios ciclos MCQ length-bias + fix-retry LLM, Gemini devuelve JSON con preguntas `multiple_choice` sin `options[]` — mismo síntoma que el bug original de Lesen T1, pero **activado por volumen/reintentos**, no en generación limpia.
- **Alcance:** parece **específico de Lesen T1** en esta muestra (no visto en Hören T2/T3).

### Lesen T1 — `content_topic_mismatch` sin retag automático (NUEVO vs Hören T2)

- Intento 1: pasó calidad pero falló poolReady 3× con `content_topic_mismatch` (tema rotado **Gesundheit** vs contenido).
- Lesen **no tiene** el retag de `enrichBatchMetadata` que sí tiene Hören T2 → agota fix-retries en metadata y descarta.
- **Transversal potencial:** cualquier celda Lesen con rotación de tema puede repetir esto.

### Hören T3 — agotamiento de retries por MCQ length bias (amplificado en volumen)

- n=1: resolvió con triaje + 2–5 API calls.
- Intento 4 volumen: **10 API calls**, length-bias parcial persistente en q2/q3, **DESCARTADO**.
- **No es bug nuevo de formato**, pero la **varianza de coste/latencia** es mayor de lo que n=1 sugería.

### Hören T2 — retries de alineación clave (esperado, no regresión)

- Intentos 4–5: 1–2 retries calidad (`clave «X» no coincide`) antes de pool-verified.
- Resuelto por plantilla + fixNote; **no bloquea** el pipeline.

### No observado en volumen

- Circuit breaker vocab/moldes (Lesen T1 n=1 histórico).
- `type_not_allowed:richtig_falsch` (Lesen T1 post-fix).
- Enunciado `"Montag"` sin hablante (Hören T2 post-fix plantilla).

---

## 3. Verificación Hören T2 — mecanismos nuevos

Análisis ejecutado: `node scripts/_analyze-horen-t2-volume.mjs`  
Batch auditados: `horen-t2-gemini-068` (n=1) + `069`–`074` (volumen).

### 3A. Retag automático (`enrichBatchMetadata`)

| Archivo | Pedido | Final topicTag | Retag | contentTopic(Freizeit) | Notas |
|---------|--------|----------------|-------|------------------------|-------|
| 069 | Freizeit | Freizeit | **No** | OK (detectado Familie, no mismatch) | Deporte mencionado de pasada, **no** re-etiquetado |
| 070 | Freizeit | Freizeit | **No** | OK (detectado Kultur) | |
| 071 | Freizeit | Freizeit | **No** | OK (detectado Kultur) | |
| 072 | Freizeit | **Ernährung** | **Sí** | FAIL→retag | Diálogo centrado en kochen/Rezept/Suppe — retag **legítimo** |
| 073 | Freizeit | Freizeit | **No** | OK (detectado Kultur) | |
| 074 | Freizeit | Freizeit | **No** | OK (detectado Kultur) | |
| 068 (n=1) | Freizeit | **Sport** | **Sí** | FAIL→retag | Texto incluye «Freizeitaktivität» + Fitnessstudio; retag a Sport es **borderline** |

**Veredicto retag:**

- **Tasa retag en volumen (069–074):** 1/6 (17%) — **no agresivo**.
- **No vacía** el stock Freizeit pedido: 5/6 partes siguen etiquetadas Freizeit en pool-verified pese a `--topic Freizeit`.
- **Caso borderline (068):** parte claramente de ocio con mención Sport/Fitness → retag a Sport podría desviar ensamblado si se pide celda Freizeit estricta. **Deuda:** criterio de retag (solo cuando `content_topic_mismatch` bloqueante, no cuando Freizeit score > 0).
- **Caso legítimo (072):** semana con cocina/Rezept → Ernährung correcto.

### 3B. `fillGrammarDefaults` (Hören T2)

| Métrica | Resultado |
|---------|-----------|
| `inferGrammarTagsFromText` natural (sin fill) | **0/5 preguntas** en todos los batches T2 |
| Tags almacenados tras poolReady | **100%** idénticos: `g-de-b1-perfekt` + `g-de-b1-nebensatz` en las 5 preguntas |
| Coherencia con contenido | **No verificada** — es `DEFAULT_GRAMMAR_BY_TEIL[2]` mecánico |

**Veredicto fillGrammarDefaults:**

- Funciona como **tapón de gate poolReady** (`missing_grammarTags`), no como señal pedagógica.
- **Mismo riesgo** que el `daily_fallback` muerto de vocab-bg: pasa metadata pero **no mide gramática real** del ítem matching.
- **No bloquea** generación ni calidad; **sí es deuda** antes de usar grammarTags para personalización/búsqueda.
- **Acción recomendada (futuro, no aplicada):** reglas A2/Hören matching específicas (Modalverb en «muss einkaufen», Perfekt en explicaciones, etc.) o relajar gate a «≥1 pregunta con tag inferido O passage-level tag».

---

## Veredicto global

| Celda | ¿Pipeline confirmado en volumen? | Comentario |
|-------|----------------------------------|------------|
| **Hören T2** | **Sí** (100%) | Fiabilidad alta; retag no agresivo; grammarTags = deuda metadata |
| **Hören T3** | **Casi** (83%) | Estable; 1/6 agotó retries length-bias; coste variable |
| **Lesen T1** | **No** (33%) | **Bloqueante nuevo:** `options_missing` en fix-retry (50% intentos) + topic mismatch sin retag |

### Decisión recomendada

1. **Escalar volumen real** para **Hören T2 + Hören T3** (con monitor de coste API y deuda grammarTags documentada).
2. **No escalar Lesen T1** hasta diagnóstico del patrón `options_missing` en cadena fix-retry (misma familia que n=1, capa retry — **diagnóstico antes de fix**, no copiar fix ciego).
3. **Cerrar celdas nuevas en paralelo** (Lesen T2–T4, Hören T1/T4, Schreiben, Sprechen) — el cuello de botella ya no es Hören sino **Lesen T1 bajo estrés de reintentos**.

---

## Artefactos pool-verified generados en volumen

```
batches/ready/pool-verified/A2/
  lesen-t1-gemini-199.json
  lesen-t1-gemini-200.json
  horen-t2-gemini-069.json … 074.json
  horen-t3-gemini-040.json … 044.json  (excepto 043 descartado en intento 4; 043 OK en intento 5)
```

---

*Evidencia: 18 logs en `docs/volume-a2-logs/`, orchestrator ~21 min wall time (2026-07-23T08:05–08:26 UTC).*
