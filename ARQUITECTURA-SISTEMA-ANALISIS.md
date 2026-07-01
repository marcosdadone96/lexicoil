# Análisis de Arquitectura — LexiLoop B1
**Fecha:** Junio 2026 | **Versión analizada:** actual (post CHK-20)

---

## A. MAPA DEL SISTEMA ACTUAL

### Visión de capas

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 1 — GENERACIÓN                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐   │
│  │ generate-    │  │ generate-    │  │ make-t3  │  │ Runtime  │   │
│  │ lesen-part-  │  │ part-gemini  │  │ make-t4  │  │ ExamGen  │   │
│  │ gemini.mjs   │  │ Lib.mjs      │  │(sin LLM) │  │ (app)    │   │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └────┬─────┘   │
│         │                 │               │              │          │
│  Gemini 2.5-Flash / Grok / Groq / Ollama │         Claude Sonnet  │
│  Claude Sonnet (residual)                │         4.6 (prod)     │
└─────────────────────────────────────────────────────────────────────┘
         │                 │               │              │
         ▼                 ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 2 — VALIDACIÓN OFFLINE (scripts)                              │
│                                                                     │
│  normalizeBatch → validate-batch → [Calidad módulo] → lexicalCheck  │
│       │               │                  │               │          │
│  (coerce         (JSON schema,      lesen/horen/     (blacklist +   │
│   tipos,          IDs dup,          prompt Quality)   rules léxicas)│
│   fields)         blueprint)                                        │
│                                                                     │
│  → semanticDedup → audit-pass-2 (CHK-1..20, --fail-on=IMPORTANT)   │
└─────────────────────────────────────────────────────────────────────┘
         │ PASS                          │ FAIL
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│  batches/generated/  │    │  .rejected/ + repair prompt          │
│  (aprobados)         │    │  → reintento LLM (hasta fixRetries)  │
└──────────┬───────────┘    └──────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 3 — PIPELINE BATCH (offline curación)                         │
│                                                                     │
│  process-all-batches → merge bank → assemble-bank-pipeline          │
│                                          │                          │
│                               ┌──────────┴───────────┐             │
│                               │  normalize-bank       │             │
│                               │  sanitize-curated     │             │
│                               │  fix-coherence        │             │
│                               │  fill-missing         │             │
│                               │  verify-curated (opt) │             │
│                               └──────────┬────────────┘             │
│                                          ▼                          │
│                          library/curated/  →  data/exams/           │
└─────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 4 — RUNTIME (Netlify / App usuario)                           │
│                                                                     │
│  examGeneration.js → claudeClient → claude-chat.js                  │
│       │                                    │                        │
│  ExamGenerator.js                   examQualityGate                 │
│  chunkRunner.js                     partQualityGate                 │
│  lesenTeil2Split                    topicCoherenceGate              │
│  lesenTeil4Split                    verifyAnswerKeysWithAI          │
│                                     verifyPartQuestionsWithAI       │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Flujo completo — generación offline de una parte (ej. Hören T3)

```
CLI: node generate-part-gemini.mjs --module horen --teil 3 --from-coverage

  1. resolveTargetWords()
     └─ pickRandomWords() de data/coverage/weak-de_B1.json

  2. pickNextTopic()
     └─ rotación de temas (menos usado en batches/generated/)

  3. buildExamPrompt('horen', 3, words)
     └─ plantillas-horen-b1/horen-teil3.md
     └─ CEFR_VOCAB_HINT + CHECKLIST FINAL

  4. callLlm(prompt)  ← Gemini 2.5-Flash (o grok/groq/ollama)
     └─ máx max-api-calls; pausa geminiRateLimit; presupuesto CLAUDE_BUDGET_USD

  5. extractJson(response)
     └─ salvage JSON del texto LLM (regex + try/catch)

  6. normalizeBatch(batch)
     └─ coerce tipos, module/teil/passageId, MCQ keys, IDs

  ─── runDualGates() ───────────────────────────────────────────
  │
  │  GATE 1 — validate-batch (spawnSync)
  │  └─ JSON schema (Ajv) + IDs dup vs banco + passageId + blueprint
  │  └─ FAIL → eliminar archivo + return {ok:false, gate:'formato'}
  │
  │  GATE 2 — checkHorenBatchQuality(batch, teil)
  │  └─ anti word-matching, longitudes, diálogos, balance RF, MCQ T2...
  │  └─ FAIL → eliminar archivo + return {ok:false, gate:'calidad'}
  │
  │  GATE 3 — checkLexical(batch)
  │  └─ blacklist C1/C2 + reglas léxicas contextuales
  │  └─ FAIL → eliminar archivo + return {ok:false, gate:'lexico'}
  │
  │  GATE 4 — semanticDedup(batch, corpus)
  │  └─ Jaccard ≥0.55 vs batches/generated/
  │  └─ FAIL → eliminar archivo + return {ok:false, gate:'dedup'}
  │
  │  GATE 5 — audit-pass-2 --fail-on=IMPORTANT (spawnSync)
  │  └─ CHK-1..20 completo
  │  └─ FAIL → eliminar archivo + return {ok:false, gate:'audit2'}
  │
  └─ PASS → return {ok:true}
  ─────────────────────────────────────────────────────────────

  7a. PASS → batches/generated/horen-t3-gemini-NNN.json ✅
         └─ loop: siguiente parte

  7b. FAIL y fixRetries > 0:
         └─ buildExamFixNote(issues, gate, 'horen')
         └─ prompt += nota de corrección
         └─ callLlm(repaired_prompt)  ← mismo LLM
         └─ volver a paso 5 (extractJson...)
         └─ si FAIL tras todos los reintentos → .rejected/ o unlink
```

---

### Flujo runtime (app usuario — examen personalizado)

```
Usuario pulsa "Generar examen"
         │
         ▼
examGeneration.js → startExamGeneration(ticket)
         │
         ▼
ExamGenerator.generate()
├─ PromptBuilder.buildExamChunksFromBlueprint()
│  └─ chunks por módulo/teil (timeout Netlify 55s)
│
├─ chunkRunner() — un chunk por vez
│  ├─ lesenTeil2Split (dos sub-llamadas para los 2 textos)
│  ├─ lesenTeil4Split (fases: intro → opiniones → preguntas)
│  └─ retry por chunk si JSON malformado
│
├─ claude-chat.js (Netlify function)
│  └─ Claude Sonnet 4.6 (exámenes) / Haiku 4.5 (verificación)
│
├─ examQualityGate.validateGeneratedExam()
│  └─ ExamValidator + blueprintFidelity + placeholders + CefrGate
│
├─ verifyPartQuestionsWithAI() (si EXAM_ANSWER_KEY_VERIFY=1)
│  └─ Claude Sonnet: "¿es answerable del texto? ¿gramática ok?"
│  └─ descarta ítems que fallan (no rechaza el examen entero)
│
└─ exam-part POST → partQualityGate.runPartQualityGate()
   ├─ estructural per-item
   ├─ passageId guard
   ├─ AI verify (verifyPartQuestionsWithAI)
   ├─ 1 intento de repair si < minItems
   ├─ balanceAnswerPositions() + validateAdsUnique()
   └─ topicCoherenceGate (si TOPIC_COHERENCE_GATE=1)
```

---

### Tabla completa de validadores — qué detecta cada uno

| Validador | Dónde se ejecuta | Qué detecta | Bloquea |
|-----------|-----------------|-------------|---------|
| `normalizeBatch` | offline, post-LLM | Tipos incorrectos, campos mal formados | No (corrige) |
| `validate-batch` (Ajv) | offline, gate 1 | Schema JSON, IDs dup, passageId, blueprint | **Sí** |
| `blueprintConformance` | offline | Tipo pregunta vs slot, opciones, claves | **Sí** |
| `lesenBatchQuality` | offline, gate 2 | Anti word-match, scope traps, tono, familias semánticas | **Sí** |
| `horenBatchQuality` | offline, gate 2 | Idem para Hören, longitudes, diálogos | **Sí** |
| `promptBatchQuality` | offline, gate 2 | Schreiben/Sprechen: rúbrica, longitud, Sie/du | **Sí** |
| `checkLexical` | offline, gate 3 | Blacklist C1/C2, errores gramaticales contextuales | **Sí** |
| `semanticDedup` | offline, gate 4 | Jaccard ≥0.55 vs corpus generated | **Sí** |
| `audit-pass-2` (CHK-1..20) | offline, gate 5 | 20 checks estructurales + pedagógicos | **Sí** (IMPORTANT+) |
| `ExamValidator` | runtime | Estructura JSON examen completo | **Sí** |
| `blueprintFidelity` | runtime | Conteos, tipos vs blueprint | **Sí** |
| `CefrGate` | runtime | Léxico CEFR B1 | **Sí** |
| `verifyPartQuestionsWithAI` | runtime (opt) | Respuesta correcta + answerable + gramática (IA) | Descarta ítems |
| `verifyAnswerKeysWithAI` | runtime (opt) | Claves MCQ por LLM-solver | Descarta ítems |
| `partQualityGate` | runtime | Estructura + AI verify + repair + postprocess | **Sí** (si < minItems) |
| `topicCoherenceGate` | runtime (opt) | Coherencia tema + nivel CEFR | **Sí** |

---

## B. LISTA DE PROBLEMAS DETECTADOS

### 🔴 HIGH — Impactan directamente la calidad o el coste

#### H1. Dos pipelines paralelos con calidad divergente
**Problema:** El contenido batch (offline/Gemini) pasa por 5 gates. El contenido runtime (Claude Sonnet/app) pasa por `examQualityGate` + AI verify opcional. Las reglas NO son equivalentes: `lesenBatchQuality` detecta anti word-match, scope traps y familias semánticas — pero `partQualityGate` runtime no usa estas mismas reglas. Un examen generado en la app puede pasar con errores que el pipeline offline rechazaría.
**Archivos:** `scripts/lib/lesenBatchQuality.mjs` vs `netlify/functions/lib/partQualityGate.js`

#### H2. audit-pass-2 no se ejecuta en el runtime de producción
**Problema:** Los CHK-1..20 implementados son el gate más exhaustivo del sistema. Solo se ejecutan en el pipeline offline (`spawnSync` en `runDualGates`). El runtime de la app usa `ExamValidator` + `blueprintFidelity` (que son validadores estructurales simples), pero NO ejecuta audit-pass-2. Por lo tanto: CHK-14 (sustantivos), CHK-16 (anti word-match), CHK-18 (explanation quality), CHK-19 (runs), CHK-20 (H1 structure) nunca se comprueban en producción.
**Impacto:** Todo el trabajo en CHK-15 a CHK-20 no protege a los usuarios de la app.

#### H3. Retries LLM con el mismo prompt generan el mismo error
**Problema:** El `buildExamFixNote` añade notas de corrección al prompt original. Pero si el LLM falló por una limitación estructural (ej. el token limit del modelo en Groq/Ollama), enviar el mismo prompt ampliado agrava el problema. No hay distinción entre "fallo de calidad" (retry con repair) y "fallo de truncación" (retry con prompt más corto).
**Archivos:** `generatePartGeminiLib.mjs` líneas ~250-370; `isLikelyTruncated()` existe pero no cambia la estrategia del prompt.

#### H4. `normalizeBatch` silencia errores en lugar de reportarlos
**Problema:** `normalizeBatch` corrige tipos, campos y claves sin registrar qué cambió. Un batch que llega con 3 campos incorrectos pasa como "válido" porque la normalización los corrige en silencio. Esto enmascara fallos del LLM y dificulta saber si el modelo está degradando.
**Archivo:** `scripts/lib/normalizeBatch.mjs`

#### H5. Doble verificación AI costosa con superposición
**Problema:** `verifyPartQuestionsWithAI` (gate runtime) y `verifyAnswerKeysWithAI` verifican esencialmente lo mismo: que la clave marcada es correcta según el texto. Se ejecutan de forma secuencial con dos llamadas Claude separadas para el mismo contenido.
**Coste estimado:** 2× el coste de verificación; para exámenes personalizados frecuentes esto puede ser significativo.
**Archivos:** `netlify/functions/lib/examQualityGate.js` (ambas funciones)

---

### 🟡 MEDIUM — Redundancias y solapamientos que aumentan complejidad

#### M1. CHK-4 vs CHK-12 vs CHK-13 — triple redundancia en balance de respuestas
- CHK-4 verifica RF/JN ≤85% y MC ≤65%
- CHK-12 verifica RF ≤70% (más estricto que CHK-4 para RF)
- CHK-13 verifica MC ≤55% y 3 letras (más estricto que CHK-4 para MC)
**Resultado:** Para bloques RF, CHK-4 (85%) nunca dispara antes que CHK-12 (70%). Para MC, CHK-4 (65%) nunca dispara antes que CHK-13 (55%). **CHK-4 es efectivamente redundante** para los tipos que ya cubren CHK-12 y CHK-13.

#### M2. `blacklist.mjs` verificada en dos capas independientes
- `lexicalCheck.mjs` + `blacklist.mjs` → gate 3 offline
- `CHK-6` en `audit-pass-2.mjs` → importa el mismo `blacklist.mjs` → gate 5 offline
- `checkLexical` → importa blacklist → también en runtime `partQualityGate` (vía lexicalCheck)
**El mismo blacklist se comprueba 3 veces** en el pipeline offline. Es "defensa en profundidad" pero añade latencia sin valor diferencial entre capas.

#### M3. Múltiples generadores para el mismo módulo con lógica casi idéntica
`generate-lesen-part-gemini.mjs` y `generatePartGeminiLib.mjs` comparten: callLlm, providers, runDualGates, retry loop, extractJson, normalizeBatch. La diferencia real es solo el builder de prompt (`buildLesenPrompt` vs `buildExamPrompt`) y los checkers de calidad. El código está duplicado en vez de extraer un motor común.

#### M4. Scripts `fix-*` y `repair-*` acumulados sin inventario ni trigger
Existen 10+ scripts `fix-*.mjs` y `repair-*.mjs` que no se llaman desde ningún pipeline automático. Se ejecutan manualmente cuando se detecta un problema. No hay un registro de cuándo se ejecutaron, qué arreglaron ni si los datos están "limpios". Esto crea deuda técnica acumulada e invisible.

#### M5. `lesenBatchQuality` y `horenBatchQuality` con funciones tokenize duplicadas
Ambos archivos definen su propio `tokenize()` con listas de stopwords ligeramente distintas. `audit-pass-2.mjs` también tiene su propio `tokenize()`. **3 implementaciones de la misma función** en el mismo proyecto.

#### M6. Solapamiento entre `lesenBatchIngestCheck` y `audit-pass-2`
`lesenBatchIngestCheck.mjs` hace: validación CEFR (CefrGate), `validateCandidate` (blueprint). `audit-pass-2.mjs` hace: CHK-3 (blueprint count), CHK-6 (léxico — que incluye vocabulario fuera de nivel). El CEFR gate existe en ambas capas pero con diferente profundidad.

#### M7. T3/T4 Lesen tienen dos formatos incompatibles en el banco
Los ítems de Lesen T3 tienen simultáneamente:
- `part.text` con lista compartida A-J (formato oficial Goethe)
- `item.options[]` individual por ítem (formato MCQ-style, generado automáticamente)
El `correct` de cada ítem referencia el options[] individual, no el `part.text` compartido. CHK-17 detecta esto como IMPORTANT. No hay un único formato canónico.

---

### 🟢 LOW — Mejoras de mantenimiento / UX desarrollador

#### L1. `generate-batch-gemini.mjs` con blueprint diferente al resto
El generador batch genérico (`generate-batch-gemini`) usa `GEMINI_MASTER_PROMPT_de_B1.md` y su propio `blueprintConformance`. Los generadores especializados (`generate-lesen-part-gemini`, `generate-part-gemini`) usan `lesenTemplatePrompt`/`examTemplatePrompt` con plantillas `*.md` por Teil. **Dos sistemas de prompt completamente distintos para el mismo objetivo.**

#### L2. Orquestadores de volumen con checkpoints incompletos
`generate-auto-fill.mjs` y `generate-parallel.mjs` tienen lógica de checkpoint propia. Si el proceso se interrumpe, el estado puede quedar inconsistente. No hay mecanismo de idempotencia garantizado.

#### L3. Providers múltiples (Gemini/Grok/Groq/Ollama) con calidad desigual
Los 4 providers usan el mismo prompt y los mismos gates, pero la calidad del JSON y del contenido varía significativamente. Ollama (7B) genera JSON truncado con frecuencia. Grok/Groq tienen límites de tokens que causan truncaciones. No hay un sistema de scoring por provider para priorizar el mejor.

#### L4. `audit-pass-2.mjs` ejecutado con `spawnSync` (proceso hijo)
Cada lote genera un proceso Node.js hijo solo para el audit. Con volúmenes altos (generate-parallel), esto multiplica los procesos. Podría importarse como módulo directamente (`auditExam()` ya exporta la función).

#### L5. CHK-9 (Beispiel ausente) solo en INFO — nunca accionable
CHK-9 siempre es INFO. Dado que no aparece en el resumen ni puede causar fallo, no tiene efecto real. Es documentación muerta.

#### L6. Múltiples puntos de entrada manuales sin validación unificada
`import-manual-batch.mjs`, `paste-exam-inbox.mjs`, `build-lesen-prompt.mjs` — cada uno tiene su propio manejo de errores y su propia llamada a validadores. Un batch manual puede entrar por una vía que omite algunos gates.

---

## C. RECOMENDACIÓN DE ARQUITECTURA IDEAL MÍNIMA (4 capas)

### Principio rector
**"Un solo camino de calidad. Dos contextos de ejecución."**

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 1 — GENERACIÓN (un único motor, múltiples providers)          │
│                                                                     │
│  generatePart(module, teil, topic, words, provider)                 │
│  └─ buildPrompt(module, teil, words)   ← única fuente de verdad     │
│  └─ callLlm(prompt, provider)          ← selector inteligente       │
│  └─ extractJson + normalize            ← siempre                    │
│                                                                     │
│  Providers: Gemini (batch/barato) | Claude Sonnet (prod/calidad)    │
│  Eliminar: Grok/Groq/Ollama offline — demasiado ruidosos            │
└─────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 2 — GATE ÚNICO DE CALIDAD                                     │
│                                                                     │
│  qualityGate(batch, context)                                        │
│  ├─ validate(batch)       → estructura + schema + blueprint         │
│  ├─ pedagogy(batch)       → anti word-match + scope traps + léxico  │
│  ├─ audit(batch)          → CHK-1..20 (audit-pass-2 como módulo)    │
│  └─ dedup(batch, corpus)  → Jaccard vs banco                        │
│                                                                     │
│  context = 'offline' | 'runtime'                                    │
│  En offline: falla → repair prompt → 1 reintento → reject           │
│  En runtime: falla → descarta ítem (no examen entero)               │
│                                                                     │
│  SIN: doble verificación AI por defecto (solo en premium/opt-in)    │
└─────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 3 — BANCO DE CONTENIDO (fuente única de verdad)               │
│                                                                     │
│  batches/generated/ → bank/ → curated/                              │
│                                                                     │
│  Un único script de pipeline: ingestAndPromote(batch)               │
│  └─ normaliza → valida → merge → deduplica → promueve               │
│                                                                     │
│  Eliminar: los 10+ scripts fix-* y repair-* como                    │
│  herramientas manuales → convertirlos en subcomandos de             │
│  un único CLI: lexiloop-admin fix [--type balance|coherence|...]    │
└─────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAPA 4 — ENTREGA (app / API)                                       │
│                                                                     │
│  examAssembler(profile, blueprint)                                  │
│  └─ buscar en curated/ primero (cero coste LLM)                     │
│  └─ si faltan partes → generatePart() [Capa 1] → qualityGate [C2]  │
│  └─ ensamblar examen + verificar coherencia                          │
│                                                                     │
│  Verificación AI: SOLO si el usuario tiene créditos premium         │
│  No por defecto en todos los exámenes.                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Qué eliminar / consolidar para llegar a la arquitectura ideal

| Actual | Acción | Nuevo |
|--------|--------|-------|
| `generate-lesen-part-gemini` + `generatePartGeminiLib` | Fusionar | `generatePart(module, ...)` |
| `generate-batch-gemini` | Refactorizar como alias | `generatePart --bulk` |
| `lesenBatchQuality` + `horenBatchQuality` + `promptBatchQuality` | Unificar | `pedagogyCheck(module, teil, batch)` |
| `tokenize()` × 3 | Extraer | `lib/tokenize.mjs` |
| CHK-4 (RF/MC) | **Eliminar** (cubierto por CHK-12+13) | — |
| blacklist en 3 lugares | Mantener 1 (en gate único) | `qualityGate` ejecuta 1 vez |
| `verifyPartQuestionsWithAI` + `verifyAnswerKeysWithAI` | Fusionar en 1 llamada | `verifyBatch(items, passage)` |
| 10+ scripts `fix-*` y `repair-*` | Convertir en subcomandos | `lexiloop-admin fix --type X` |
| `process-all-batches` + `assemble-bank-pipeline` + `run-content-pipeline` | Consolidar | `ingestAndPromote(batchDir)` |
| Providers Grok/Groq/Ollama offline | **Deprecar** | Solo Gemini offline + Claude prod |
| CHK-9 INFO | **Eliminar o subir a MINOR** | — |
| `generate-lesen-grok-t125`, `groq`, `ollama` wrappers | **Eliminar** | — |

### Flujo ideal simplificado

```
generatePart(module, teil, words, 'gemini')
    │
    ▼
qualityGate(batch, 'offline')   ← UN solo gate con todas las reglas
    │                   │
  PASS               FAIL (max 1 repair retry)
    │                   │
    ▼               reject to .rejected/
ingestAndPromote(batch)
    │
    ▼
examAssembler(profile)   ← 95% del tiempo: cero LLM (curated)
    │
    ▼
qualityGate(exam, 'runtime')   ← mismas reglas, contexto diferente
```

### Estimación de impacto

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Gates distintos en el pipeline | 5 gates × 2 pipelines = 10 | 1 gate × 2 contextos = 2 |
| Scripts de repair manuales | 10+ aislados | 1 CLI unificado |
| Verificaciones AI por examen | 2 (por defecto) | 0 (por defecto), 1 (premium opt-in) |
| Providers activos offline | 5 (Gemini/Claude/Grok/Groq/Ollama) | 2 (Gemini offline, Claude prod) |
| Implementaciones de tokenize() | 3 | 1 |
| Cobertura de CHK-1..20 en producción | 0% | 100% (gate unificado) |
| Calidad estimada del output | 85% | 95%+ |

---

## Apéndice: mapa de archivos por categoría

### Generadores activos (mantener)
```
scripts/generate-lesen-part-gemini.mjs   ← Lesen T1/2/5
scripts/lib/generatePartGeminiLib.mjs    ← Hören/Schreiben/Sprechen
scripts/make-t3.mjs                      ← Lesen T3 (sin LLM)
scripts/make-t4.mjs                      ← Lesen T4 (sin LLM)
scripts/generate-residual-parts.mjs      ← Claude offline (curated)
netlify/functions/claude-chat.js         ← Runtime prod
js/engine/generators/ExamGenerator.js
js/engine/generators/chunkRunner.js
```

### Validadores clave (mantener, unificar)
```
scripts/audit-pass-2.mjs                 ← CHK-1..20 (extender a runtime)
scripts/lib/lesenBatchQuality.mjs        ← fusionar con horenBatchQuality
scripts/lib/horenBatchQuality.mjs        ← fusionar
scripts/lib/promptBatchQuality.mjs       ← fusionar
scripts/lib/lexicalCheck.mjs             ← mantener
scripts/lib/semanticDedup.mjs            ← mantener
scripts/validate-batch.mjs               ← mantener
netlify/functions/lib/examQualityGate.js ← mantener, simplificar verify
netlify/functions/lib/partQualityGate.js ← extender con CHK-1..20
js/engine/validation/ExamValidator.js    ← mantener
```

### Candidatos a eliminar / deprecar
```
scripts/lib/grokClient.mjs               ← calidad inferior
scripts/lib/groqClient.mjs               ← calidad inferior
scripts/lib/ollamaClient.mjs             ← demasiado ruidoso
scripts/generate-lesen-grok-t125.mjs     ← wrapper trivial
scripts/generate-lesen-groq-t125.mjs     ← wrapper trivial
scripts/generate-lesen-ollama-t125.mjs   ← wrapper trivial
(+ fix-*.mjs y repair-*.mjs → CLI admin)
```
