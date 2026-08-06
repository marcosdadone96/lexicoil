# Q2 — Recalibración CHK-18b (2026-07-09)

## Cambio implementado: opción (b)

**Archivo:** `scripts/lib/qualityGates/answerKeyCoherenceGate.mjs`

### Lógica anterior (CHK-18b auto-block)

En `keyExplanationGate.mjs` (`analyzeExplanationMismatch`):

1. Para cada MCQ T2/T5, calcula `overlapCorrect` = tokens (≥5 letras) compartidos entre `explanation` y cuerpo de opción correcta.
2. Busca la opción incorrecta con mayor `overlapWrong`.
3. Dispara si `overlapWrong >= 2` **y** `overlapWrong > overlapCorrect`.
4. En `answerKeyCoherenceGate.mjs`, el hit iba a `findingFromChk18b()` → `severity: block`, `confidence: high`, `source: CHK-18b` **sin LLM**.

### Lógica nueva

1. CHK-18b sigue detectando overlap sospechoso (mismo umbral).
2. El ítem **no** genera finding directo; se añade a `llmItems` con `chk18bHint` + `passageText` (truncado 1500 chars).
3. El LLM adjudica con el mismo prompt que T3/Lena (semántico).
4. Solo `findingFromLlmRow` puede producir `confidence=high` block.
5. Añadida regla P2 en prompt: no aritmética propia en tarifas/cálculos.

**Tests:** 19/19 mock (+ caso CHK-18b escalado → LLM justified → pass).

---

## Dry-run comparativo

| Métrica | Pre-fix (auto-block) | Post-fix parcial (262 arch.) | **Post-fix 519/519** |
|---------|-------------------:|-------------------------:|---------------------:|
| **high mismatches** | **59** | 10 | **20** |
| Fuente high | LLM: 7, CHK-18b: 52 | LLM: 10 | LLM: 19, CHK-18b+LLM: 1 |
| Cobertura LLM | 518/519 | 262/519 (245 créditos) | **519/519 (100%)** |
| Parse errors | ~1 | 12 reales + 245 créditos | **0** (t4-038 re-test 2026-07-10) |
| Credit errors | 0 | 245 | **0** |
| LLM calls | 518 | 262 | **973** (chunking ×5) |

**Corrección diagnóstico:** los «257 parse errors» eran **245 créditos API agotados** + **12 parse reales** (comillas en `motivo`). Ver `Q2-PARSE-DIAGNOSIS.md`.

---

## Muestra humana — corpus completo (20 highs)

| # | Archivo | Veredicto | Notas |
|---|---------|-----------|-------|
| 1–9 | T3 Lena/Ben legacy | **REAL** | Blueprint bug; `Q2-LENA-CLUSTER-DISCARD.json` |
| 10 | `t1-gemini-168` | **REAL** | «ausschließlich» no sostenido |
| 11 | `t1-gemini-124` | **REAL** | «immer» vs solo cuando tiene preguntas |
| 12 | `t1-gemini-131` | **REAL** | «ausschließlich entspannen» falso |
| 13 | `t1-gemini-153` | **REAL** | «Alle Freunde» no sostenido |
| 14 | `t2-gemini-084` | **REAL** | `correct=c` pero explanation → motivación = **b** |
| 15 | `t2-gemini-098` | **FP** | Dos objetivos en explanation; c válida |
| 16 | `t5-gemini-021` | **FP** | a = 0,30€/kWh + 4h (sin reserva en texto) |
| 17 | `t5-gemini-060` | **FP** | b coincide con explanation |
| 18 | `t5-gemini-032` | **FP** | a coincide (químicos prohibidos + Tauschbörsen) |
| 19–20 | `ozxalp`, `rb0eeo` (Sara/Schlauch) | **FP** | Explanation nombra RadFit; LLM prioriza pregunta |

**Ratio 20 casos:** REAL **~14 (70%)** · FP **~6 (30%)**

**13 casos nuevos** (vs dry-run parcial): mayoría T3 legacy + T1 «alle/immer» REAL; T5/T2 mayormente FP.

**Casos que desaparecieron** (bien calibrado): `t5-gemini-041` (parking), `t1-gemini-117`, `t3-exy06p`.

---

## FP conocidos de Q2 (sin acción en futuras corridas)

Al revisar highs en dry-runs o logs Q2, **ignorar** los siguientes casos ya diagnosticados como falsos positivos del LLM (declared key coherente con explanation; el modelo prioriza semántica de pregunta/passage o paráfrasis):

| Archivo / patrón | Teil | Patrón Q2 | Motivo del FP | Acción |
|------------------|------|-----------|---------------|--------|
| **`t5-gemini-021`** | T5 | Paráfrasis / cálculo | `correct=a` (0,30€/kWh + 4h) coincide con explanation; LLM infiere `c` por «Reservierung» no mencionada en texto | Ignorar high; no corregir clave |
| **`t5-gemini-060`** | T5 | Paráfrasis passage | `correct=b` (WLAN gratis + 60 min, sin comida) coincide con explanation; LLM mezcla detalles del passage | Ignorar high |
| **`t5-gemini-032`** | T5 | Paráfrasis passage | `correct=a` (químicos prohibidos + Tauschbörsen) coincide con explanation; LLM dice que Tauschbörsen no están en passage | Ignorar high |
| **`t2-gemini-098`** | T2 | Objetivo ambiguo | Explanation cita **dos** objetivos («Zusammenleben» + «Vielfalt»); `correct=c` (Vielfalt) es válida aunque LLM prefiera `b` | Ignorar high |
| **`t3-ozxalp`** | T3 | Sara / RadFit vs ReifenDoc | Explanation nombra **RadFit**; declared `F`=RadFit coherente; LLM prioriza «platten Schlauch» → ReifenDoc | Ignorar high |
| **`t3-rb0eeo`** | T3 | Sara / RadFit vs ReifenDoc | Mismo patrón que `ozxalp` (shuffle distinto, misma pregunta) | Ignorar high |
| **`t3-yzcwhp`** | T3 | Ben / SchnittKurs vs NähKurs | `correct=a` (SchnittKurs) + explanation «SchnittKurs lehrt Schneidern» coherentes; LLM infiere NähKurs por «Hosen anfertigen» | Ignorar high |

**Regla:** si en futuras corridas reaparecen estos archivos o el mismo patrón (T5 paráfrasis passage, T2 explanation multi-objetivo, T3 matching donde explanation nombra el servicio declarado), **añadirlos a esta tabla** — mismo criterio que la tabla «Findings conocidos G2» (`online` en [`INDEX.md`](../INDEX.md)).

---

## Corrección de contenido — candidato aislado (no discard Lena)

| Archivo | Ítem | Problema | Acción propuesta |
|---------|------|----------|------------------|
| **`lesen-t2-gemini-084.json`** | `gen-q-2-2b7cec20-3` (`questions[2]`) | `correct=c` («garantiert Arbeitsplatz») pero explanation justifica **b** («motivierender»). Detectado por CHK-18b+LLM. **REAL mismatch** — error de clave aislado en T2 normal, no bug de blueprint. | Corregir `correct` de **c → b** en el JSON del batch (corrección directa de contenido, separada de `Q2-LENA-CLUSTER-DISCARD.json`). |

---

## Cobertura formal 519/519

| Archivo pendiente | Estado |
|-------------------|--------|
| `lesen-t4-gemini-038.json` | Parse falló en 1 intento del dry-run masivo (batch 7 ítems). Re-test: **7/7 ítems parse OK** con respuesta cruda almacenada → [`Q2-T4-038-RETEST.json`](Q2-T4-038-RETEST.json), raw en [`q2-parse-diagnostics/lesen-t4-gemini-038-raw.json`](q2-parse-diagnostics/lesen-t4-gemini-038-raw.json). **0 high mismatches.** |

**Corpus Q2 dry-run:** **519/519 archivos adjudicados** (518 en corrida masiva + 1 re-test formal).

---

## Recomendación final

| Criterio | Estado |
|----------|--------|
| Corpus 100% evaluado | ✅ 519/519 (100%) |
| Parse robusto | ✅ 0 pendientes (t4-038 re-test formal) |
| Ruido CHK-18b | ✅ 0 auto-high |
| Precisión highs | ✅ ~70% REAL |

**Q2 listo para modo audit** (log + revisión humana de ~20 highs, excluyendo discard Lena).

**Block automático:** aún no — excluir discard list Lena; ignorar 7 FP conocidos (tabla arriba); corregir `t2-gemini-084` cuando se toque ese batch.
