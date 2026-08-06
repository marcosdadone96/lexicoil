# Pool content triage — adelanto decisión Q1 + topic/Q2 (2026-07-10)

**Corpus:** `batches/needs-regeneration/` · **422** archivos  
**Shadow oficial:** `node scripts/summarize-shadow-q1.mjs --since 2026-07-09` → [`shadow-q1-summary-2026-07-10T11-02-30.md`](shadow-q1-summary-2026-07-10T11-02-30.md)  
**Datos:** [`POOL-CONTENT-TRIAGE-2026-07-10.json`](POOL-CONTENT-TRIAGE-2026-07-10.json) · [`topic-mismatch-ab-2026-07-10.json`](topic-mismatch-ab-2026-07-10.json)

---

## 1) Decisión Q1 (adelantada vs 2026-07-23)

### Shadow live (criterio oficial, solo `batches/generated/` post-09/07)

| Métrica | Valor | Umbral | Semáforo |
|---------|------:|--------|----------|
| wouldReject global | **34.5%** (10/29) | <15% OK / >30% malo | 🔴 |
| wouldReject T3 | **100%** (5/5) | <40% / >60% | 🔴 |
| mirror_pair | **0** | 0 | 🟢 |
| Ventana observación | ~1 día de gen nueva (29 archivos) | 2 semanas → 23/07 | incompleta |

### Backlog Q1 (395 archivos únicos; 435 = suma exact+near con solape)

| Teil | Archivos Q1 | Naturaleza dominante |
|------|------------:|----------------------|
| Lesen T3 | **147** (37%) | **100%** fingerprint T3 (`near_duplicate`); **15** fingerprints únicos; cross_id entre IDs distintos |
| Lesen T1 | 85 | casi todo `exact` · **mirror** mismo stem en `ready/` o `pool-content-ok` |
| Lesen T5 | 65 | idem mirror / bank |
| Lesen T2 | 58 | mirror + bank |
| Lesen T4 | 40 | mirror + algo de cross_id (eco del 100% T4 en shadow) |
| Otros módulos | 0 en este corte Q1 | — |

**Clasificación findings (backlog):** mirror_pair 266 · cross_id 148 · bank_match 79.  
**Importante:** el `mirror_pair` alto del backlog es **higiene de corpus** (misma pieza en `ready/lesen` ↔ `needs-regeneration` / `pool-content-ok`), no regresión del gate en shadow (allí mirror=0).

**T3:** confirma el patrón ya visto — pool de blueprints agotado a este volumen (147 archivos → 15 fingerprints; clusters de 11–15 clones por fp). No es “contenido roto a regenerar a ciegas”; es decisión de política Q1 / diversidad de blueprints.

**Sorpresa:** shadow T4 también 100% wouldReject (5/5, cross_id). No es solo T3.

### Recomendación

**No activar Q1 en block real antes del 23/07** (ni hoy).

Motivos, en orden:

1. Semáforo oficial **rojo** (global 34.5% y T3 100%).
2. Ventana de 2 semanas **no cumplida**; n=29 es demasiado pequeño para promover.
3. El backlog refuerza que T3 es **agotamiento de fingerprint conocido** (candidato a promoción *parcial* T3-only el 23/07 si la muestra FP manual sale limpia) — pero T4 shadow rojo exige investigar antes de cualquier block parcial.
4. Gran parte del “REJECT Q1” del backlog son **espejos** del pool ready, no falsos positivos de contenido nuevo.

**El 23/07:** seguir checklist en [`PENDING-REVIEWS.md`](../PENDING-REVIEWS.md); valorar promoción parcial T3 `near_duplicate` solo si mirror sigue 0 y muestra ≥20 sin FP. **No tocar `pipelineIntegration` hasta tu OK.**

---

## 2) Topic mismatch — fuerza de señal (132 archivos únicos)

Nota: “153” en el briefing era 132 `content_topic_mismatch` + 21 `topic_mismatch` (solapados). **Únicos = 132.**

Criterio Hören: **(a)** `bestScore − tagScore ≥ 2` · **(b)** resto (p.ej. 1 vs 0, `tag_unsupported`).

| Clase | Archivos | Findings | Acción |
|-------|--------:|--------:|--------|
| **(a) señal fuerte** | **61** | 85 | Candidatos reales a revisión de tag (no regen masiva) |
| **(b) señal débil** | **70** | ~126 | Cola baja prioridad |
| solo `tag_unsupported` | 1 | 23 findings repartidos | Baja prioridad salvo revisión puntual |

**(a) por módulo:** lesen-t2 26 · lesen-t1 12 · horen-t1 10 · lesen-t4/t5 6 cada · horen-t2 1.  
Lista completa: `topic-mismatch-ab-2026-07-10.json`.

---

## 3) Discard (5) + Q2 (16)

### Discard — cerrado, sin acción nueva

| Archivo | Lista |
|---------|--------|
| `lesen-t3-auto-1z4z0i` | `Q2-LENA-CLUSTER-DISCARD.json` |
| `lesen-t3-auto-3a0bg4` | idem |
| `lesen-t3-auto-ir8rsg` | idem |
| `lesen-t3-auto-toixf8` | Lena + `PENDING-CONTENT-FIXES.json` |
| `schreiben-gemini-003` | `PENDING-CONTENT-FIXES.json` |

**5/5** ya en listas conocidas · conteo cuadra.

### Q2 — misma clasificación que recalibración CHK-18b

| Veredicto | N | Archivos |
|-----------|--:|----------|
| **REAL** (corregir clave / contenido) | **5** | t1-124, t1-131, t1-153, t1-168, **t2-084** |
| **REAL** ya en discard Lena | **4** | 1z4z0i, 3a0bg4, ir8rsg, toixf8 |
| **FP** (ignorar; no tocar clave) | **7** | t2-098, t5-021/032/060, t3-ozxalp/rb0eeo/yzcwhp |

Sin regeneración en esta tarea. Los 5 REAL no-Lena son la cola Q2 accionable.

---

## 4) De los 422: ¿qué es urgente?

| Cubo | N | Lectura |
|------|--:|---------|
| **Esperando decisión / política Q1** (tienen exact/near) | **~395** | No regenerar; espejos + T3 fingerprint + bank |
| Discard ya excluido | 5 | Cerrado |
| Q2 FP | 7 | No tocar |
| Topic (b) débil (sin Q1 dominante en cola exclusiva) | ~70 archivos con señal débil | Baja prioridad |
| **Corrección real manejable ahora** | **~66** | **5** Q2 REAL + **61** topic (a) a revisar tag |
| Caps repairable sin reason string | 5 | `caps_needs_normalize` (horen/schreiben/sprechen) — no es Q1 |

**Resumen ejecutivo:** de 422 “REJECT contenido”, **~395 esperan Q1/política (no urgentes)**; el trabajo real pequeño es **5 claves Q2 + ~61 topic tags con señal fuerte** — no regenerar los 435/395 duplicados.
