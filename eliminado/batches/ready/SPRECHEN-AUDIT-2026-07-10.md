# Sprechen — auditoría 2026-07-10 (fixes deterministas + hallazgos abiertos)

Primera pasada sobre 11 muestras (`para-claude-verificacion/muestras-sprechen-auditoria-2026-07-10/`).
Arquitectura Gemini vs merged: **no resuelta** (decisión operador).

---

## Fixes aplicados (esta tarea)

| ID | Hallazgo | Fix |
|----|----------|-----|
| **SP-AUD-1** | Markdown `*   ` / `- ` en `questions[].question` (passages vacíos) | `stripMarkdownLeakInBatch` (AUD-4c) + reproceso backlog Sprechen |
| **SP-AUD-2** | `skills: ["speaking","speaking"]` (y triples) en merged | Dedup en `normalizeSkills` + limpieza determinista del backlog |

**Schreiben:** escaneo de `batches/generated|merged/schreiben*.json` → **0** preguntas con markdown `*`/`-` de viñeta. Misma arquitectura (`passages: []`); el strip en `question` las cubre por si aparece en el futuro.

---

## Corrección de contenido — candidatos (NO editar automáticamente)

Mismo formato que `lesen-t2-gemini-084` en Q2-RECALIBRATION-REPORT.

| Archivo | Ítem | Problema | Acción propuesta |
|---------|------|----------|------------------|
| **`sprechen-gemini-001.json`** | T1 (`gen-q-sp-t1-21ad5163-q1`) | «Haben Sie Angst, dass es am Ende doch viel **zu teurer** wird?» — predicativo mal declinado (`teuer` invariable aquí) + registro raro en viñeta de examen | Corrección directa de prosa en el JSON (p. ej. «…teurer wird als erwartet?» / reformular sin «Angst») — revisión humana |
| **`sprechen-gemini-003.json`** | T1 | Paréntesis incoherente: «Freunde, die vielleicht nicht mehr wissen, dass sie noch **ledig** ist» — contenido mal encajado / alucinado | Reescribir o eliminar la cláusula; no auto-fix |
| **`sprechen-gemini-003.json`** | T2 | «bei **der** Verkehrsnetz» — concordancia (neutro → «beim Verkehrsnetz» / «bei dem Verkehrsnetz») | Corrección directa de contenido |

---

## SP-AUD-3 — topicTags `daily_life` (vía Gemini) — diagnóstico, sin fix

**Alcance:** 8/8 `batches/generated/sprechen-gemini-*.json` tienen `topicTags: ["daily_life"]` en las 3 preguntas. Ninguno tiene `topicTag` / `_requestedTopic` en raíz.

**Causa técnica (no arreglar aún):**

1. `normalizeBatch` → `normalizeTopicTags(...) || ['daily_life']` estampa fallback si el LLM no trae tags útiles.
2. `tagBatchWithTopic(batch, chosenTopic)` solo escribe `batch.topicTag` + `passages[].topicTag` — **no** toca `questions[].topicTags`. En Sprechen `passages: []`, el tema elegido no llega a ningún campo que el auditor vea en las consignas.
3. `getTopicStats` / rotación cuentan solo `passages[].topicTag` → para Sprechen la rotación no aprende del banco generado.
4. El pipeline **sí** llama `pickNextTopic` + `injectTopicIntoPrompt` + `tagBatchWithTopic` en `generatePartGeminiLib.mjs`; el fallo es el **gap question-level**, no la ausencia total de topic rotation.
5. Merged tiene topicTags variados porque se escribieron a mano / otro flujo — no porque Gemini los propague bien.

**Decisión pendiente:** conectar Sprechen al mismo stamping de `questions[].topicTags` vs esperar arquitectura Gemini-vs-merged.

---

## SP-AUD-2 — skills duplicado — diagnóstico

**Origen:** `normalizeSkills` mapeaba `sprechen` → `speaking` y `speaking` → `speaking` **sin dedup**. Entrada `["speaking","sprechen"]` (o repeticiones del LLM) → `["speaking","speaking"]`.

**Alcance merged (antes del fix):** 11 archivos / 33 preguntas con dup (no solo gesund-leben-02 y stadtfest-planung-01):

- ehrenamt-thema-03 (×3), gesund-leben-02, onlineshopping-04, reise-vorbereitung-02/04/05, sport-praesentation-02/03/04/05, stadtfest-planung-01

Generated Gemini: 0 dups (skills ya `["speaking"]` simple).

---

## Taxonomía (SP-2.5) — decisiones aplicadas

| Campo | Decisión |
|-------|----------|
| `type` | Enum canónico `planungsaufgabe` / `praesentation` / `feedback_diskussion` por Teil; migrado en pool |
| `topicTags` | Mapa EN→B1 (`culture`→Kultur, …); `tagBatchWithTopic` etiqueta `questions[]`; backfill CSV en `SPRECHEN-TOPICTAGS-BACKFILL-2026-07-10.csv` |
| `difficulty` | Fijado a **5** (el campo se consume en blueprint/calibration/schema — no eliminar) |

## Preguntas abiertas restantes (operador)

1. ¿Auditar/promover el banco actual o congelarlo hasta producto STT/Pro?
2. ¿Formato canónico: Gemini vs merged (grammarTags/vocabularyTags)?
3. ¿Set T1+T2+T3 juntos o bank por Teil?
4. ¿`writing-speaking.json` (12 prompts) entra en la misma auditoría?
5. Revisar CSV topicTags + pares de premisas: cuál conservar en cada duplicado temático.
