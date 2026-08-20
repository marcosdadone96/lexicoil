# A2 e2–e4 — prep completado + vista previa de activación

**Fecha:** 2026-08-09  
**Estado:** contenido corregido y republicado en `library/published-exams/` — **activación NO aplicada** (catálogo sigue con 1 exam live; `de_A2.json` sigue sirviendo solo e1).

> **Deploy:** bloqueado hasta renovación cuota Netlify. Este trabajo queda listo en cola local; la activación abajo se aplica cuando apruebes el diff, no hoy en prod.

---

## A. Fixes de contenido (aplicados)

### 1. Pool — gramática determinista

| Fix | Parte | Examen | Cambio |
|-----|-------|--------|--------|
| Schulbudget | `lesen-t4-cur-health` | e3 | `den Schulbudget` → `das Schulbudget` |
| Tennisverein | `lesen-t3-cur-society` | e3 | ya en pool: `in den Tennisverein` (5 opciones) |
| Radiointerview | `horen-t4-cur-society` | e2 | ya en pool: `Im Radiointerview` |
| Nachhaltige | `lesen-t4-cur-society` | e2 | ya en pool: `Nachhaltige Verpackung` |

### 2. Pool — CHK-34 MINOR (`lesen-t4-cur-work`, e4)

4 explicaciones reescritas con cita literal (Q1, Q2, Q3, Q5). Q4 sin cambio (correcta = X).

Post-fix: **CHK-34 hits = 0** en pool.

### 3. Reassemble + republish (slots 2–4)

```text
node scripts/reassemble-verified-from-pool.mjs --level A2 --slots 2,3,4
# evidence: batches/ready/gate-logs/a2-reassemble-verified-evidence.json

# republish overlay pool → published (syncServed=false, catálogo restaurado a 1 exam)
# overlay: batches/ready/gate-logs/verified-publish-overlay-1786267494544.json
```

**Verificación post-republish** (`library/published-exams/de/A2/`):

| Examen | Check | Resultado |
|--------|-------|-----------|
| e2 | `Nachaltige` | **0** ocurrencias; `Nachhaltige Verpackung` ✓ |
| e2 | `Im Radiointerview` | ✓ en horen T4 explanation |
| e3 | `das Schulbudget` | ✓ en lesen T4 ad |
| e3 | `in den Tennisverein` | ✓ en lesen T3 MCQ options |
| e4 | explicaciones Anzeige + «…» | ✓ Q1/Q2/Q3/Q5 |

`_catalog.json` **sin cambios** — sigue solo `official-de-A2-e1` live.

---

## B. Vista previa de activación (5 pasos — NO ejecutados)

Artefactos generados: `batches/ready/gate-logs/.tmp-a2-activation-preview/`  
Script: `node scripts/dev/preview-a2-e2-e4-activation.mjs`

### Paso 1 — `_catalog.json` (añadir e2, e3, e4 como live)

```diff
--- library/published-exams/de/A2/_catalog.json
+++ (after activation)
@@ -1,6 +1,6 @@
 {
   "schema": "published-catalog/v1",
-  "version": "2026-07-22T13:30:16.513Z",
+  "version": "<timestamp>",
   "lang": "de",
   "level": "A2",
   "exams": [
@@ -11,6 +11,30 @@
       "status": "live",
       "manifestVersion": 1,
       "publishedAt": "2026-07-22T13:30:16.503Z"
+    },
+    {
+      "examId": "official-de-A2-e2",
+      "slot": 2,
+      "title": "Official A2 Exam 2",
+      "status": "live",
+      "manifestVersion": 1,
+      "publishedAt": "2026-08-09T09:24:54.616Z"
+    },
+    {
+      "examId": "official-de-A2-e3",
+      "slot": 3,
+      "title": "Official A2 Exam 3",
+      "status": "live",
+      "manifestVersion": 1,
+      "publishedAt": "2026-08-09T09:24:54.616Z"
+    },
+    {
+      "examId": "official-de-A2-e4",
+      "slot": 4,
+      "title": "Official A2 Exam 4",
+      "status": "live",
+      "manifestVersion": 1,
+      "publishedAt": "2026-08-09T09:24:54.616Z"
     }
   ]
 }
```

### Paso 2 — Re-sync published → served

Los snapshots ya están republicados (paso A.3). Tras activar catálogo:

```bash
node scripts/sync-published-to-served.mjs --lang de --level A2 --apply
```

### Paso 3 — `data/exams/de_A2.json`

| Métrica | Antes | Después |
|---------|-------|---------|
| Exámenes servidos | 1 (`official-de-A2-e1`) | 4 (e1–e4) |
| Tamaño archivo | ~89 KB | ~344 KB |

```text
git diff --stat data/exams/de_A2.json  →  +5932 / -9 líneas
```

Preview completo: `.tmp-a2-activation-preview/de_A2.after.json`

### Paso 4 — `data/exams/availability.json`

```diff
--- data/exams/availability.json
+++ (after activation)
@@ -6,7 +6,7 @@
     },
     "A2": {
       "status": "live",
-      "exams": 1,
+      "exams": 4,
       "personalized": false,
       ...
       "poolPreview": 4
```

Regeneración recomendada tras sync:

```bash
node scripts/build-availability.mjs
```

(`build-availability` lee catálogo live count → también producirá `exams: 4`.)

### Paso 5 — `scripts/verify-a2-app-catalog.mjs`

```diff
 const ok =
-  live.length === 1 &&
-  served.length === 1 &&
+  live.length === 4 &&
+  served.length === 4 &&
   gate.ok &&
   avail.de?.A2?.status === 'live' &&
-  avail.de?.A2?.exams === 1;
+  avail.de?.A2?.exams === 4;
```

---

## C. Secuencia de aplicación (cuando apruebes)

```bash
# 1. Catálogo — editar _catalog.json (diff paso 1) o copiar _catalog.after.json

# 2. Sync served
node scripts/sync-published-to-served.mjs --lang de --level A2 --apply

# 3. Availability
node scripts/build-availability.mjs

# 4. Verify gate
#    (aplicar diff paso 5 primero)
node scripts/verify-a2-app-catalog.mjs   # debe exit 0

# 5. Smoke local
#    Hard-refresh app → selector A2 debe mostrar 4 exámenes
```

**No ejecutar deploy Netlify** hasta cuota renovada.

---

## D. Archivos tocados en este prep (listos para commit)

| Área | Archivos |
|------|----------|
| Pool | `lesen-t4-cur-health.json`, `lesen-t4-cur-work.json` |
| Assembled | `assembled-exam-a2-verified-e{2,3,4}.json` |
| Published | `official-de-A2-e{2,3,4}.json` |
| Evidence | `a2-reassemble-verified-evidence.json`, `verified-publish-overlay-1786267494544.json` |
| Preview | este doc + `.tmp-a2-activation-preview/` + `scripts/dev/preview-a2-e2-e4-activation.mjs` |

**Sin tocar (hasta activación):** `_catalog.json`, `data/exams/de_A2.json`, `data/exams/availability.json`, `verify-a2-app-catalog.mjs`.
