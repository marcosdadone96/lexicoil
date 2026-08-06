# Q1/Q4 — Diagnóstico y recalibración (Wave 1b)

**Fecha:** 2026-07-09  
**Corpus:** 208 archivos (193 holdout + 15 validación) — mismo set que Wave 1  
**Q3-A:** sin cambios (ya calibrado → audit en paralelo)

---

## 1. Diagnóstico PRE-fix (sin cambiar código)

### Q1 — 197 archivos block / 229 findings

| Categoría | Findings | % | Interpretación |
|-----------|----------|---|----------------|
| **mirror_pair** | 60 | 26% | Mismo ID lógico ready↔generated (espejo esperado) |
| **cross_id_match** | 136 | 59% | Duplicado real (ej. t3-auto-001 ↔ t3-gemini-060) |
| **bank_match** | 33 | 14% | Contenido ya publicado en `library/de/B1/questions.json` |
| unknown | 0 | 0% | — |

**Hipótesis mirror:** confirmada parcialmente — 60 findings (26%) eran inflación por espejo, pero **la mayoría (59%) ya eran duplicados cross-ID reales**, sobre todo T3 auto vs T3 gemini.

### Q4 — 169 archivos block

**a) Por Teil (archivos block):**

| Teil | Blocks | % del total |
|------|--------|-------------|
| 1 | 16 | 9% |
| 2 | 11 | 7% |
| **3** | **123** | **73%** |
| 4 | 9 | 5% |
| 5 | 10 | 6% |

**b) Top campos (findings block):**

| Campo / regla | Frecuencia |
|---------------|------------|
| difficulty | 861 |
| skills | 861 |
| examType | 861 |
| topicTags | 861 |
| topic_mismatch | 49 |
| topicTag (passage) | 5 |

**Diagnóstico:** Teil 3 concentraba el 73% de blocks porque el perfil `servible` exigía `difficulty/skills/examType/topicTags` en cada question (7 × 123 = 861). Esos campos no existen en T3 ready. Los 49 `topic_mismatch` incluían slugs legacy `daily_life` sin mapeo B1.

---

## 2. Fixes aplicados

### Q1 — `dedupCorpus.mjs`

- Índice por **ID lógico** (basename, ej. `lesen-t1-gemini-166`).
- Colapso de rutas espejo con prioridad: **bank > ready > generated**.
- `corpusExcludingSource()` excluye todas las entradas del mismo ID lógico al evaluar un archivo.
- Índice: 760 → **535 entradas** (225 duplicados de ruta eliminados).

### Q4 — `schema/lesen-fields.json` + `metadataSchemaGate.mjs`

**Política documentada en código:**

| Campo / caso | Severidad en `servible` | Motivo |
|--------------|-------------------------|--------|
| `difficulty`, `skills`, `examType`, `topicTags` | **warn** | Corpus pre-publish; se rellenan en `publish-lesen-generated` (+SEM-1). Block reservado para perfil futuro `servible_publish`. |
| Teil 3 questions | Solo campos base (block) | T3 matching no lleva metadata pedagógica por pregunta |
| `daily_life` y slugs legacy | **warn** (`legacy_topic_slug`) | Slug generador pre-B1_TOPICS |
| `topic_mismatch` canónico (ej. Freizeit≠Technik) | **block** | Desalineación real |

---

## 3. Tabla comparativa antes / después

| Gate | Métrica | Wave 1 (pre) | Wave 1b (post) | Δ |
|------|---------|--------------|----------------|---|
| **Q1** | pass | 11 | 49 | +38 |
| | warn | 0 | 0 | — |
| | block | 197 (94.7%) | 159 (76.4%) | −38 |
| | findings | 229 | 171 | −58 |
| | mirror_pair findings | 60 | **0** | −60 ✓ |
| | cross_id_match | 136 | 138 | ≈ |
| | bank_match | 33 | 33 | ≈ |
| | índice entradas | 760 | 535 | −225 |
| **Q4** | pass | 13 | 27 | +14 |
| | warn | 26 | 174 | +148 |
| | block | 169 (81.3%) | 7 (3.4%) | −162 |
| | findings | 3638 | 194 | −3444 |
| | Teil 3 blocks | 123 | **0** | −123 ✓ |

---

## 4. Caso referencia qeh7ew ↔ tz7n7y (post-fix)

| Archivo | Veredicto | Finding |
|---------|-----------|---------|
| `lesen-t3-auto-qeh7ew.json` | **block** | `near_duplicate` fp `465b3d3f6b77de6d` ↔ tz7n7y |
| `lesen-t3-auto-tz7n7y.json` | **block** | `near_duplicate` fp `465b3d3f6b77de6d` ↔ qeh7ew |

**No roto por canonicalización** — IDs lógicos distintos, ambos indexados.

---

## 5. Q4 — 7 blocks residuales (post-fix)

Todos `topic_mismatch` canónico real (topicTags en questions ≠ `_requestedTopic`):

| Archivo | _requestedTopic | topicTag conflictivo |
|---------|-----------------|----------------------|
| lesen-t2-gemini-067 | Freizeit | Ernährung, Technik |
| lesen-t2-gemini-072 | Technik | Bildung |
| lesen-t2-gemini-076 | Technik | Umwelt |
| lesen-t2-gemini-079 | Technik | Wohnen |
| lesen-t4-gemini-029 | Technik | Arbeit |
| lesen-t5-gemini-045 | Freizeit | Technik |
| lesen-t5-gemini-046 | Freizeit | Technik |

---

## 6. Q1 — 159 blocks residuales (post-fix)

| Categoría | Findings | ¿Legítimo? |
|-----------|----------|------------|
| cross_id_match | 138 | **Sí** — T3-auto duplica T3-gemini (mismo fingerprint) |
| bank_match | 33 | **Sí** — pasaje ya en bank publicado |
| mirror_pair | 0 | Espejo eliminado ✓ |

El 76% block en holdout refleja **duplicación real acumulada en el pool**, no sesgo de corpus. En generación live de archivos **nuevos**, el ratio esperado debería ser mucho menor.

---

## 7. Recomendación final

| Gate | ¿Listo para audit? | ¿Listo para block en live? | Notas |
|------|-------------------|---------------------------|-------|
| **Q3-A** | **Sí** | Opcional (markdown inequívoco) | Sin cambios Wave 1b |
| **Q4** | **Sí** | **Sí** solo `topic_mismatch` (7 archivos / 3.4%) | Pedagogy fields y legacy slugs en warn; calibrado |
| **Q1** | **Sí** (audit primero) | **No todavía** | Mirror fix OK; 76% holdout = dupes reales del pool. Activar audit en generación live 1–2 semanas; medir `wouldReject` solo en archivos **nuevos** antes de block |

**Siguiente iteración Q1 (si audit muestra FP en producción):**
- Separar `bank_match` → warn en re-ingest (contenido ya publicado puede ser intencional en re-sync).
- Mantener `near_duplicate` / `exact_duplicate` cross-ID como block.

---

## Artefactos

| Artefacto | Ruta |
|-----------|------|
| Diagnóstico pre-fix | `batches/ready/gate-logs/wave1-diagnosis-pre-fix.json` |
| Diagnóstico post-fix | `batches/ready/gate-logs/wave1-diagnosis-post-fix.json` |
| Dry-run post-fix | `batches/ready/gate-logs/dryrun-summary-2026-07-09T08-12-50.json` |
| Runner diagnóstico | `node scripts/diagnose-wave1-gates.mjs [q1.jsonl] [q4.jsonl] --post-fix` |
| Dry-run | `node scripts/run-quality-gates-dryrun.mjs --pool ready --validation` |
