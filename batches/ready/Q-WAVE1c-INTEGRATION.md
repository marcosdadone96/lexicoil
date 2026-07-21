# Wave 1c — Integración audit/shadow + desglose Q1 por Teil

**Fecha inicio observación:** 2026-07-09  
**Corpus dry-run:** 208 archivos (193 holdout + 15 validación)

---

## Tarea 1 — Desglose Q1 por Teil (post-fix, 159 blocks)

| Teil | Archivos corpus | Blocks | % blocks del Teil | cross_id | bank | mirror |
|------|-----------------|--------|-------------------|----------|------|--------|
| 1 | 19 | 4 | 21.1% | 0 | 4 | 0 |
| 2 | 18 | 8 | 44.4% | 0 | 16* | 0 |
| **3** | **128** | **127** | **99.2%** | **127** | 0 | 0 |
| 4 | 19 | 13 | 68.4% | 11 | 6 | 0 |
| 5 | 24 | 7 | 29.2% | 0 | 7 | 0 |

\*Algunos archivos T2 tienen >1 finding bank (16 findings / 8 archivos).

**Conclusión:** el 76.4% global de block **no es sesgo residual** — está concentrado en **Teil 3 (99.2%)**, coherente con T3-auto reciclando plantillas ya presentes como T3-gemini. T1/T2/T5: blocks casi exclusivamente `bank_match` (contenido ya publicado). T4: mezcla cross_id + bank.

### Snapshot `library/de/B1/questions.json`

| Campo | Valor |
|-------|-------|
| mtime (disco) | 2026-07-06T12:12:35Z |
| meta.version | 88 |
| meta.generatedAt | 2026-07-06 |
| sha256 | `5f2d8c14…bcd41208` |
| passages en archivo | 109 |
| entradas bank en `.dedup-index` | 83 |

**Verificación:** el dry-run cargó el bank **actual en disco** vía ruta fija `library/de/B1/questions.json` (no copia auxiliar). El índice se reconstruyó el 2026-07-09 contra ese archivo.

**Limitación conocida:** si hubo `publish-lesen-generated` entre el 2026-07-06 y el dry-run del 2026-07-09, los 33 `bank_match` podrían subestimar duplicados recién publicados. No es bug del gate — anotar al interpretar shadow logs.

---

## Tarea 2 — Integración audit (Q3-A, Q4)

**Archivo:** `scripts/generate-lesen-part-gemini.mjs` + `scripts/lib/qualityGates/pipelineIntegration.mjs`

**Orden en pipeline:**

```
decapOnly
  → Q4 (audit + block real solo topic_mismatch)
  → Q1 shadow (solo log)
  → checkLesenBatchQuality / G2
  → validatePart (POOL-2)
  → Q3-A (audit, solo si POOL-2 pasó)
  → generated/
```

**Logs:** `batches/ready/gate-logs/audit-Q4-metadataSchema-{fecha}.jsonl`  
**Logs:** `batches/ready/gate-logs/audit-Q3-passageCoherence-{fecha}.jsonl`

**Comportamiento garantizado:**
- Q3-A audit: **nunca** mueve a `.rejected/` ni impide `generated/`
- Q4 audit: `missing_field`, `legacy_topic_slug` → solo log (warn)
- Q4 **block real**: solo `topic_mismatch` → sí rechaza (única excepción nueva)
- Archivos que antes pasaban y **no** tienen `topic_mismatch` siguen llegando a `generated/`

---

## Tarea 3 — Q1 shadow mode

**Log:** `batches/ready/gate-logs/shadow-q1-{fecha}.jsonl`  
**Campo extra:** `wouldReject: true|false`  
**Impacto pipeline:** ninguno (no warn en archivo, no `.rejected/`)

---

## Estado gates (INDEX)

| Gate | Modo | Block real | Inicio observación |
|------|------|------------|-------------------|
| Q3-A | **audit** | No | 2026-07-09 |
| Q4 | **audit** + block parcial | Solo `topic_mismatch` | 2026-07-09 |
| Q1 | **shadow** | No | 2026-07-09 |

---

## Plan decisión Q1 → block (tras 1–2 semanas shadow)

Medir solo sobre entradas `shadow-q1-*.jsonl` con `file` en `batches/generated/` **post 2026-07-09** (generación nueva, no holdout).

| Métrica | Aceptable → activar block | Preocupante → otra iteración |
|---------|---------------------------|------------------------------|
| `wouldReject` rate global (archivos nuevos) | **< 15%** | **> 30%** |
| `wouldReject` por Teil 3 únicamente | **< 40%** (plantillas conocidas) | **> 60%** sin explicación |
| `mirror_pair` en shadow | **0%** (debe permanecer) | cualquier > 0 → bug regresión |
| `bank_match` en shadow | **< 10%** o warn-only | **> 20%** → política bank_match→warn |
| Falsos positivos confirmados manualmente | **0 casos** en muestra ≥20 archivos | **≥2 casos** misma regla |
| Caso referencia qeh7ew↔tz7n7y en shadow | `wouldReject: true` en al menos uno | no detecta → bug fingerprint |

**Criterio de promoción:** 2 semanas de shadow, rate global < 15%, 0 mirror_pair, 0 FP manuales → Q1 pasa a **block** en generación live. Si T3 shadow > 40% pero 100% son cross_id con plantilla auto conocida, considerar block solo para `near_duplicate` T3, `bank_match`→warn.

---

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Desglose Q1 por Teil | `batches/ready/gate-logs/q1-teil-breakdown-post-fix.json` |
| Runner desglose | `node scripts/diagnose-q1-teil-breakdown.mjs` |
| Integración pipeline | `scripts/lib/qualityGates/pipelineIntegration.mjs` |
