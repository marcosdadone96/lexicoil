# A2 Lesen T4 — Diseño `content_topic_mismatch` (batch-level)

**Fecha:** 2026-08-01  
**Estado:** Diseño aprobado para revisión — **sin implementación**  
**Celda:** `A2:lesen:T4` · `ATTEMPTED_NEVER_PUBLISHED` · 112 rechazos históricos · 0 gemini en pool  
**Evidencia de calibración:** `a2-lesen-t4-topic-calibration-2026-08-01.json`  
**Script reproducible:** `scripts/audit-a2-lesen-t4-topic-calibration.mjs`

---

## 1. Problema

A2 Lesen T4 es **matching de 6 Anzeigen + 5 situaciones con persona**. El planificador fija un eje (`topicTag`: Stadtleben, Freizeit, Sport, …) pero el formato Goethe **requiere variedad** de sub-ofertas (cursos, deporte, talleres, jardín, etc.) bajo ese eje urbano.

El gate actual (`checkPassageContentTopic` en `poolReadyCheck.mjs` L428–451) evalúa **cada anuncio aislado** con keywords rígidas (`js/engine/partTopicDetect.js` + `contentTopicCheck.mjs`). Si un anuncio acumula más hits en un sub-tema (p. ej. Bildung por «Kurs», Sport por «Yoga») que en el tag pedido, rechaza el batch entero.

### Asimetría pipeline

| Etapa | Comportamiento actual |
|-------|----------------------|
| **Generación** (`generate-lesen-part-gemini.mjs` L1058–1090) | Solo chequea **pasaje 0**; salta `assessT4TopicAlignment` para A2/B2 |
| **poolReady** | Chequea **los 6 pasajes** → REJECT al primer mismatch |

Resultado: batches que pasan calidad pedagógica y retry Gemini fallan al publicar por `content_topic_mismatch`.

### Caso canónico — `lesen-t4-gemini-099.json` (Stadtleben)

| Anuncio | Contenido | Gate actual | Scores (tag / best) |
|---------|-----------|-------------|---------------------|
| a | Stadtführung | OK | Stadtleben 1 |
| b | Gemeinschaftsgarten | OK | Stadtleben 2 |
| **c** | Deutsch A2-Kurs | **FAIL** | Stadtleben 1 / **Bildung 2** |
| **d** | Fahrrad-Werkstatt | **FAIL** | tagScore **0** / Bildung 1 |
| e | Kochkurs | OK | empate multi-tema |
| **f** | Fitnessstudio | **FAIL** | Stadtleben 1 / **Sport 2** |

**3/6 anuncios bloquean** un batch pedagógicamente válido.

---

## 2. Solución propuesta — Opción B (principal)

### 2.1 Principio

Evaluar el **batch como unidad**, no cada anuncio como un mini-examen monotemático. Un eje de celda (Stadtleben, Freizeit, …) es un **paraguas de planificación**; los 6 anuncios deben ser diversos pero **coherentes en conjunto** con ese eje.

Precedente interno: Hören A2 T1/T3 trata `content_topic` como **audit-only** en segmentos multi-tema bajo un `topicTag` paraguas (`poolReadyCheck.mjs` L391–395).

### 2.2 Nueva función (diseño)

```text
checkLesenA2T4BatchTopic(batch) → { ok, rule, detail? }
```

**Scope:** `level === 'A2' && module === 'lesen' && teil === 4` únicamente. B1 T4 (foro/debate) y B2 T4 mantienen gates existentes.

**Entrada:** `batch.topicTag` (o `_requestedTopic`), `batch.passages[]` (6 anuncios).

**Algoritmo propuesto (orden de evaluación):**

1. **Agregación léxica** — Sumar `scorePassageTopics` de los 6 pasajes → `aggScores`, `tagAgg`, `bestAgg`, `bestTopic`.

2. **PASS — batch_tag_wins** — Si `bestTopic === tag` y `tagAgg > 0`.

3. **PASS — majority_supported** — Si ≥ **4/6** pasajes cumplen:
   - `tagScore > 0` en ese pasaje (con extras Option A, ver §3), **o**
   - `topicsAreCompatible(tag, detected)` (`topicFamilies.mjs`).

4. **FAIL — incompatible_dominates_batch** — Si existe tema `bestTopic ≠ tag` con:
   - `bestAgg > tagAgg`, **y**
   - `bestAgg - tagAgg >= 2`, **y**
   - `topicsAreCompatible(tag, bestTopic).match === false`.

5. **FAIL — multiple_hard_passage_mismatch** — Si ≥ **2** pasajes tienen mismatch fuerte bajo gate legacy:
   - margen `bestScore - tagScore >= 2`, familia incompatible, **y**
   - no es caso `tagScore=0 && bestScore=0`.

6. **PASS — borderline_pass** — Resto (un solo pasaje borderline, empates, sub-temas adyacentes).

### 2.3 Umbral mayoría: ≥4/6

| Umbral | Flips sobre fallos actuales | Notas |
|--------|----------------------------|-------|
| ≥3/6 | 38/47 (81%) | Idéntico en corpus — no más permisivo |
| **≥4/6** | **38/47 (81%)** | **Recomendado** — exige mayoría clara sin ser más laxo |
| ≥5/6 | 38/47 (81%) | Idéntico — el cuello no es el umbral sino el modo per-passage |

**Recomendación:** **≥4/6** por claridad semántica («la mayoría de anuncios apoyan el eje») aunque en el corpus actual 3/6 daría el mismo resultado.

### 2.4 Wiring (cuando se implemente)

| Archivo | Cambio |
|---------|--------|
| `scripts/lib/lesenA2T4TopicGate.mjs` | **Nuevo** — `checkLesenA2T4BatchTopic` |
| `scripts/lib/poolReadyCheck.mjs` | Sustituir loop per-passage L428–451 por batch gate para A2 T4 |
| `scripts/generate-lesen-part-gemini.mjs` | Usar mismo gate en L1058–1075 (simetría gen ↔ publish) |
| `scripts/lib/__tests__/lesen-a2-t4-batch-topic.test.mjs` | Tests: gemini-099 PASS, Gesundheit-dominated FAIL |

---

## 3. Complemento — Opción A mínima (tagScore=0)

Solo para anuncios donde el tag pedido no obtiene **ningún** hit léxico pese a ser válidos en contexto urbano.

### 3.1 Keywords extras propuestos

Nuevo mapa `LESEN_A2_T4_TAG_ZERO_EXTRAS` (en el gate o `contentTopicCheck.mjs` scoped a A2 T4):

| topicTag | Keywords a añadir |
|----------|-------------------|
| **Stadtleben** | `Werkstatt`, `Stadtführer`, `Fahrrad`, `Radfahren`, `Mobilität`, `Gemeinschaftsgarten` |
| **Verkehr** | `Fahrrad`, `Rad`, `Werkstatt`, `Mobilität` |
| **Freizeit** | `Gemeinschaftsgarten`, `Kochkurs` |

**No** ampliar adyacencias globales ni familias completas — solo evitar FAIL por `tagScore=0` en anuncios cortos (20–60 palabras) donde el detector base no alcanza.

### 3.2 Efecto en gemini-099

Con extras, anuncio **d** (Fahrrad-Werkstatt) pasa de `tagScore=0` → **Stadtleben 4** (Werkstatt + Fahrrad + Mobilität). Batch completo: **6/6 supported**, `tagAgg=11`, PASS.

---

## 4. Calibración contra corpus histórico

### 4.1 Metodología

- **Corpus:** 52 batches A2 Lesen T4 únicos en `batches/{generated,needs-regeneration,ready}/**`
- **Gate actual simulado:** per-passage `checkPassageContentTopic` (igual que poolReady)
- **Gate propuesto:** algoritmo §2 + extras §3
- **Nota sobre «112 rechazos»:** el audit de madurez cuenta **eventos de rechazo** (múltiples intentos/retry por archivo). El corpus tiene **52 archivos únicos**; **47** fallan hoy per-passage.

### 4.2 Resultados

| Métrica | Valor |
|---------|-------|
| Batches únicos | 52 |
| Fallan gate actual (per-passage) | **47** (90%) |
| Pasarían gate propuesto (de esos 47) | **38** (**81% flip rate**) |
| Seguirían fallando | **9** (19%) |
| Falsos positivos (OK actual → FAIL propuesto) | **0** |

### 4.3 Batches que el diseño **sí destraba** (muestra)

| Archivo | Tema | Fallos actuales | Regla propuesta |
|---------|------|-----------------|-----------------|
| `lesen-t4-gemini-099.json` | Stadtleben | 3 | majority_6_of_6 |
| `lesen-t4-gemini-071-*` (varios) | Freizeit | 3–4 | batch_tag_wins / borderline |
| `lesen-t4-gemini-071-*` Sport | Sport | 1–2 | batch_tag_wins |
| `lesen-t4-gemini-072-*` Sport | Sport | 1–2 | batch_tag_wins |

### 4.4 Batches que el diseño **sigue rechazando** (correcto)

9 batches, casi todos tema **Gesundheit** con dominancia incompatible en agregado:

| Patrón | Regla | Interpretación |
|--------|-------|----------------|
| 4–6 pasajes mismatch | `incompatible_dominates_batch` | Contenido realmente no es Gesundheit — regeneración legítima |
| Mezcla Sport/Freizeit bajo Gesundheit | `incompatible_dominates_batch` | Tag incorrecto o generación desalineada |

**Conclusión:** el diseño destraba el cuello de botella Stadtleben/Freizeit/Sport sin abrir la puerta a batches genuinamente off-topic.

---

## 5. Costo / beneficio

| | Opción B (batch) | Solo Option A (keywords) |
|--|------------------|--------------------------|
| Destraba celda T4 | **Alta** (81% flips) | Parcial (~tagScore=0) |
| Riesgo FP | Bajo (0 en corpus) | Medio si se expande mucho |
| Mantenimiento | Medio (1 módulo + tests) | Alto si crece por eje |
| Alineación pedagógica | **Alta** | Baja |

**Decisión de diseño:** B principal + A mínima para tagScore=0.

---

## 6. Fuera de scope (gates T4 separados)

Estos siguen bloqueando T4 pero **no** son `content_topic_mismatch`:

| Gap | Severidad | Acción futura |
|-----|-----------|---------------|
| `TITLE_PUNCTUATION` | medium | Prompt `lesen-teil4.md` |
| `EXPL_MATCHING_MIN` (≥3 palabras) | medium | Prompt + repair determinista |
| Mini-situaciones persona (CHK) | high (sesión jul-23) | Ya en plantilla; verificar gate |

---

## 7. Plan de implementación (cuando se retome T4)

1. Crear `lesenA2T4TopicGate.mjs` con algoritmo §2 + extras §3.
2. Tests unitarios con fixtures: `gemini-099` (PASS), batch Gesundheit-dominated (FAIL), curated pool A2 T4 (PASS).
3. Wire en `poolReadyCheck` + `generate-lesen-part-gemini`.
4. Re-ejecutar calibración; objetivo: ≥80% flip, 0 FP en pool-verified A2 T4 curado (4 archivos).
5. **Sin Gemini** para validar — solo re-scan pool + 1 smoke generate cuando se apruebe presupuesto.

---

## 8. Referencias de código

```428:451:scripts/lib/poolReadyCheck.mjs
      for (const p of batch.passages || []) {
        if (!p?.topicTag && !batch.topicTag) continue;
        const tagged = { ...p, topicTag: batch.topicTag || p.topicTag };
        const ct = checkPassageContentTopic(tagged);
        if (ct.mismatch) {
          // ... per-passage REJECT for Lesen T4
        }
      }
```

```162:199:scripts/lib/qualityGates/contentTopicCheck.mjs
export function checkPassageContentTopic(passage) {
  // A) best !== tag && bestScore > tagScore && incompatible
  // B) tagScore === 0 && bestScore === 0
}
```

```15:26:scripts/lib/qualityGates/topicFamilies.mjs
export const TOPIC_FAMILY_GROUPS = [
  // Stadtleben ∈ {Wohnen, Konsum, Stadtleben} — Sport/Bildung NO son familia
];
```

---

*Generado 2026-08-01. Pendiente implementación.*
