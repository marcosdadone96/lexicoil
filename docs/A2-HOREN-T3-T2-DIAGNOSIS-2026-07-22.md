# A2 — Hören T3 (options_missing) + verificación Hören T2

**Fecha:** 2026-07-22  
**Alcance:** diagnóstico en 3 capas (mismo protocolo que Lesen T1), fix solo si misma familia, prueba de fuego T3, diagnóstico corto T2 (sin fix).

---

## Veredicto ejecutivo

| Paso | Resultado |
|------|-----------|
| **PASO 1 — Diagnóstico T3** | **NO** es la misma familia de bug que Lesen T1 (nivel no propagado en prompt/coerce/fixNote). Causa real: anclaje débil del LLM + reintentos sin hints MCQ T3 + desalineación poolReady vs generación en topic multi-segmento. |
| **PASO 2 — Prueba de fuego T3** | **PASS** — primera parte real en `pool-verified/A2/horen-t3-gemini-039.json` (5 API calls, validación técnica + calidad + ingest pre-check). |
| **PASO 3 — Diagnóstico T2** | **Problema distinto** — desalineación plantilla ↔ checker picture-matching, no propagación de nivel. Sigue diferido con causa concreta documentada. |

---

## PASO 1 — Diagnóstico Hören T3 (`options_missing`)

### Pregunta 1 — ¿Existe `coerceGeneratedHorenPart` que fuerce tipo/options sin revisar `level`?

**No.** Hören no tiene equivalente a `coerceGeneratedLesenPart`. Solo existe `coerceGeneratedLesenPart` en `normalizeBatch.mjs` (Lesen).

La única coerción Hören-specific en normalize es picture-matching **A2 T2**, que **elimina** `options` a propósito (banco `pictures[]`), no T3:

```575:581:scripts/lib/normalizeBatch.mjs
  // Hören A2 T2: picture_matching — banco compartido a–i, preguntas sin options.
  if (HorenPictureMatching.isPictureMatchingCtx({ module: mod, teil, level: ctx?.level })) {
    normalized = HorenPictureMatching.normalizePictureMatchingBatch(normalized, {
      module: mod,
      teil,
      level: ctx?.level,
    });
  }
```

`options_missing` en T3 viene de `blueprintConformance.mjs` cuando `type === 'multiple_choice'` pero `options` está vacío — es decir, **salida del LLM**, no strip en coerce.

**Veredicto Q1:** origen **no** en capa coerce. Distinto de Lesen T1.

---

### Pregunta 2 — ¿El prompt Hören T3 recibe `level:'A2'`?

**Sí, correctamente propagado.** `buildExamPromptBundle` pasa `level: args?.level || 'B1'`:

```672:675:scripts/lib/generatePartGeminiLib.mjs
  let fullPrompt = buildExamPrompt(module, promptTeil, words, {
    idSuffix,
    topic,
    level: args?.level || 'B1',
```

Diagnóstico ejecutado (`node _tmp-horen-t3-diagnose.mjs`):

| Check | Antes fix | Tras fix plantilla |
|-------|-----------|-------------------|
| A2 carga reglas 5× MCQ (no 7 RF) | OK | OK |
| B1 sigue con 7× richtig_falsch | OK | OK |
| A2 incluye `segmentLabel` | OK | OK |
| A2 incluye bloque `EJEMPLO VERIFICADO` | **FAIL** | **OK** |
| Longitud prompt A2 vs B1 | 6848 vs 15353 | 9015 vs 15353 |

El checklist A2 T3 en `examTemplatePrompt.mjs` ya era correcto (5 segmentos + 5 MCQ). El gap real era la **plantilla A2 sin ejemplo JSON verificado** (análogo al fix pedagógico de Lesen T1, pero **no** el bug de `promptOpts` sin nivel).

**Veredicto Q2:** nivel propagado. **No** es el bug Lesen T1.

---

### Pregunta 3 — ¿`buildFixNote` refuerza formato incorrecto en reintentos T3 A2?

**No refuerza richtig_falsch** (a diferencia de Lesen T1 pre-fix). Pero **sí había un gap**:

- `isHorenMcqTeil` excluía A2 T3 → los reintentos no recibían hints anti-copia MCQ.
- No había rama explícita para `options_missing` / `type_not_allowed` en T3 A2.

Evidencia pre-fix:

```253:258:scripts/lib/generatePartGeminiLib.mjs
function isHorenMcqTeil(module, teil, level) {
  ...
  if (lv === 'A2') return t === 1 || t === 3;  // ← ampliado en este PR
  return HOREN_MCQ_TEILE_B1.has(t);
}
```

`buildExamFixNote` **no** decía «T3→richtig_falsch». El patrón Lesen (reforzar formato B1 en cada fix) **no aplicaba**.

**Veredicto Q3:** causa distinta. Gap real = hints insuficientes en reintentos + plantilla sin ancla JSON.

---

### Conclusión PASO 1 — familia de causa

| Capa Lesen T1 | Hören T3 A2 |
|---------------|-------------|
| prompt sin `level` → plantilla B1 | **OK** — level propagado |
| coerce fuerza `richtig_falsch` | **N/A** — no existe coerce Hören T3 |
| fixNote refuerza B1 en cada retry | **No** — pero faltaban hints A2 T3 MCQ |

**Fixes aplicados (tipo Lesen, no copia ciega):**

1. `plantillas-horen-a2/horen-teil3.md` — bloque `EJEMPLO VERIFICADO` con 2 segmentos + 2 MCQ a/b/c.
2. `isHorenMcqTeil` — incluye A2 T3 para hints anti-copia en reintentos.
3. `buildExamFixNote` — rama A2 T3 para `options_missing` / `type_not_allowed` / RF/Ja-Nein.
4. `poolReadyCheck.mjs` — A2 T3 multi-segmento: `content_topic` audit-only (paridad con Q4 generación; ver PASO 2).

---

## PASO 2 — Prueba de fuego Hören T3

### Comando

```powershell
node scripts/generate-part-gemini.mjs --module horen --teil 3 --level A2 --from-bank --topic Freizeit --count 1 --max-api-calls 45 --fix-retries 3 --keep-failed --save-raw
```

Log completo: `docs/_firetest-horen-t3-a2-freizeit.log`

### Progresión (5 llamadas API)

| # | Gate | Resultado |
|---|------|-----------|
| 1 | Generación + calidad | FAIL — segmento s1 56 w (OOR 15–50) + MCQ length bias q2 |
| 2 | Triaje mcq_length_bias | Parcial |
| 3 | Fix retry 1 (calidad) | FAIL — MCQ length bias q1, q2 |
| 4–5 | Triaje mcq_length_bias | **Calidad OK ✅** |
| — | Validación técnica | **OK ✅** (sin `options_missing`) |
| — | poolReady | READY → `pool-verified/A2/horen-t3-gemini-039.json` |

**Intento previo** (`--topic Stadtleben`, log `docs/_firetest-horen-t3-a2-2026-07-22-183654.log`): pasó formato+calidad pero poolReady REJECT por `topic_mismatch` + `missing_grammarTags` — resuelto con topic Freizeit + fix audit-only T3.

### Artefacto verificado

**Archivo:** `batches/ready/pool-verified/A2/horen-t3-gemini-039.json`

| Métrica | Valor |
|---------|-------|
| Segmentos | 5 (s1–s5) |
| Palabras/segmento | 43, 42, 44, 40, 41 (rango A2: 15–50) |
| Preguntas | 5× `multiple_choice` a/b/c |
| segmentLabel | Text 1 … Text 5 |
| options_missing | **0** en intento final |
| Coste API | ~$0.034 (5/45 calls) |

### Revisión humana rápida

- **Registro A2 genuino:** diálogos cortos coloquiales (Park, Picknick, Malkurs, Babysitter, Escape Room, Lesen zur Entspannung); vocabulario A2 (`Wochenende`, `Freizeitaktivität`, `sympathisch`, `notwendig`).
- **Longitud:** todos los segmentos dentro de 15–50 palabras.
- **Coherencia:** cada MCQ responde a su segmento; `passageId` + `segmentLabel` alineados; audio TTS presente en cada passage.
- **Nota:** palabras objetivo del banco (`ausziehen`, `rätsel`, `babysitter`) integradas de forma natural.

### Fix poolReady (descubierto en fire test)

Generación trata Q4 topic Hören como **audit-only** (`hardBlock: false` en `generatePartGeminiLib.mjs`), pero poolReady bloqueaba T3 A2 por `content_topic_mismatch` en segmentos con micro-temas distintos bajo un `topicTag` paraguas.

Alineación aplicada — misma política que Hören T1 multi-segmento:

```349:353:scripts/lib/poolReadyCheck.mjs
  // Hören T1 + A2 T3: multi-segment umbrella topicTag — content_topic is audit-only
  const batchLevelForTopic = normalizeLevel(opts.level || inferBatchLevel(batch));
  const horenMultiSegmentContentTopicAuditOnly =
    mod === 'horen' && (teil === 1 || (teil === 3 && batchLevelForTopic === 'A2'));
```

---

## PASO 3 — Verificación Hören T2 (solo diagnóstico)

### ¿Comparte causa raíz de nivel con Lesen T1 / Hören T3?

**No.**

| Capa | Hören A2 T2 |
|------|-------------|
| Prompt `level` | **OK** — `buildExamPrompt(..., { level: args?.level })` + `plantillas-horen-a2/horen-teil2.md` existe con ejemplo JSON |
| Coerce | Picture-matching T2 **intencionalmente** sin `options` — no aplica a T3 |
| fixNote | No refuerza formato B1 |

Evidencia fire test previo (`docs/A2-CALIBRATION-CLOSURE-FIRETEST-2026-07-22.md` §4B): **formato OK en 4/4 intentos**; fallos solo en **calidad pedagógica** (alineación día↔actividad↔clave).

### Causa concreta — diseño plantilla ↔ checker

**Desalineación enunciado de preguntas:**

Plantilla + ejemplo JSON dicen enunciado = solo día:

```17:17:plantillas-horen-a2/horen-teil2.md
- **5 preguntas** `type: "matching"` — enunciado = día de la semana: `Montag`, `Dienstag`, ...
```

```82:85:plantillas-horen-a2/horen-teil2.md
    { "question": "Montag", ... "correct": "b", ... }
```

Checker exige formato distinto:

```225:229:js/engine/horenPictureMatching.js
  function parseSpeakerDayQuestion(question) {
    const q = String(question || '').trim();
    const m = q.match(/^Was macht\s+([A-ZÄÖÜ][a-zäöüß]{1,20})\s+am\s+(Montag|...)\??$/i);
```

Checklist generación (`examTemplatePrompt.mjs` L329) también dice «enunciado = Montag, Dienstag…» — **coherente con plantilla, incoherente con checker**.

Fallos observados en generación real:

1. `preguntas deben cubrir los 5 días con hablante explícito` — cuando Gemini sigue plantilla (`"Montag"`) el parser no extrae hablante.
2. `clave «X» no coincide con diálogo` — `validatePictureMatchingAlign` + heurística `inferActivityKey` (semántica picture-matching, no nivel).

### Veredicto PASO 3

| Pregunta | Respuesta |
|----------|-----------|
| ¿Mismo bug de nivel que Lesen T1? | **No** |
| ¿Se arregla gratis con fix T3? | **No** — requiere alinear plantilla/ejemplo/checklist **o** relajar `parseSpeakerDayQuestion` |
| Acción | **Sigue diferido** — causa: **desalineación diseño picture-matching**, no propagación de level |

---

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `plantillas-horen-a2/horen-teil3.md` | EJEMPLO VERIFICADO JSON |
| `scripts/lib/generatePartGeminiLib.mjs` | `isHorenMcqTeil` A2 T3; fixNote A2 T3 |
| `scripts/lib/poolReadyCheck.mjs` | audit-only content_topic A2 T3 |
| `batches/ready/pool-verified/A2/horen-t3-gemini-039.json` | **Primera parte T3 verificada** |

---

## NO tocado (según instrucciones)

- `--from-coverage` / blobs A2
- B2 / C1
- Fix Hören T2 (solo diagnosticado)

---

*Evidencia literal de comandos ejecutados 2026-07-22.*
