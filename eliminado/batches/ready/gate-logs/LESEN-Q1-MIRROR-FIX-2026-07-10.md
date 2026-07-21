# Lesen Q1 mirror fix + pool-content-ok-lesen — 2026-07-10

## 1) Diagnóstico de los ~200 “mirror”

**Muestra (10/200):** todos son el **mismo ID lógico** en dos rutas físicas, no contenido distinto.

| Espejo típico | Ejemplo |
|---------------|---------|
| `needs-regeneration/X` ↔ `pool-content-ok/X` | `lesen-t1-gemini-075` |
| `needs-regeneration/X` ↔ `ready/lesen/X` | `lesen-t1-gemini-171` |
| “self” vía path falso `generated/X` | mismo stem indexado en needs-regen |

**Causa raíz (bug reaparecido / incompleto):**

`poolReadyCheck` construía `corpusExcludingSource(...)` (correcto por `logicalId`) pero pasaba **`index: corpus.index`** (índice **completo**). El gate leía el índice sin filtrar → falso `exact_duplicate` contra el gemelo.

**Fix (doble):**

1. Usar `index: filtered.index`.
2. `isOtherSource` compara también `logicalBatchId` (defensa en profundidad).
3. `sourceTier` actualizado para `pool-verified` / `pool-content-ok-lesen` / `needs-regeneration`.

Test: `scripts/lib/__tests__/q1-logical-id-mirror.test.mjs`

### Recheck tras el fix (395 Lesen en needs-regen)

| Cubo | N | Destino |
|------|--:|---------|
| **READY** (desbloqueados de verdad) | **74** | `pool-verified/` |
| Solo Q1 real (cross_id / bank / T3 fp) | **170** | `pool-content-ok-lesen/` |
| Sigue REJECT contenido/otro | **83** | `needs-regeneration/` |
| Redundante (ya en `ready/lesen`) | **68** | eliminados de needs-regen |

Por Teil (promovidos / q1-only / reject / redundant):

| Teil | ready | q1-only | reject | redundant |
|------|------:|--------:|-------:|----------:|
| T1 | 38 | 10 | 20 | 17 |
| T2 | 6 | 2 | 35 | 15 |
| T3 | 0 | 140 | 7 | 0 |
| T4 | 5 | 12 | 6 | 17 |
| T5 | 25 | 6 | 15 | 19 |

T3: los 140 q1-only son **near_duplicate por fingerprint** (agotamiento blueprints) — no bug de índice.

---

## 2) Fuente Lesen en e2/e3/e4

**Ensamblador:** `scripts/assemble-review-unit-exams.mjs`  
**Fuente en el momento del ensamblado:** `batches/generated/` (documentado en el header del script; `generated/` hoy está vacío de Lesen tras el triage).

**Protección que sí tuvieron:**

| Gate | ¿Aplicado? |
|------|------------|
| Discard lists (`Q2-LENA-CLUSTER-DISCARD`, `PENDING-CONTENT-FIXES`) | **Sí** — `_meta.discardGate.ok: true`, 19 ids |
| `isPartPoolReady` (calidad/pool legacy) | Sí (screen) |
| Q1 duplicate (block) | **No** — Q1 en shadow |
| pool-verified | **No** — no existía / no era fuente |

Tras refresh in-place, las piezas de e2–e4 viven hoy repartidas en `pool-verified`, `pool-content-ok-lesen`, `ready/lesen` y algunos aún en `needs-regeneration` (p.ej. t5-075) — el JSON ensamblado **no se re-generó** en esta tarea.

---

## 3) `pool-content-ok-lesen`

- Dir: `batches/ready/pool-content-ok-lesen/`
- Criterio: REJECT **solo** por `exact_duplicate` / `near_duplicate` (resto de gates OK)
- Nota en archivo: riesgo Q1 aceptado hasta **2026-07-23**
- Cableado en: `finalizePoolReady.mjs`, `run-pool-ready-check.mjs`, `assemble-review-unit-exams.mjs` (prioridad: verified → ok-lesen → ready/lesen → generated)

**Archivos ahí ahora: 170** (140 T3 + resto T1/T2/T4/T5).

---

## 4) ¿Hay Lesen suficiente para ensamblar?

**Sí — con confianza razonable para varios exámenes**, sin generar contenido nuevo ahora.

| Fuente eligible (únicos, sin discard) | N |
|---------------------------------------|--:|
| pool-verified (Lesen) | 74 |
| pool-content-ok-lesen | 170 |
| ready/lesen (no blocked) | 188 |
| **Únicos combinados** | **432** |

Por Teil (únicos eligible): T1 **65** · T2 **23** · T3 **260** · T4 **34** · T5 **50**.

| Celda | ¿Suficiente para 3–5 exámenes? | Nota |
|-------|--------------------------------|------|
| T1/T4/T5 | Sí | Holgado |
| T2 | Sí, justo | 23 únicos — si hace falta más diversidad temática, **prioridad de regen = T2** |
| T3 | Volumen sí; diversidad limitada | 140 en ok-lesen son clones de fingerprint — para >~10–15 exámenes distintos hace falta **más blueprints**, no más clones |

**No hace falta oleada de generación ahora** para ensamblar review/exámenes. Siguiente contenido nuevo, si se pide: **T2** (stock fino) y **blueprints T3** (diversidad), no rellenar espejos.

Script de recheck: `node scripts/recheck-lesen-q1-mirror-fix.mjs`
