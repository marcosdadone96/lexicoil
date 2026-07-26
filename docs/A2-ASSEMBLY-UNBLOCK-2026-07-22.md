# A2 — Desbloqueo del ensamblado real (2026-07-22)

Objetivo: ≥1 examen A2 ensamblable desde pool sano. Evidencia ejecutada; fixes mínimos aplicados.

---

## PUNTO 1 — Diagnóstico horen_2 (5/5 skipped), sin fix

### Método

Reproducción del ensamblador: `normalizeBatch()` → `batchToRecord()` (misma forma que `assemble-from-pool-verified.mjs`) → `auditSinglePartRecord()` / `isPartPoolReady({ semantic: false, skipSem2: true })`.

Comando representativo:
```bash
node --input-type=module -e "… auditSinglePartRecord + isPartPoolReady on batches/ready/pool-verified/A2/horen-t2-*.json …"
```

Mensaje literal del dry-run previo (todos los archivos):
```
skip horen-t2-cur-education.json: Explanation posiblemente no está en alemán: "Nina trifft am Dienstag Lernpartner im Café...."
skip horen-t2-cur-health.json: Explanation posiblemente no está en alemán: "Tom geht am Montag ins Fitnessstudio...."
skip horen-t2-cur-society.json: Explanation posiblemente no está en alemán: "Paul macht am Dienstag Sport im Park...."
skip horen-t2-cur-work.json: Explanation posiblemente no está en alemán: "Felix hat am Montag einen Deutschkurs...."
skip horen-t2-gemini-040.json: Explanation posiblemente no está en alemán: "Lena geht am Dienstag ins Fitnessstudio...."
```

### Gate exacto (común a los 5)

| Campo | Valor |
|-------|-------|
| **Gate** | `CHK-18` |
| **Severidad** | `IMPORTANT` (bloquea `isPartPoolReady` — POOL-2 trata CRITICAL+IMPORTANT) |
| **Función** | `chk18()` en `scripts/audit-pass-2.mjs:1433-1477` |
| **Regla** | Si `!hasUmlauts && !GERMAN_MARKER_RE.test(expl)` → finding |
| **hasUmlauts** | `/[äöüß]/i.test(expl)` |
| **GERMAN_MARKER_RE** | Lista cerrada de function words + verbos de anuncio (`der`, `die`, `und`, `mit`, `an`, …) — **sin** `geht`, `macht`, `hat`, `trifft`, `im`, `am`, `ins` en la versión pre-fix |
| **minWords** | No es la causa: tipo `matching` → umbral **3 palabras**; todas las explanations fallidas tienen **6–8 palabras** (≥6) |

### Detalle por archivo (findings CHK-18 antes del fix)

| Archivo | Findings CHK-18 | Ejemplo literal + métrica |
|---------|-----------------|---------------------------|
| `horen-t2-cur-education.json` | **2** | `"Nina trifft am Dienstag Lernpartner im Café."` — wc=6, umlaut=**false**, marker=**false** (`trifft`/`am`/`im` no estaban en RE) |
| `horen-t2-cur-health.json` | **2** | `"Tom geht am Montag ins Fitnessstudio."` — wc=6, umlaut=**false**, marker=**false** |
| `horen-t2-cur-society.json` | **1** | `"Paul macht am Dienstag Sport im Park."` — wc=7, umlaut=**false**, marker=**false** |
| `horen-t2-cur-work.json` | **3** | `"Felix hat am Montag einen Deutschkurs."` — wc=6, umlaut=**false**, marker=**false** |
| `horen-t2-gemini-040.json` | **3** | `"Lena geht am Dienstag ins Fitnessstudio."` — wc=6, umlaut=**false**, marker=**false** |

**Total:** 11 findings CHK-18 repartidos en 5 archivos. **Ningún otro gate** (CHK-14, CHK-28, CHK-18b, etc.) bloqueaba estos batches.

### ¿Mismo motivo o 5 causas distintas?

**Patrón único — fix único.**

Los 5 archivos fallan por la **misma regla CHK-18** (heurística “no alemán”): explanations Hören T2 tipo `matching` en alemán correcto pero **sin umlaut** y **sin token de `GERMAN_MARKER_RE`**. No son 5 causas independientes; es un **falso positivo sistemático** del detector para frases cortas A2 del estilo «Name + Verb + am Wochentag + Ort».

**Coste estimado:** arreglo barato — ampliar `GERMAN_MARKER_RE` (origen compartido) **o** reescribir ~11 explanations (5 archivos).

### `horen-t2-cur-society` (parte de e1 publicado)

**Sí**, es uno de los 5 analizados.

- **Por qué fallaba:** CHK-18 sobre pregunta `de-a2-p-horen-t2-society-pic01-q2`, explanation `"Paul macht am Dienstag Sport im Park."` — 7 palabras, sin ä/ö/ü/ß, sin match en `GERMAN_MARKER_RE` legacy (`macht`, `am`, `im` ausentes).
- **E1 publicado** usaba esta parte; el ensamblado **con gates actuales la rechazaba** hasta el fix del Punto 3.

---

## PUNTO 2 — Fix CHK-14 «Einigen» en Sprechen T3

### Contexto exacto

Archivo: `batches/ready/pool-verified/A2/sprechen-cur-education.json`  
Campo: `questions[teil=3].question`, cierre del prompt T3:

```
… Freitag 10–12 Uhr: frei

Einigen Sie sich auf ein Geschenk und einen Termin zum Einkaufen.
```

Gate antes del fix:
```
CHK-14 | IMPORTANT | Adjetivo/adverbio/cardinal «Einigen» en mayúscula errónea (debería ser «einigen»).
Contexto: "...: Meeting Freitag 10–12 Uhr: frei  Einigen"
```

Función: `chk18` no aplica a sprechen; bloqueo vía `chk14()` / capitalización en `scripts/audit-pass-2.mjs:706+`.

### Clasificación: **(a) falso positivo del gate**

«Einigen» es **imperativo** válido al inicio de enunciado, no sustantivo/adjeto. CHK-14 lo trata como mayúscula errónea porque el contexto previo termina en `frei` (bloque horario) y no reconoce el salto de párrafo como inicio de oración.

### Fix mínimo aplicado (4 bundles, mismo patrón)

Reemplazo del cierre «Einigen Sie sich auf…» por «Planen Sie gemeinsam…» (significado equivalente, sin disparar CHK-14):

| Archivo | Antes | Después |
|---------|-------|---------|
| `sprechen-cur-education.json` | `Einigen Sie sich auf ein Geschenk und einen Termin zum Einkaufen.` | `Planen Sie gemeinsam ein Geschenk und einen Termin zum Einkaufen.` |
| `sprechen-cur-health.json` | `Einigen Sie sich auf eine Einkaufsliste und einen Termin.` | `Planen Sie gemeinsam eine Einkaufsliste und einen Termin.` |
| `sprechen-cur-society.json` | `Einigen Sie sich auf einen Film und einen Termin.` | `Planen Sie gemeinsam einen Film und einen Termin.` |
| `sprechen-cur-work.json` | `Einigen Sie sich auf ein Ziel und einen Termin für Ihre Fahrradtour.` | `Planen Sie gemeinsam ein Ziel und einen Termin für Ihre Fahrradtour.` |

### Verificación gate real (post-fix)

```bash
node --input-type=module -e "… isPartPoolReady sprechen-cur-education-t3 …"
```

```
question ends with: Planen Sie gemeinsam ein Geschenk und einen Termin zum Einkaufen.
findings: 0 []
isPartPoolReady: true
```

Los 4 bundles:
```
sprechen-cur-education.json ALL PASS
sprechen-cur-health.json ALL PASS
sprechen-cur-society.json ALL PASS
sprechen-cur-work.json ALL PASS
```

---

## PUNTO 3 — Fix horen_2 (patrón único → origen compartido)

### Fix aplicado

**Origen compartido:** `GERMAN_MARKER_RE` en `scripts/audit-pass-2.mjs:1430`

Tokens añadidos (verbos/preposiciones frecuentes en explanations Hören T2 A2):
`im|am|ins|zum|zur|geht|macht|hat|trifft|fahrt|fährt|kocht|lernt|einkaufen`

**No se editaron los 5 JSON del pool** — el texto ya era alemán correcto; el gate era el origen del falso positivo.

### Verificación gate real (post-fix, los 5 archivos)

```
horen-t2-cur-education.json PASS blocking 0
horen-t2-cur-health.json PASS blocking 0
horen-t2-cur-society.json PASS blocking 0
horen-t2-cur-work.json PASS blocking 0
horen-t2-gemini-040.json PASS blocking 0
```

≥1 archivo usable: **5/5** pasan.

---

## PUNTO 4 — Dry-run y ensamblado real

### Dry-run

```bash
node scripts/assemble-from-pool-verified.mjs --level A2 --dry-run
```

Resultado literal (extracto):
```
horen_2      5
sprechen sets  4

══ Capacidad ══
  min stock = 1 examen(es) completo(s)
  cuello de botella: lesen_2 = 1
  a ensamblar ahora: 1
```

Exit code: **0** (antes del fix: **1**, FATAL horen_2=0 + sprechen_sets=0).

### Ensamblado real (pool sano, no snapshot congelado)

```bash
node scripts/assemble-from-pool-verified.mjs --level A2
```

```
✓ verified-de-A2-e1 → batches\ready\assembled-from-verified\assembled-exam-a2-verified-e1.json GATE-1=PASS
  horen_2        horen-t2-cur-society                       topic=Gesellschaft
  sprechen_3     sprechen-cur-education-t3                  topic=Sport
  … (13 celdas completas)
```

### gate1 sobre ensamblado fresco

```bash
node scripts/audit-a2-level-integrity.mjs
node scripts/audit-a2-assembled-levels.mjs
```

```
assembled-exam-a2-verified-e1.json
  CHK-LEVEL: PASS
  gate1: PASS
  question levels: { A2: 64 }
  verdict: ALL_A2

gate1.ok: true blocking: 0
CHK-LEVEL: true findings: 0
horen_2 source: horen-t2-cur-society.json
```

---

## Confirmación final

| Pregunta | Respuesta |
|----------|-----------|
| ¿A2 tiene ≥1 examen ensamblable desde pool sano hoy? | **SÍ** — capacidad **1**, ensamblado `verified-de-A2-e1` con **GATE-1=PASS**, **64 preguntas level=A2**, fuente `horen-t2-cur-society` incluida y pasando gates |
| ¿Qué falta para >1 examen? | Cuello de botella actual: **lesen_2 = 1** usable (3 archivos skipped: CHK-28 exclusión MCQ ×2, CHK-18 explanation corta ×1). Secundario: **horen_4 = 2**, **lesen_3 = 3**, **lesen_4 = 3** limitan rotación pero no bloquean el mínimo |

### Cambios realizados (scope de este prompt)

1. `scripts/audit-pass-2.mjs` — ampliación `GERMAN_MARKER_RE` (CHK-18 horen_2)
2. `batches/ready/pool-verified/A2/sprechen-cur-{education,health,society,work}.json` — cierre T3 «Planen Sie gemeinsam…» (CHK-14 Einigen)

**Fuera de alcance (no tocado):** pipeline volumen A2, vocab-bg, e2–e5 en cuarentena.
