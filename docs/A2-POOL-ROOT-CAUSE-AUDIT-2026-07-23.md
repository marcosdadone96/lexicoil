# A2 Pipeline — Auditoría retroactiva + fixes de raíz (causas A–F)

**Fecha:** 2026-07-23  
**Alcance:** `batches/ready/pool-verified/A2` (59 archivos pre-remediación → 50 servibles post-remediación)  
**Scripts:** `scripts/audit-a2-pool-root-causes.mjs`, `scripts/backfill-a2-pool-metadata.mjs`, `scripts/remediate-a2-pool-root-causes.mjs`, `scripts/smoke-a2-root-cause-fixes.mjs`

---

## Resumen ejecutivo

| Causa | Pre-fix (pool completo) | Fix forward | Pool existente |
|-------|-------------------------|-------------|----------------|
| **B** T2 convergencia | 24 pares / 13 T2 | `horenT2ActivityScheduleBank` + prompt obligatorio | Retirados 070, 071, 073, 074 |
| **C** Nombres no rotados | 3 elencos duplicados (T3×4, T2×3) | `dialogueNamesBank` transversal | Retirados 041, 042 |
| **A** Vocab forzado | 4/4 Lesen gemini con userVocab | Gate `vocabNarrativeCoherence` en T1 | Retirados 196, 197, 199 |
| **D** vocabularyTags reciclados | 31/59 arch, 122/255 preg (47,8%) | `questionSpecificVocabBlob` v2.3.13 | Backfill 50 archivos |
| **E** grammarTags incorrectos | 1 topic-leak, 32 batches idénticos | `sanitizeGrammarTags` + `forceGrammar` | Backfill + sin `fillGrammarDefaults` ciego |
| **F** Lemas rotos | 6 hits | `LEMMA_GROUND_TRUTH` | Corregidos en backfill |

**Prueba de fuego (sin API):** `smoke-a2-root-cause-fixes.mjs` — 6/6 schedules distintos, 5/6 elencos T3 distintos, gate A bloquea patrón 199.  
**Unit tests:** `enrichBatchMetadata.vocab.test.mjs` — 143/143 OK.

---

## CAUSA B — Convergencia diálogo/plantilla Hören T2

### 1. Escaneo pool-verified/A2 (pre-fix)

- **13 archivos** Hören T2 (gemini + cur).
- **24 pares** con ≥8 five-gramas compartidos o misma secuencia de claves a–i.
- Evidencia confirmada: `horen-t2-gemini-069` ↔ `070` — 24 five-gramas, keys `a-b-c-d-h` idénticas.
- Patrón dominante: Montag→a, Dienstag→b, Mittwoch→c, Donnerstag→e, Freitag→i/h (5 de 9 actividades fijas).

### 2. Diagnóstico (código)

- Rotación de **aperturas** existía (`horenOpeningsBank.mjs`) pero **no** de secuencia día↔actividad.
- Plantilla A2 T2 fija banco a–i; el modelo converge al mismo plan semanal.
- `ACTIVITY_HINTS` en `horenPictureMatching.js` solo valida, no varía generación.

### 3. Fix forward

- Nuevo banco: `data/horen-t2-activity-schedules-bank.json` (8 schedules, 5 claves distintas cada uno).
- Picker: `scripts/lib/horenT2ActivityScheduleBank.mjs` — exclusión pool + sesión (patrón openings).
- Cableado en `generatePartGeminiLib.mjs` + `examTemplatePrompt.mjs` → bloque **PLAN SEMANAL OBLIGATORIO**.

### 4. Pool existente

| Acción | Archivos |
|--------|----------|
| **Conservar** | 067, 068, 069, 072, 040 + cur-* |
| **Retirar → needs-regeneration/A2** | 070, 071, 073, 074 |

### 5. Prueba n=6

```
≥4 schedules distintos en 6 picks (actual: 6/6) ✅
```

---

## CAUSA C — Elenco de nombres no rotado

### 1. Escaneo (A2 + B1)

**A2 Hören con diálogo:** 22 archivos T1/T2/T3.

| Par | Archivos A2 |
|-----|-------------|
| Emma+Jonas | 9 |
| Clara+Tobias, Sophie+Tim, Laura+Niklas, Nina+Paul | 4–5 c/u (elenco T3 clonado) |
| Lena+Max | 3 (T2 gemini) |
| Anna+Tom | 4 pre-fix |

**Elencos idénticos (cast signature):**
- T3: `039, 040, 041, 042` — mismo 5-pares (Jonas/Emma … Tobias/Clara).
- T2: `Lena+Max` en 040, 068, 069.

**B1 (histórico):** pares dominantes en pool B1 Hören T3 documentados en scan (`b1TopPairs` en JSON audit).

### 2. Diagnóstico

- `horenT3NamesBank.mjs` listaba pares en prompt pero **`pickHorenT3NamePair()` nunca cableado**.
- Sin exclusión persistida (a diferencia de `titleVariantBank` / `horenOpeningsBank`).

### 3. Fix forward

- Banco transversal: `data/dialogue-names-bank.json` + `scripts/lib/dialogueNamesBank.mjs`.
- `pickDialogueNameCast(N)` con exclusión pool-verified + usage file.
- Prompt obligatorio por segmento en T1/T2/T3 A2 vía `buildDialogueNamesPromptBlock`.

### 4. Pool existente

| Acción | Archivos |
|--------|----------|
| **Conservar** | horen-t3-gemini-039, 040, 043, 044 |
| **Retirar** | horen-t3-gemini-041, 042 |

### 5. Prueba n=6

```
≥4 elencos T3 distintos en 6 picks (actual: 5/6) ✅
```

---

## CAUSA A — Vocabulario forzado rompiendo coherencia

### 1. Escaneo Lesen + userVocabFeedback (pre-fix)

**4/4** archivos gemini T1 con vocab solicitado flagueados por solapamiento léxico bajo:

| Archivo | Palabras desconectadas |
|---------|------------------------|
| lesen-t1-gemini-199 | stipendium, krankenhaus, selten, perfekt |
| lesen-t1-gemini-196 | klavier |
| lesen-t1-gemini-197 | schriftlich, situation |
| lesen-t1-gemini-200 | landschaft |

Heurística: Jaccard ≤0,07 y <2 tokens compartidos entre frase objetivo y resto del párrafo.

### 2. Diagnóstico

- `attachVocabFeedback` (`generationFeedback.mjs`) **solo mide ratio**, no rechaza.
- Prompt dice «omite si no encaja» pero no hay gate post-gen (T5 sí tiene gate duro en `lesenT5SubtypeVocab.mjs`).
- 199 pasó porque todas las palabras aparecen superficialmente (`ratio: 1`); 200 en el mismo run habría sido descartada manualmente por calidad — no por pipeline.

### 3. Fix forward

- Nuevo módulo: `scripts/lib/vocabNarrativeCoherence.mjs`.
- Gate en `generate-lesen-part-gemini.mjs` T1 post-`attachVocabFeedback` → descarta con `vocab-narrative-coherence`.

### 4. Pool existente

| Acción | Archivos |
|--------|----------|
| **Retirar** | 196, 197, 199 |
| **Conservar** | 200 (1 flag marginal «landschaft» — revisar en regen si persiste) |

### 5. Prueba

Gate bloquea batch sintético con patrón Krankenhaus/Stipendium de 199 ✅

---

## CAUSA D — vocabularyTags reciclados

### 1. Escaneo (formato B1: archivos / preguntas)

**Pre-fix:** **31/59 archivos (52,5%)**, **122/255 preguntas (47,8%)** con tags no presentes en blob pregunta-específico.

Confirmado en evidencia manual: 199, 200, 069, 070 — mismas tags en las 5 preguntas T2.

### 2. Diagnóstico

- `questionSpecificVocabBlob` incluía **`passage.text` completo** para MCQ y matching → mismo pool léxico para todas las preguntas del batch.
- `ensureDistinctQuestionVocabTags` reparte pero desde el mismo passage compartido.
- Hören matching sin `options[]` no resolvía label de picture (`matchingOptionText` retornaba null).

### 3. Fix forward

- **v2.3.13:** blob = pregunta + opción correcta / label picture + explicación (solo matching a–i).
- Sin passage completo. `matchingOptionText(q, passage)` lee `pictures[]`.
- Versión: `VOCAB_TAGS_NORMALIZE_VERSION = v2.3.13-per-question-blob-no-passage-2026-07-23`.

### 4. Backfill pool

```bash
node scripts/backfill-a2-pool-metadata.mjs --sample 3   # muestra OK
node scripts/backfill-a2-pool-metadata.mjs              # 50/50 archivos restantes
```

Campos añadidos: `_metadataBackfillAt`, `_metadataBackfillNote`, `_vocabTagsNormalizeVersion`.

### 5. Nota post-backfill

El audit D por substring literal puede sobrecontar (lemas ≠ superficie). Validación manual en muestra: T2 ahora tags por día (`fahren/Fahrrad/Montag` vs `Deutschkurs/…`) — distintos por pregunta.

---

## CAUSA E — grammarTags incorrectos

### 1. Escaneo

| Síntoma | Pre-fix | Post-backfill |
|---------|---------|---------------|
| `grammarTags` = `topicTag` (ej. «Arbeit») | **1** (lesen-t1-gemini-199) | **0** |
| Todas las preguntas mismo `grammarTags` | **32** archivos | **16** (Hören T2 sin señal gramatical → `[]` válido) |

### 2. Diagnóstico

- Gemini emitía `grammarTags: ["Arbeit"]`; `enrichBatchMetadata` **no sobrescribía** tags existentes inválidos.
- `fillGrammarDefaults: true` en Hören T2 rellenaba **idéntico** `g-de-b1-perfekt` + `g-de-b1-nebensatz` en las 5 preguntas cuando inferencia vacía.

### 3. Fix forward

- `sanitizeGrammarTags` / `isValidGrammarTag` — solo `g-de-b1-*`.
- Tags inválidos → re-inferencia forzada.
- `finalizePoolReady.mjs`: `fillGrammarDefaults: false`, `forceGrammar: true` solo T2 matching.

### 4. Backfill

Incluido en `backfill-a2-pool-metadata.mjs` con `forceGrammar: true`.

---

## CAUSA F — Lemas rotos/truncados

### 1. Escaneo

**Pre-fix:** 6 hits (`interessanen`, `kaputen`, `direken`, `hingegangen`, `prägnanen`, …).  
**Post-backfill:** 2 hits residuales en archivos cur (revisar en próxima regen).

### 2. Fix

```javascript
// enrichBatchMetadata.mjs
const LEMMA_GROUND_TRUTH = {
  interessanen: 'interessieren',
  kaputen: 'kaputt',
  direken: 'direkt',
  hingegangen: 'hingehen',
};
```

+ `FINITE_TO_INF`: `hingegangen → hingehen`.

---

## Archivos retirados de pool-verified

Movidos a `batches/needs-regeneration/A2/` con `_poolRetiredReason: A2-root-cause-audit-2026-07-23`:

1. lesen-t1-gemini-196.json  
2. lesen-t1-gemini-197.json  
3. lesen-t1-gemini-199.json  
4. horen-t2-gemini-070.json  
5. horen-t2-gemini-071.json  
6. horen-t2-gemini-073.json  
7. horen-t2-gemini-074.json  
8. horen-t3-gemini-041.json  
9. horen-t3-gemini-042.json  

---

## Comandos de regresión

```bash
# Escaneo completo
node scripts/audit-a2-pool-root-causes.mjs
node scripts/audit-a2-pool-root-causes.mjs --json > docs/audit-a2-pool-post-fix.json

# Smoke B+C+A (n=6 lógico)
node scripts/smoke-a2-root-cause-fixes.mjs

# Unit vocab/grammar metadata
node scripts/lib/__tests__/enrichBatchMetadata.vocab.test.mjs

# Volumen real (requiere API — script existente)
node scripts/_volume-a2-3cells.mjs
```

---

## Deuda / seguimiento

1. **Lesen T1 `options_missing` en fix-retry** (volumen previo) — track separado, no bloqueado por este audit.
2. **T2 cur + gemini 040/068/069** aún comparten Lena+Max o keys similares — fixes forward evitan nuevas convergencias; regen opcional de esos 3 si se quiere diversidad inmediata.
3. **Prueba de fuego con API** (5+ gen/celda) pendiente de ejecutar con `_volume-a2-3cells.mjs` cuando haya cuota.
