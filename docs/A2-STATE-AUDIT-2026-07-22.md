# Auditoría de estado real — A2 (2026-07-22)

Diagnóstico puro con evidencia ejecutada. **No se aplicó ningún fix** en esta sesión.

Comandos ejecutados desde `c:\Users\marco\Desktop\MDR\lexiloop` salvo indicación contraria.

---

## PARTE 1 — Pipeline de generación A2 vs contenido curado

### 1.1 — ¿Existe generador automático A2 o el pool es 100% curado?

**Veredicto: el pool verificado A2 es casi enteramente curado; no hay pipeline de volumen tipo B1/Gemini operativo hoy.**

| Evidencia | Detalle |
|-----------|---------|
| Conteo de archivos | `node --input-type=module -e "…"` sobre `batches/ready/pool-verified/A2/` → **41 archivos**: **40** con `-cur-`, **1** `horen-t2-gemini-040.json`, **0** otros |
| Entrada “oficial” gaps | `scripts/1-generar-de-a2.cmd` → `scripts/_generar.cmd de A2` → `node scripts/generate-parallel.mjs --lang de --level A2 --provider claude --mode gaps` |
| Proveedor por defecto | `scripts/_generar.cmd` línea 35: `--provider claude`; `scripts/lib/genProvider.mjs` default `GEN_PROVIDER \|\| 'claude'` |
| Job spawn | `scripts/generate-parallel.mjs:182` → `scripts/generate-batch-gemini.mjs` (nombre legacy; acepta Claude o Gemini vía `--provider`) |
| Seed manual del pool | `scripts/seed-a2-pool-verified-from-curated.mjs` — copia desde `library/reusable-seed/de_A2.json`, bank y exámenes curados |
| Alternativa Gemini A2 (existe pero no alimentó el pool) | `scripts/generate-a2-exam.cmd` — 10 llamadas `generate-batch-gemini.mjs --level A2 --provider gemini --merge`; **no** es el loop `generar-hasta-50.ps1` de B1 |

**Conclusión:** existe código para generar A2 (Claude vía `_generar.cmd`, Gemini vía `generate-a2-exam.cmd`), pero el stock publicable actual proviene del seed curado (`*-cur-*`), no de un generador en producción continua.

### 1.2 — ¿Comparte gates/validación con B1?

**Veredicto: ensamblado y publicación comparten `audit-pass-2`; la generación masiva B1 usa un pipeline distinto y más estricto.**

| Capa | A2 hoy | Código |
|------|--------|--------|
| Ensamblado pool → examen | `isPartPoolReady()` → `auditSinglePartRecord()` → CHK-1…CHK-27 + filtros POOL-2 | `scripts/assemble-from-pool-verified.mjs:310`, `scripts/audit-pass-2.mjs:2630` |
| Integridad de nivel | `inferBatchLevel()` + `batchDeclaresUniformLevel()`; bloqueo explícito `MIXED` | `assemble-from-pool-verified.mjs:288-297`, `scripts/lib/batchPaths.mjs:30-61` |
| Publicación | `isExamPublishable()` + `checkExamLevelIntegrity()` (CHK-LEVEL) | `scripts/audit-pass-2.mjs:2812, 2863` |
| Validación post-generación (batch) | `validate-batch.mjs --level A2` (paramétrico por blueprint) | `scripts/generate-batch-gemini.mjs:90-91` |
| Generación B1 volumen | `generate-lesen-part-gemini.mjs` + `generatePartGeminiLib.mjs`: CEFR/lexical (`checkLexical`), length-bias (`collectMcqLengthBiasIssues`), `--from-coverage`, CHK-29 títulos, aperturas Hören T2 rotadas | `scripts/generar-hasta-50.ps1` línea 30: `$Level = 'B1'` hardcoded |
| Verificación umbrales A2 | `node scripts/verify-a2-gates-live.mjs` — confirma gates de calidad con `level: 'A2'` en bank slices | Output literal: length-bias umbral A2 `{ minPct: 20, minChars: 8, batchFailCount: 2 }` |

**Gates que aplican al ensamblar A2 hoy (evidencia del dry-run):** CHK-14 capitalización (`skip lesen-t4-cur-work.json: Sustantivo en minúscula: "anzeigen"`), CHK-14b (`skip lesen-t3-cur-education.json: «Fragen» en mayúscula errónea`), calidad MCQ exclusión (`skip lesen-t2-cur-education.json: opciones no excluyentes`), explicaciones Hören T2 (`skip horen-t2-cur-*.json: Explanation posiblemente no está en alemán`), CHK-14 en Sprechen T3 (`skip sprechen-cur-*.json sprechen_3: gate fail` → causa: `«Einigen» en mayúscula errónea`).

### 1.3 — ¿A2 tiene los fixes recientes de B1 (título/molde, Hören T2, from-coverage)?

**Veredicto: NO en el camino operativo A2.**

| Fix B1 | Ubicación | ¿En flujo A2? |
|--------|-----------|---------------|
| `--from-coverage` + vocab alineado | `generate-lesen-part-gemini.mjs`, `generatePartGeminiLib.mjs` | **No** — A2 no usa estos scripts en `_generar.cmd` ni en seed |
| `titleVariantBank` / `persistedCellPool` (exclusión título/molde) | `scripts/lib/titleVariantBank.mjs`, `lesenSubtypeRotation.mjs` | **Solo wired en generación Lesen Gemini B1** |
| Apertura Hören T2 rotada | `pickNextHorenT2Opening` en `generatePartGeminiLib.mjs:20` | **No** en `generate-batch-gemini.mjs` |
| `balanceMcq` / sweep-blacklist en generación | `lesenBatchQuality.mjs`, `lexicalCheck.mjs` vía pipeline Gemini | **No** en path A2 default; sí en screening de ensamblado vía CHK derivados |

**Fix Lesen T4 A2 (histórico):** `buildLesenT4Record()` + `isA2LesenMatchingBatch()` en `scripts/lib/publishToPool.mjs:146-207` — **sigue en código** y el pool actual tiene 6 fichas (ver §2.3).

---

## PARTE 2 — Stock real por celda

**Fuente canónica del pool:** `batches/ready/pool-verified/A2/`  
**Mínimo objetivo:** ≥3 partes/celda (mismo criterio B1).

### 2.1 — Tabla stock bruto (archivos en disco)

Comando: `node scripts/audit-a2-pool-stock.mjs`

```json
{
  "dir": "…/batches/ready/pool-verified/A2",
  "raw": {
    "lesen_1": 4, "lesen_2": 4, "lesen_3": 4, "lesen_4": 4,
    "horen_1": 4, "horen_2": 5, "horen_3": 4, "horen_4": 4,
    "schreiben_bundles": 4, "schreiben_1": 4, "schreiben_2": 4,
    "sprechen_bundles": 4, "sprechen_1": 4, "sprechen_2": 4, "sprechen_3": 4
  },
  "totalFiles": 41
}
```

| Celda | Stock bruto | ≥3 objetivo |
|-------|-------------|-------------|
| lesen_1–4 | 4 c/u | ✅ |
| horen_1 | 4 | ✅ |
| horen_2 | 5 | ✅ |
| horen_3 | 4 | ✅ |
| horen_4 | 4 | ✅ |
| schreiben_1, schreiben_2 (bundles) | 4 bundles c/u | ✅ |
| sprechen_1–3 (bundles) | 4 bundles c/u | ✅ |

*Nota: A2 no tiene Lesen T5 (correcto para Goethe A2).*

### 2.2 — Stock **post-gates** (ensamblable hoy)

Comando: `node scripts/assemble-from-pool-verified.mjs --level A2 --dry-run` (exit 1)

| Celda | Bruto | **Post-gate (usable)** | ≥3 |
|-------|-------|------------------------|-----|
| lesen_1 | 4 | **4** | ✅ |
| lesen_2 | 4 | **1** (3 skipped: exclusión MCQ, jaccard, explanation corta) | ❌ |
| lesen_3 | 4 | **3** (1 skipped: CHK-14 «Fragen») | ✅ |
| lesen_4 | 4 | **3** (1 skipped: CHK-14 «anzeigen») | ✅ |
| horen_1 | 4 | **4** | ✅ |
| horen_2 | 5 | **0** (5/5 skipped: explanation “no está en alemán”, incl. `horen-t2-gemini-040.json`) | ❌ |
| horen_3 | 4 | **4** | ✅ |
| horen_4 | 4 | **2** (2 skipped: CHK-14 «billiger») | ❌ |
| schreiben sets | 4 | **4** | ✅ |
| sprechen sets | 4 | **0** (4/4 bundles fallan en sprechen_3) | ❌ |

**Cuellos de botella literales del dry-run:**
```
min stock = 0 examen(es) completo(s)
cuello de botella: horen_2 = 0
horen_2: disponible 0, necesario 1
sprechen_sets: disponible 0, necesario 1
FATAL: no se puede ensamblar examen A2
```

### 2.3 — Bug histórico Lesen T4 (6 fichas / matching irresoluble)

**Veredicto: CORREGIDO en el pool actual.**

Script inline sobre los 4 archivos `lesen-t4-cur-*.json`:

```
lesen-t4-cur-education.json  { passages: 6, matchingQs: 5, keys: 'a,b,c,d,e,f', unresolvable: 0 }
lesen-t4-cur-health.json     { passages: 6, matchingQs: 5, keys: 'a,b,c,d,e,f', unresolvable: 0 }
lesen-t4-cur-society.json    { passages: 6, matchingQs: 5, keys: 'a,b,c,d,e,f', unresolvable: 0 }
lesen-t4-cur-work.json       { passages: 6, matchingQs: 5, keys: 'a,b,c,d,e,f', unresolvable: 0 }
```

Código del fix activo: `scripts/lib/publishToPool.mjs` `isA2LesenMatchingBatch()` + rama `passages`/`ads` en `buildLesenT4Record()`.

Ejemplo real — `batches/ready/pool-verified/A2/lesen-t4-cur-education.json`: 6 passages `ad-a`…`ad-f`, pregunta 16 `correct: "a"` resuelve contra `Kunstmuseum – Eintritt frei`.

### 2.4 — Fix Q20 (Kunsthalle / restaurante)

**Veredicto: CORREGIDO en pool fuente.**

Archivo: `batches/ready/pool-verified/A2/lesen-t4-cur-education.json`, pregunta id `"20"`:
```json
"question": "Sie möchten ein Museum mit Restaurant besuchen. Welches wählen Sie?",
"correct": "f",
"correctAnswer": "f",
"explanation": "Anzeige f (Kunsthalle – mit Restaurant) passt: Im Restaurant können Sie nach dem Museumsbesuch zu Mittag essen."
```
Passage `ad-f`: `"title": "Kunsthalle – mit Restaurant"`.

---

## PARTE 3 — Integridad de nivel

### 3.1 — CHK-LEVEL sobre TODO el pool A2

Scan inline de `batches/ready/pool-verified/A2/*.json`:

```
{ files: 41, questions: 185, missingLevel: 0, wrongLevel: 0 }
```

Todas las preguntas declaran `level: "A2"`. **0** ausentes, **0** ≠ A2.

### 3.2 — Exámenes ensamblados / publicados

**Publicado vivo:** solo `library/published-exams/de/A2/official-de-A2-e1.json` (`_catalog.json`: 1 slot live).

Comando: `node scripts/audit-a2-assembled-levels.mjs`

```
assembled-exam-a2-verified-e1.json
  question levels: { A2: 61 }
  verdict: ALL_A2
```

Comando: `node scripts/audit-a2-level-integrity.mjs`

```
assembled-exam-a2-verified-e1.json
  CHK-LEVEL: PASS
  gate1: PASS
  pool sources failing uniform A2: 0
```

**Artefactos en cuarentena (patrón histórico e2–e5):**  
Scan inline de `batches/ready/assembled-from-verified/quarantine/assembled-exam-a2-verified-e[2-5].json`:

```
assembled-exam-a2-verified-e2.json { B1: 45 } verdict: HAS_B1
assembled-exam-a2-verified-e3.json { B1: 45 } verdict: HAS_B1
assembled-exam-a2-verified-e4.json { B1: 45 } verdict: HAS_B1
assembled-exam-a2-verified-e5.json { B1: 45 } verdict: HAS_B1
```

**Estos exámenes NO están publicados** (solo e1 en catálogo). El pool fuente ya no tiene contaminación B1; los ensamblados viejos en cuarentena **siguen siendo 100% B1 por pregunta**.

### 3.3 — Puerta trasera MIXED (cerrada para A2)

`scripts/assemble-from-pool-verified.mjs:288-291`:
```javascript
if (rawLevel === 'MIXED') {
  console.log(`  skip ${file}: level MIXED (questions/passages disagree) — blocked for official assemble`);
  continue;
}
```

Misma lógica en bundles orales `:338-341`.  
**Nota de riesgo residual:** `inferBatchLevel()` sin levels en preguntas devuelve `'B1'` por defecto (`batchPaths.mjs:41`) — peligroso para legacy, pero el pool A2 actual tiene level en las 185 preguntas.

---

## PARTE 4 — Schreiben A2 (contradicción “circa 80 Wörter”)

### 4.1 — ¿Sigue la contradicción en el pool?

**Veredicto: NO en el pool verificado actual.**

`grep "80 Wörter|circa 80" batches/ready/pool-verified/A2` → **0 matches**.

Archivo real `batches/ready/pool-verified/A2/schreiben-cur-education.json`:
- T1: `"Schreib eine kurze E-Mail (20–30 Wörter)…"`
- T2: `"Schreiben Sie eine E-Mail (30–40 Wörter)…"`

Ensamblador asigna límites técnicos A2 en `oralBundleToParts()` (`assemble-from-pool-verified.mjs:207-210`):
```javascript
lv === 'A2'
  ? { 1: { min: 20, max: 30 }, 2: { min: 30, max: 40 } }
```

**Publicado e1** (`official-de-A2-e1.json`): `minWords: 20, maxWords: 30` (T1) y `30/40` (T2) — **coherente**.

**Contradicción persiste en ensamblados viejos en cuarentena** (no en pool ni en e1 publicado), p.ej. `quarantine/assembled-exam-a2-verified-e3.json`:
```
"Schreiben Sie eine E-Mail (circa 80 Wörter)…"
"minWords": 20, "maxWords": 30
"explanation": "… Wortschatz (0–10) – B1-Niveau … Ca. 80 Wörter …"
```

### 4.2 — Número correcto según formato oficial Goethe A2

Fuente interna alineada al Modellsatz: `library/blueprints/goethe_A2.json`:
- T1 (SMS): `"Schreiben Sie 20–30 Wörter zu allen drei Punkten."`
- T2 (E-Mail Chef): `"Schreiben Sie 30–40 Wörter zu allen drei Punkten."`

**Referencia correcta para A2: 20–30 (T1) y 30–40 (T2), no ~80.**  
“Circa 80 Wörter” es texto residual de plantillas B1 copiadas al ensamblado histórico.

*Desalineación menor en motor legacy:* `js/engine/prompts/PromptBuilder.js:604` usa `{ A2: 60 }` como default `writingWordCount.min` — distinto del blueprint/ensamblador A2, pero no afecta al pool verificado ni a e1 publicado.

---

## PARTE 5 — ¿Puede ensamblarse un examen completo hoy?

### 5.1 — Ensamblado real (dry-run)

Comando: `node scripts/assemble-from-pool-verified.mjs --level A2 --dry-run`

```
══ Capacidad ══
  min stock = 0 examen(es) completo(s)
  cuello de botella: horen_2 = 0
  a ensamblar ahora: 0
exit 1 — FATAL: no se puede ensamblar examen A2
```

**0 exámenes A2 completos** montables hoy sin fallback a B1 ni celdas vacías.

**Regresión respecto a e1 publicado:** e1 usa `horen_2: horen-t2-cur-society` (partIds del ensamblado), archivo que **hoy falla** gate (`Explanation posiblemente no está en alemán`). El examen publicado pasó gates en su momento; **re-ensamblar o re-publicar con el pool actual fallaría en horen_2 y sprechen**.

### 5.2 — ¿Publicado e1 pasa gate1 hoy?

Comando inline con `isExamPublishable` + `checkExamLevelIntegrity` sobre `assembled-exam-a2-verified-e1.json`:

```
published e1 gate1 TODAY: true blocking: 0
CHK-LEVEL: true findings: 0
⚠ GATE_BLOCK_PENDING: 1 finding(s) no bloquean hoy pero lo harán en POOL-5 [CHK-18]
```

**gate1.ok = true, 0 bloqueantes hoy.** Hay 1 finding CHK-18 pendiente (no bloqueante aún).

---

## PARTE 6 — Personalización vocab-bg para A2

### 6.1 — ¿Aplica a A2 o está limitado a B1?

**Veredicto: hardcodeado/limitado a B1 en el punto de ejecución.**

| Archivo | Evidencia |
|---------|-----------|
| `netlify/functions/vocab-bg-generate-background.js:68` | `level: 'B1'` **literal** en `runVocabBgGeneration()` |
| `netlify/functions/vocab-bg-trigger.js:107-114` | Payload a background **no incluye `level`** |
| `netlify/functions/lib/vocabBgState.js:91,102` | Defaults `level = 'B1'` en `classifyWordForBg` / `sourceLevel \|\| 'B1'` |
| `scripts/lib/planVocabBgGeneration.mjs:108` | `const level = ctx.level \|\| 'B1'` |
| Pipeline volumen B1 | `scripts/generar-hasta-50.ps1:30` → `$Level = 'B1'` |

El runner subyacente (`vocabBgRunner.mjs`) **acepta** `opts.level` y es paramétrico, pero **ningún trigger de producción pasa A2**.

### 6.2 — ¿Alguna activación histórica para A2?

| Fuente | Resultado |
|--------|-----------|
| `grep bgGenerated batches/ready/pool-verified/A2` | **0 matches** |
| `grep bgGenerated library/reusable-seed/de_A2.json` | **0 matches** |
| `grep bgGenerated library/reusable-seed/de_B1.json` | **sí** (`"bgGenerated": true` en registros B1) |

**No hay evidencia de generación vocab-bg ejecutada para A2** (ni en pool, ni en seed).

---

## Resumen ejecutivo — fixes históricos vs estado hoy

| Hallazgo auditoría anterior | Estado hoy |
|----------------------------|------------|
| Lesen T4 solo 1 ficha / matching irresoluble | **Corregido** — 6 fichas, 0 claves irresolubles en 4/4 archivos T4 |
| Q20 Kunsthalle clave incorrecta | **Corregido** — `correct: "f"` con explicación coherente |
| Exámenes ensamblados con B1 mezclado | **Pool limpio** (185/185 A2); **e1 publicado limpio** (61/61 A2); **e2–e5 en cuarentena siguen 100% B1** (artefactos viejos) |
| level ausente → fallback silencioso | **Pool actual OK**; MIXED bloqueado en ensamblado; default B1 en `inferBatchLevel` sigue en código para legacy |
| Schreiben “circa 80” vs 20–30 | **Pool y e1 publicado OK**; texto “circa 80” + rubric B1 **persiste en ensamblados en cuarentena** |
| Capacidad de ensamblar | **0 exámenes hoy** — nuevos cuellos: **horen_2=0**, **sprechen=0** post-gates |
| Pipeline generación volumen | **No equivalente B1** — pool 97.5% curado; vocab-bg **solo B1** |

---

## Decisión informada (sin plan de arreglo)

A2 **no está listo para generar contenido en volumen** con las mismas garantías que B1:

1. **No hay pipeline operativo** equivalente a `generate-lesen-part-gemini` / `generar-hasta-50.ps1` para A2.
2. **El pool bruto parece suficiente (4–5/celda)** pero **post-gates no alcanza para 1 examen** (horen_2, sprechen_3).
3. **Integridad de nivel en pool fuente: resuelta.** Riesgo residual en artefactos viejos en cuarentena, no en catálogo live.
4. **Personalización vocab-bg: no aplica a A2** hoy.
5. **Antes de prometer más exámenes A2**, hay que cerrar gates en horen_2 y sprechen_3 (y opcionalmente reforzar lesen_2, horen_4 por debajo del mínimo post-gate).
