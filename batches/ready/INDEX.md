# batches/ready — índice de documentación vigente

**Última actualización:** 2026-07-10 (regla gates vs. backlog antiguo + Schreiben hygiene)

---

## Auditoría pipeline 2026-07-09

| Hallazgo | Estado | Documentación |
|----------|--------|---------------|
| T3 idiomas en minúscula (`fixT3OptionCaps`) | **Cerrado** | [`BACKLOG.md`](BACKLOG.md) AUD-1 |
| `im Freien` / `ein paar` caps | **Cerrado** | `germanCapsNormalize` v3.2-stable |
| Markdown `**` en pasajes T5 | **Cerrado** | prompt + `stripMarkdownLeak.mjs` (AUD-4 + AUD-4b viñetas `*`) |
| Pool nombres T4 | **Propuesta** | [`BACKLOG.md`](BACKLOG.md) AUD-5 |
| G2 caps (detección automática post-generación) | **Activo** | `gate-logs/g2-findings-log.jsonl` — ver sección G2 abajo |

---

## ⏳ Pendiente de revisión

| Fecha | Qué | Acción |
|-------|-----|--------|
| **2026-07-23** | Q1 shadow → ¿block real? | Ejecutar `node scripts/summarize-shadow-q1.mjs` y seguir checklist en [`PENDING-REVIEWS.md`](PENDING-REVIEWS.md) |
| **Semanal / cada ~25 generados** | Log G2 acumulado | Revisar [`gate-logs/g2-findings-log.jsonl`](gate-logs/g2-findings-log.jsonl): confirmar errores reales → guards en `capitalizeNouns.mjs` → regression 233 |

**Backlog (no tocar hasta cerrar revisión Q1):** [`BACKLOG.md`](BACKLOG.md)

**Regla operativa:** contenido generado **antes** de un fix de gate no hereda el fix → ver [`BACKLOG.md`](BACKLOG.md) § «Regla general — gates vs. contenido ya generado».

---

Documentos activos por área. Los informes de iteración antigua sin entrada aquí son históricos.

---

## Caps / normalizador (`germanCapsNormalize`)

| Documento | Qué es | Estado |
|---|---|---|
| [`PHASE-ACCEPTANCE-PROTOCOL.md`](PHASE-ACCEPTANCE-PROTOCOL.md) | Criterios de aceptación fases M1–M4 | **Vigente** |
| [`ARCH-STABILIZATION-M1-M4-DESIGN.md`](ARCH-STABILIZATION-M1-M4-DESIGN.md) | Diseño mecanismos M1–M4 (caps) | Propuesta |
| [`PHASE1-G2-6-NEW-FINDINGS-ANALYSIS.md`](PHASE1-G2-6-NEW-FINDINGS-ANALYSIS.md) | Evidencia 6 regresiones post-Phase 1 | Referencia |
| [`PHASE1-RESULTS.md`](PHASE1-RESULTS.md) | Resultados Phase 1 dry-runs | Referencia |
| [`DECAP-CAP-INTERACTION-DESIGN.md`](DECAP-CAP-INTERACTION-DESIGN.md) | Diseño interacción decap↔cap | Referencia |
| [`ADJ-GUARD-RISK-ANALYSIS.md`](ADJ-GUARD-RISK-ANALYSIS.md) | Riesgo ampliar guard manualmente | Referencia |
| `scripts/lib/GERMAN-CAPS-NORMALIZE.md` | Implementación v3.2-stable | **Vigente** |

**Baseline caps:** `v3.2-stable` · holdout regression [`V32-HOLDOUT-REGRESSION.md`](V32-HOLDOUT-REGRESSION.md) · dry-runs `PHASE1-G2-DRYRUN.json`

### G2 Inspector (detección, no reparación)

| Qué | Dónde | Modo |
|-----|-------|------|
| Gate congelado | `scripts/pos-caps-check.py` (v6.1-B-G2) | **no modificar** |
| Log persistente | [`gate-logs/g2-findings-log.jsonl`](gate-logs/g2-findings-log.jsonl) | append por batch generado |
| Hook | `scripts/lib/g2FindingsLog.mjs` → `checkLesenBatchQuality` | **warn** (no bloquea) |
| Generación | `generate-lesen-part-gemini.mjs`, `make-t3.mjs` | automático tras cada pieza válida |

**Flujo estándar:** generar → G2 log → humano revisa log → confirma error → lista en `capitalizeNouns.mjs` → tests + regression 233 → cierre de wave. **No** hay repair automático (spike ROI descartado).

**Última wave cerrada:** G2-mini-ronda (2026-07-09) — informe [`gate-logs/G2-INSPECTOR-WAVE2A.md`](gate-logs/G2-INSPECTOR-WAVE2A.md)

#### Findings conocidos en el log G2 (sin acción requerida)

Al revisar [`gate-logs/g2-findings-log.jsonl`](gate-logs/g2-findings-log.jsonl) semanalmente, **ignorar** los siguientes patrones ya diagnosticados (normalizador correcto, G2 sigue marcando):

| Palabra / patrón | Guard normalizador | reason G2 típico | Notas |
|------------------|-------------------|------------------|-------|
| **`online`** | `PURE_ADVERBS` en `capitalizeNouns.mjs` | `lexicon_nn` | Finding **conocido y esperado**. El normalizador ya deja `online` en minúscula correctamente; G2 no lee las listas de `capitalizeNouns.mjs` y spaCy lo etiqueta `NN` en contexto adverbial («können online gebucht werden»). **NO requiere acción** cada vez que aparezca en el log. |

**Regla:** si en el futuro aparecen más casos de este tipo (texto de salida correcto tras normalize, G2 sigue marcando), **añadirlos a esta tabla** para no reinvestigar lo mismo en cada revisión.

---

## Calidad no-caps (gates nuevos)

| Documento | Qué es | Estado |
|---|---|---|
| [`QUALITY-GATES-DESIGN.md`](QUALITY-GATES-DESIGN.md) | Diseño gates duplicados / clave / coherencia / metadatos | **Propuesta** |
| [`Q-DRYRUN-WAVE1.md`](Q-DRYRUN-WAVE1.md) | Dry-run oleada 1 (Q4, Q1a, Q3-A) — 208 archivos | **dry-run** (pre-fix) |
| [`Q-DRYRUN-WAVE1b.md`](Q-DRYRUN-WAVE1b.md) | Diagnóstico + recalibración Q1/Q4 (mirror + schema) | **dry-run** (post-fix) |
| [`Q-WAVE1c-INTEGRATION.md`](Q-WAVE1c-INTEGRATION.md) | Desglose Q1 por Teil + integración audit/shadow | **vigente** |
| [`PENDING-REVIEWS.md`](PENDING-REVIEWS.md) | Checkpoints programados (Q1 shadow 2026-07-23) | **activo** |
| [`BACKLOG.md`](BACKLOG.md) | Wave 2 + caps pendientes | **vigente** |

### Gates implementados — modos de observación (desde 2026-07-09)

| Gate | Módulo | Modo | Block real | Estado |
|------|--------|------|------------|--------|
| **Q3-A** passageCoherence | `passageCoherenceGate.mjs` | **audit** | No — solo log | producción observación |

**Q3-A `markdown_leak` + `stripMarkdownLeak` (v3.2-stable):** desde 2026-07-09, `stripMarkdownLeak.mjs` corre como **paso 0** de `germanCapsNormalize` y quita `**…**` (AUD-4) y viñetas `*   ` / `- ` al inicio de línea (AUD-4b) de `passages.text/title/transcript` **antes** de que el batch llegue a Q3-A. Por tanto, **0 findings `markdown_leak` en audit logs de producción es esperado y bueno** — no significa que el gate dejó de funcionar. Para verificar que la red de seguridad sigue activa, mirar `stats.markdownFixed` en el log de normalización o ejecutar `stripMarkdownLeak` en tests. Los demás checks de Q3-A (`sentence_case_after_header`, etc.) siguen aplicando.

| **Q4** metadataSchema | `metadataSchemaGate.mjs` | **audit** + parcial | Solo `topic_mismatch` | producción observación |

#### Findings conocidos — content topic / Q4 (sin acción requerida)

| Caso | Tag | Detector | Notas |
|------|-----|----------|-------|
| **e1 L2 p1** `gen-l2-f5dd2b2c-1` | `Gesundheit` | `Freizeit` gana (Spaziergang/Park/Ausflüge) o `tag_unsupported` si el escáner lee `part.text` vacío | Título «Bewegung für ein gesundes Leben»; texto sobre Herz, Immunsystem, krank, Ärzte. Tag **correcto**. Baja señal léxica de Gesundheit vs keywords Freizeit/Sport. **NO retaguear.** Detalle: [`gate-logs/E1-L2-TOPIC-VERDICT-2026-07-10.md`](gate-logs/E1-L2-TOPIC-VERDICT-2026-07-10.md) |

**Nota escáner servido:** `scan-bank-current-gates.mjs` usa `part.text`, pero e1 Lesen T2 sirve el cuerpo en `part.passages[].text` → finding `tag_unsupported` con `hits={}` fue artefacto; con el texto real el detector marca mismatch Freizeit vs Gesundheit (sigue siendo FP pedagógico).

| **Q1a** duplicateContent | `duplicateContentGate.mjs` | **shadow** | No — `wouldReject` en log | observación 1–2 sem |
| **Q2** answerKeyCoherence | `answerKeyCoherenceGate.mjs` | **dry-run** | No — `wouldBlock` en log | observación (LLM) |

**Q2 dry-run:** `node scripts/run-q2-answer-key-dryrun.mjs` → `gate-logs/Q2-DRYRUN-REPORT.md`. Modelo: `claude-haiku-4-5` (override `Q2_ANSWER_KEY_MODEL`). Prompt: [`Q2-ANSWER-KEY-GATE.md`](Q2-ANSWER-KEY-GATE.md). Recalibración y FP conocidos: [`gate-logs/Q2-RECALIBRATION-REPORT.md`](gate-logs/Q2-RECALIBRATION-REPORT.md).

#### Highs conocidos de Q2 (FP — sin acción requerida)

Al revisar `gate-logs/Q2-DRYRUN-REPORT.json` o futuros dry-runs, **ignorar** los 7 FP ya diagnosticados (T5 paráfrasis, T2 multi-objetivo, T3 Sara/RadFit). Tabla completa en [`gate-logs/Q2-RECALIBRATION-REPORT.md`](gate-logs/Q2-RECALIBRATION-REPORT.md) § «FP conocidos de Q2». Mismo criterio que findings G2 (`online` arriba).

**Integración:** `scripts/lib/qualityGates/pipelineIntegration.mjs` → `generate-lesen-part-gemini.mjs`

**Logs producción:**
- `gate-logs/audit-Q4-metadataSchema-*.jsonl`
- `gate-logs/audit-Q3-passageCoherence-*.jsonl`
- `gate-logs/shadow-q1-*.jsonl`
- `gate-logs/dryrun-Q2-answerKeyCoherence-*.jsonl`

**Resumen shadow:** `node scripts/summarize-shadow-q1.mjs`

### Gates implementados (oleada 1 — referencia dry-run)

---

## Revisión humana / producción

| Documento | Qué es |
|---|---|
| [`V3-POST-HUMAN-REVIEW-15.md`](V3-POST-HUMAN-REVIEW-15.md) | 15 generados vs checklist humano |
| [`V3-PRODUCTION-15-GENERATED.md`](V3-PRODUCTION-15-GENERATED.md) | Validación v3 en producción |

---

## Código de referencia (no en ready/)

| Módulo | Rol |
|---|---|
| `scripts/lib/qualityGates/metadataSchemaGate.mjs` | Q4 esquema + topics |
| `scripts/lib/qualityGates/duplicateContentGate.mjs` | Q1a dedup determinista |
| `scripts/lib/qualityGates/answerKeyCoherenceGate.mjs` | Q2 clave↔explanation (LLM) |
| `scripts/lib/qualityGates/passageCoherenceGate.mjs` | Q3-A markdown lint |
| `scripts/summarize-shadow-q1.mjs` | Resumen métricas shadow Q1 |
| `scripts/lib/semanticDedup.mjs` | Dedup pasajes Jaccard (solo `passages`, legado) |
| `scripts/lib/t3GroupFingerprint.mjs` | Fingerprint 7 situaciones T3 |
| `scripts/lib/keyExplanationGate.mjs` | CHK-18b determinista |
| `scripts/audit-pass-2.mjs` | POOL-2 CHK-1…29, GATE_BLOCK_CHECKS |
| `scripts/lib/g2FindingsLog.mjs` | Log persistente G2 post-generación |
| `scripts/pos-caps-check.py` | Gate G2 caps (**congelado**) |
