# Q1/Q3/Q4 — Dry-run oleada 1

> **Nota:** Resultados pre-fix. Diagnóstico y recalibración Q1/Q4 en [`Q-DRYRUN-WAVE1b.md`](Q-DRYRUN-WAVE1b.md).

**Fecha:** 2026-07-09  
**Corpus:** 193 archivos `batches/ready/lesen` + 15 validación `batches/generated` (208 total, sin duplicar nombres)  
**Modo:** audit — ningún archivo rechazado en pipeline live  
**Índice dedup:** `batches/ready/.dedup-index.json` (760 entradas: generated + ready + bank passages)

---

## Resumen por gate

| Gate | pass | warn | block | findings |
|------|------|------|-------|----------|
| Q4-metadataSchema | 13 | 26 | 169 | 3638 |
| Q1-duplicateContent | 11 | 0 | 197 | 229 |
| Q3-passageCoherence | 185 | 0 | 23 | 160 |

**Notas de calibración:**

- **Q4 (perfil `servible` en ready):** 169 block es esperado en dry-run — muchos archivos ready carecen de `difficulty/skills/examType/topicTags` en cada question. En generación live usar perfil `generated` hasta publish.
- **Q1:** 197 block refleja solapamiento ready↔generated (mismo archivo en ambas carpetas) + bank. Comportamiento deseado para evitar republicar contenido ya visto.
- **Q3:** 23 block = markdown residual `**…**` en passages T5 (y similares). `possible_sentence_case_error` dispara como **warn** anidado pero el veredicto global es `block` por markdown coexistente.

---

## Caso referencia T3 — qeh7ew ↔ tz7n7y

| Archivo | Veredicto | Finding |
|---------|-----------|---------|
| `lesen-t3-auto-qeh7ew.json` | **block** | `near_duplicate` — T3 fingerprint `465b3d3f6b77de6d` = tz7n7y |
| `lesen-t3-auto-tz7n7y.json` | **block** | `near_duplicate` — mismo fingerprint = qeh7ew |

Fingerprint: multiset de 7 pares `(pregunta_norm, anuncio_correcto_norm)` — invariante al barajado A–J.

---

## Tabla validación humana (subset etiquetado)

| Gate | Archivo | Esperado (auditoría) | Obtenido | ¿Coincide? | Notas |
|------|---------|----------------------|----------|------------|-------|
| Q1 | `lesen-t3-auto-qeh7ew.json` | block | block | **sí** | near_duplicate ↔ tz7n7y |
| Q1 | `lesen-t3-auto-tz7n7y.json` | block | block | **sí** | near_duplicate ↔ qeh7ew |
| Q3 | `lesen-t5-gemini-063.json` | block | block | **sí** | 6× markdown_leak + 2× sentence_case (warn) |
| Q3 | `lesen-t5-gemini-065.json` | block | block | **sí** | 5× markdown_leak + 2× sentence_case (warn) |
| Q3 | `lesen-t3-auto-qeh7ew.json` | pass | pass | **sí** | sin markdown |
| Q3 | `lesen-t3-auto-tz7n7y.json` | pass | pass | **sí** | sin markdown |
| Q1 | `lesen-t1-gemini-177.json` | block\|warn | pass | **no*** | *Auditoría: dup semántico pero «No cruzada con otros del lote» — no hay segundo archivo con mismo hash en corpus |
| Q1 | `lesen-t2-gemini-091.json` | block\|warn | pass | **no*** | *Mismo caso: título repetido de plantilla, sin par exacto en índice |

---

## Falsos positivos / reglas frágiles

### `possible_sentence_case_error` (Q3, warn)

- Dispara correctamente en t5-063/t5-065 (`persönliche Gegenstände`, `persönliche Daten` tras `**Header:**`).
- En el corpus completo **0 archivos** con veredicto `warn` exclusivo — todos los T5 con `**` también tienen `markdown_leak` → `block`.
- **FP estimado:** bajo en la muestra; la regla solo aplica tras patrón `**…:**` y excluye artículos (`der/die/das`). Calibrar en fase 2 si se separa markdown repair de sentence-case.

### Q1 `near_duplicate` en holdout

- Muchos blocks ready↔generated son **verdaderos positivos** (mismo JSON en dos rutas). No integrar como block en ingest de ready sin excluir self-path mirror.

---

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Logs JSONL por gate | `batches/ready/gate-logs/Q*-2026-07-09T08-00-42.jsonl` |
| Resumen JSON | `batches/ready/gate-logs/dryrun-summary-2026-07-09T08-00-42.json` |
| Índice dedup | `batches/ready/.dedup-index.json` |
| Tests | `node scripts/lib/qualityGates/__tests__/qualityGates.test.mjs` (4/4) |
| Runner | `node scripts/run-quality-gates-dryrun.mjs --pool ready --validation` |

---

## Próximo paso (no hecho en esta sesión)

1. Revisar este reporte → decidir si algún `warn` pasa a `block`.
2. Integrar en `generate-lesen-part-gemini.mjs` en modo `audit` (sin rechazar).
3. Oleada 2: Q2 `answerKeyCoherenceGate` + Q3 Capa B (LLM).
