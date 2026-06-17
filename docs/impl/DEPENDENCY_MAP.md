# LexiCoil — Mapa de dependencias (Fase 0)

> **Generado:** Fase 0 del plan de implementación (`PLAN_IMPLEMENTACION_LEXICOIL.md`).  
> **Alcance:** flujo de generación de exámenes, módulos `js/library/` y `js/engine/`, APIs públicas y callers.  
> **Sin cambios de código** — documento de referencia para fases 1–7.

---

## 1. Resumen ejecutivo

La arquitectura **library-first ya existe en esqueleto**. El ensamblaje desde banco + blueprint funciona; el mastery tracking está cableado en resultados. Los cuellos de botella actuales son:

1. **Volumen de contenido** — bancos con pocas preguntas → `needsCuration: true` o cascada a IA.
2. **`LibraryLoader.hasLibrary`** — devuelve `true` por catálogo estático (`LibraryCatalog.LIBRARY`), no por umbrales reales.
3. **Strategy B** — flag global OFF (`LC_STRATEGY_B`); cuando está ON, la cascada no cae a IA en vivo.
4. **`CefrGate`** — existe en Node/pipeline pero **no se carga en el bundle del browser**; desactivado por defecto.
5. **`ExamLibrary`** — referenciado en la cascada pero **no hay implementación** en el bundle actual.

---

## 2. Flujo principal: examen estándar (workspace → render)

### 2.1 Diagrama

```
Usuario (workspace "Start exam")
        │
        ▼
workspaceUi.js ──► generateExam()          [js/bootstrap/appFeatures.js]
        │
        ├─ canGenerate() / quota
        │
        ▼
runExamSourceCascade(ctx, deps)          [js/ui/exam/examSources.js]
        │
        ├─① fromPool ──────────► fetchExamFromPool()     [js/services/claudeClient.js → Netlify exam-pool]
        │                         validateExamCandidate / normalizeExam
        │
        ├─② fromQuestionLibrary ─► QuestionLibrary.buildExam()
        │                              └─► LibraryLoader.load()
        │                              └─► ExamBlueprint.load() + ExamBuilder.buildFromBlueprint()
        │                         (omitido si lcStrategyBEnabled() === true)
        │
        ├─③ fromExamLibrary ─────► ExamLibrary.pickExam()   [⚠ no implementado en browser]
        │
        ├─ status: 'hit'  ──► applyCascadeHit() → renderExam()
        ├─ status: 'blocked' (Strategy B) ──► notify + backToWorkspace
        └─ status: 'continue' ──► runAiExamPath()
                                        │
                                        ▼
                              pickExamTopic() → KnowledgeEngine / LexiCoilEngine
                                        │
                                        ▼
                              generateExamChunks()         [js/ui/exam/examGeneration.js]
                                        │
                                        ▼
                              LexiCoilEngine.generateExam()
                                        │
                                        ▼
                              KnowledgeEngine.buildSpec() + ExamGenerator.generate()
                                        │
                                        ├─ PromptBuilder (chunks o blueprint)
                                        ├─ ChunkRunner.run() → callAI (Netlify claude-chat)
                                        ├─ mergeExamParts / normalizeExam
                                        └─ ExamValidator (opcional strict + blueprint)
                                        │
                                        ▼
                              S.examSource = 'ai' → renderExam()   [js/ui/exam/examRunner.js]
```

### 2.2 Entrada: `appFeatures.generateExam`

| Paso | Función | Archivo | Descripción |
|------|---------|---------|-------------|
| 1 | `generateExam()` | `js/bootstrap/appFeatures.js` | Resetea sesión, muestra loader, comprueba quota |
| 2 | `runExamSourceCascade({ subject, level, seenIds })` | `js/ui/exam/examSources.js` | Cascada no-AI en orden fijo |
| 3a | `applyCascadeHit(hit)` | `appFeatures.js` | Asigna `S.examData`, `S.examSource`, quota |
| 3b | `runAiExamPath()` | `appFeatures.js` | Fallback IA en vivo |
| 4 | `renderExam()` | `js/ui/exam/examRunner.js` | Pinta el runner |

**Callers de `generateExam`:** `js/ui/workspace/workspaceUi.js` (botón de examen en workspace).

### 2.3 Cascada: `runExamSourceCascade`

Orden fijo (`CASCADE_ORDER`): **pool → questionLibrary → examLibrary**.

| Fuente | Condición de hit | Validación | `S.examSource` |
|--------|------------------|------------|----------------|
| Pool | `fetchExamFromPool` devuelve examen no visto | `validateExamCandidate` / `isExamRenderable` | `'pool'` |
| Question library | `QuestionLibrary.hasLibrary` && build OK | idem | `'question-library'` |
| Exam library | `ExamLibrary.hasLibrary` && pick OK | `normalizeExam` + renderable | `'library'` |
| Blocked | Strategy B ON y ninguna fuente | — | — |
| Continue | ninguna fuente | → IA | `'ai'` |

**Flags relevantes:**

- `window.LC_STRATEGY_B === '1'` → `lcStrategyBEnabled()` → salta question library; si no hay pool, **blocked** (no IA).
- Strategy B no está activo por defecto → la cascada cae a IA.

### 2.4 Ruta library: `QuestionLibrary.buildExam`

```
QuestionLibrary.buildExam(subject, level)
  → LibraryLoader.load(subject, level)          // library/{lang}/{level}/questions.json
  → ExamBlueprint.load(subject, level)          // library/blueprints/{provider}_{LEVEL}.json
  → ExamBuilder.buildFromBlueprint(...)
       → TaggingGate (solo en modo weakness, vía WeaknessEngine)
       → ExamBlueprint.assemble(bank, blueprint, { filter })
       → buildLesenParts / buildHorenParts / …
       → annotateCurationNeeds(exam, bank, blueprint)
            → PassageResolver (pasajes/transcripts)
            → ExamValidator.validate(exam, { blueprint, strict: true })
       → normalizeSpanishExam (es)
```

Si `annotateCurationNeeds` detecta fallos → `exam.needsCuration = true` (el examen puede generarse pero no es apto para publicación/pool).

### 2.5 Ruta IA: `generateExamChunks` → engine

```
generateExamChunks(topic, onStep)                    [examGeneration.js]
  → ExamBlueprint.load (preload si AI_PATH_BLUEPRINTS)
  → LexiCoilEngine.generateExam(subject, level, topic, hooks, opts)
       → KnowledgeEngine.buildSpec({ language, level, provider, contentType: 'Exam', topic, metadata })
       → ExamGenerator.generate(spec, hooks, { useBlueprint, specExtra })
            → PromptBuilder.buildExamChunksFromBlueprint | buildPrompt
            → ChunkRunner.run(chunks, { callAI, parseExamJson, validateChunkObj, mergeExamParts })
            → ExamValidator (strict si blueprint)
  → normalizeExam / lcExamPassesValidator / lcValidateExamOnServer (appFeatures)
  → contributeExamToPool (opcional)
```

**Hooks inyectados** (`getGeneratorHooks`): `callAI`, `parseExamJson`, `mergeExamParts`, `normalizeExam`, `commitExamQuota` — definidos en `examGeneration.js` / `claudeClient.js`.

---

## 3. Flujos secundarios

### 3.1 Examen por debilidades

```
generateWeaknessExam(goalId)           [examGeneration.js]
  → QuestionLibrary.buildWeaknessExam()
       → WeaknessEngine.buildWeaknessExam()
            → AnalyticsStore.getWeakGrammarTags / getWeakTopicTags
            → TaggingGate.gateBank(bank)
            → ExamBuilder.buildFromBlueprint(..., { mode: 'weakness', grammarTags })
  → S.examSource = 'question-library'
  → renderExam()
```

**Callers:** dashboard/coach CTA, workspace weakness actions, `js/ui/app/coach.js` (recomendación).

### 3.2 Examen personal (vocabulario)

```
generatePersonalExam(words, skills)    [examGeneration.js]
  ├─ Si QuestionLibrary.hasLibrary:
  │     → QuestionLibrary.buildPersonalExam() → ExamBuilder (mode: 'personal', targetWords)
  └─ Si no hay banco:
        → fetchExamFromPool (vocab personal) o LexiCoilEngine.generatePersonalExam → IA
```

### 3.3 Mastery tracking (post-examen)

```
finishExam / showResults               [js/ui/exam/results.js ~329]
  → AnalyticsStore.recordExamResult(goal, entry, examData, S.answers)
       → computeTagStats (forEachGoetheQ + goetheAnswersMatch)
       → merge en localStorage key `lc_mastery`
```

**Callers adicionales de lectura:** `goalStore.js`, `coach.js`, (futuro dashboard mastery).

### 3.4 Curación offline (pipeline, no browser)

```
scripts/pipeline/curate.mjs
  → ExamBlueprint.assemble + ExamBuilder.buildFromBlueprint({ assembled })
  → ExamValidator / CefrGate (validateForPublish)
  → library/curated/{lang}/{level}/
```

---

## 4. Datos y archivos estáticos

```
knowledge/
  cefr/{LEVEL}.json          ← KnowledgeLoader.loadCefrLevel
  languages/{lang}.json      ← topics, grammar por nivel
  providers/{provider}.json  ← estructura chunk plan (legacy IA)
  cefr/vocab/{lang}_{LEVEL}.json  ← CefrVocabLoader (partial-seed)

library/
  {de|en|es}/{A1..C2}/questions.json   ← LibraryLoader.load
  blueprints/{provider}_{LEVEL}.json   ← ExamBlueprint.load / blueprintResolver
  banks/*.json                         ← fuente de curación (compuestos)
  curated/{lang}/{level}/*.json        ← pool servible
  schemas/questions.schema.json
```

**Índice blueprint:** `LibraryCatalog.buildBlueprintIndex()` → `{ de_B1: 'goethe_B1', en_B2: 'cambridge_B2', … }`.

---

## 5. Módulos `js/library/` — API pública y callers

### 5.1 `LibraryLoader.js`

| API | Descripción | Callers principales |
|-----|-------------|---------------------|
| `hasLibrary(lang, level)` | Catálogo estático + cache HEAD probe | `QuestionLibrary`, `PracticeDictionary`, `manualVocab.js`, `examSources`, `LibraryCatalog` |
| `supportedLevels(lang)` | Lista de niveles en `SUPPORTED` | `QuestionLibrary`, `manualVocab.js` |
| `probeLevel(lang, level)` | HEAD fetch al JSON | `manualVocab.js` |
| `load(lang, level)` | Fetch + cache del banco | `QuestionLibrary`, `WeaknessEngine`, `PracticeDictionary` |
| `getPassage(bank, id)` | Pasaje embebido en banco | `ExamBuilder` (fallback) |
| `questionsByModule(bank, mod)` | Filtro por módulo | `ExamBuilder.build` (legacy sin blueprint) |
| `lookupVocabulary(bank, word)` | Mapa `bank.vocabulary` | `PracticeDictionary.fromLibrary` |
| `filePath(lang, level)` | Ruta canónica | tests, scripts |
| `SUPPORTED` | Mapa lang → niveles | interno |

### 5.2 `libraryCatalog.js` (`LibraryCatalog`)

| API | Callers |
|-----|---------|
| `blueprintId(lang, level)` | `ExamBlueprint.INDEX` |
| `hasLibrary` / `isLevelAvailable` | UI filtros |
| `selectableLevels(lang)` | `dashboardUi.js`, wizard |
| `libraryLevels` / `advertisedLevels` | setup, exam config |
| `buildBlueprintIndex()` | `ExamBlueprint`, `blueprintResolver`, Netlify functions |
| `LIBRARY`, `EXAM_TYPE`, `LEVELS`, `LANGS` | constantes |

### 5.3 `ExamBlueprint.js`

| API | Callers |
|-----|---------|
| `hasBlueprint(lang, level)` | `QuestionLibrary`, `WeaknessEngine`, `examGeneration` (AI preload) |
| `load(lang, level)` | `QuestionLibrary`, `WeaknessEngine`, browser + scripts |
| `loadSync` / `cacheBlueprint` | tests, `curate.mjs`, `warm-pool.mjs` |
| `assemble(bank, blueprint, { filter })` | `ExamBuilder.buildFromBlueprint`, pipeline |
| `coverageSummary(coverage)` | `ExamBuilder` → `blueprintComplete` |
| `modulePool` / `pickFromPool` | interno assemble |
| `INDEX`, `blueprintPath` | scripts |

### 5.4 `ExamBuilder.js`

| API | Callers |
|-----|---------|
| `build(lang, level, bank, options)` | `QuestionLibrary` (sin blueprint), `WeaknessEngine` fallback |
| `buildFromBlueprint(lang, level, bank, blueprint, options)` | `QuestionLibrary`, `WeaknessEngine`, pipeline, tests |
| `questionMatchesTags(q, grammar, topic)` | interno + tests |
| `questionContainsWords(q, bank, words)` | modo `personal` |

**Opciones de `buildFromBlueprint`:** `mode` (`standard`|`weakness`|`personal`), `grammarTags`, `topicTags`, `targetWords`, `skills`, `assembled` (pre-calculado).

### 5.5 `QuestionLibrary.js` (facade UI)

| API | Callers |
|-----|---------|
| `hasLibrary` / `availableLevels` | `examSources`, `examGeneration`, `coach.js` |
| `buildExam` | `examSources.fromQuestionLibrary` |
| `buildPersonalExam` | `examGeneration.generatePersonalExam` |
| `buildWeaknessExam` | `examGeneration.runWeaknessExam` |
| `lookupVocab` | vocab tooltip / futuro |
| `loadBlueprint` | interno |

### 5.6 `WeaknessEngine.js`

| API | Callers |
|-----|---------|
| `getWeakTags(goal, limit)` | interno |
| `splitWeakTags(tags)` | interno |
| `buildWeaknessExam(lang, level, goal, options)` | `QuestionLibrary.buildWeaknessExam` |

### 5.7 `AnalyticsStore.js`

| API | Callers |
|-----|---------|
| `recordExamResult(goal, entry, examData, answers)` | **`results.js`** |
| `getProfile(goal)` | interno |
| `computeTagStats(examData, answers)` | tests (futuro Fase 4) |
| `getWeakGrammarTags` / `getWeakTopicTags` / `getWeakModules` | `WeaknessEngine`, `coach.js`, `goalStore.js` |
| `getVocabularyGaps` / `getMasterySummary` | (sin UI dedicada aún — Fase 6) |
| `tagAccuracy` / `masteryLevel` / `MASTERY` | interno / futuro UI |
| `load()` | interno |

### 5.8 `TaggingGate.js`

| API | Callers |
|-----|---------|
| `gateBank(bank)` | `WeaknessEngine` (≥4 ítems trusted) |
| `filterTrustedQuestions` | interno |
| `validateQuestionTags` | interno |
| `isValidGrammarTag` / `isValidTopicTag` | validación |

### 5.9 `PassageResolver.js`

| API | Callers |
|-----|---------|
| `passageIdFromQuestion` | `ExamBuilder`, `ExamBlueprint`, repair scripts |
| `getPassageFromBank` | `LibraryLoader`, `ExamBlueprint` |
| `resolvePassageForQuestion` / `resolvePassageForQuestions` | `ExamBuilder`, `ExamBlueprint` |
| `enrichQuestionPassageIds` | assemble pipeline |
| `longestReadingWords` / `partHasReadingText` / `partHasListeningTranscript` | `ExamBuilder.annotateCurationNeeds`, audit scripts |

### 5.10 `PracticeDictionary.js`

| API | Callers |
|-----|---------|
| `lookup(word, subject, level, targetLang)` | `tooltip.js`, `manualVocab.js`, `QuestionLibrary` |
| `fromDeck` / `fromLibrary` | interno |

---

## 6. Módulos `js/engine/` — API pública y callers

> **Nota:** `CefrGate.js`, `CefrVocabLoader.js`, `cefrGateFlags.js`, `strategyBFlags.js`, `AnswerKeyVerifier.js`, `blueprintFidelity.js` se usan en **Node** (scripts, Netlify `examQualityGate.js`), no en `index.html`.

### 6.1 Facade browser: `lexicoilEngine.js` (`LexiCoilEngine`)

| API | Callers |
|-----|---------|
| `generateExam(subject, level, topic, hooks, options)` | `examGeneration.generateExamChunks` |
| `generatePersonalExam(...)` | `examGeneration` (fallback IA vocab) |
| `generateQuickExercise(...)` | quick mod UI |
| `generateFromSpec(spec, hooks)` | extensión genérica |
| `buildExamSpec(...)` | interno |
| `pickTopic` / `listTopics` | `appFeatures.pickExamTopic` |

### 6.2 `knowledge/KnowledgeEngine.js`

| API | Callers |
|-----|---------|
| `buildSpec(request)` | `LexiCoilEngine`, tests, e2e, acceptance |
| `pickRandomTopic(subject, level)` | `LexiCoilEngine.pickTopic`, `appFeatures` fallback |
| `listTopics(subject, level)` | `LexiCoilEngine.listTopics` |
| `pickTopic(langData, level, req)` | interno |
| `buildConstraints`, `resolveLanguageId` | interno / tests |
| `getRegistry`, `getBaseAdapter` | interno |

### 6.3 `knowledge/KnowledgeLoader.js`

| API | Callers |
|-----|---------|
| `loadCefrLevel(level)` | `KnowledgeEngine`, `CefrGate` |
| `loadLanguage(languageId)` | `KnowledgeEngine` |
| `loadProvider(providerId)` | `KnowledgeEngine` |
| `clearCache()` | tests |

### 6.4 `domain/lexicoilDomain.js` (`LexiCoilDomain`)

| API | Callers |
|-----|---------|
| `createContentSpecification(partial)` | `KnowledgeEngine` |
| `validateContentSpecification(spec)` | interno |
| `languageFromSubjectCode` / `subjectCodeFromLanguage` | `LexiCoilEngine`, adapters |
| `normalizeCefrLevel`, `normalizeLanguageId`, `normalizeProviderId`, `normalizeContentType` | engine-wide |
| `CEFR_LEVELS`, `LANGUAGES`, `PROVIDERS`, `CONTENT_TYPES` | constantes |

### 6.5 `providers/providerRegistry.js`

| API | Callers |
|-----|---------|
| `apply(providerId, providerData, level, languageId)` | `KnowledgeEngine.buildSpec` |
| `getAdapter(providerId)` | interno |
| `listIds()` | tests |

### 6.6 Adapters (`goetheAdapter`, `cambridgeAdapter`, `deleAdapter`)

| API | Callers |
|-----|---------|
| `adapt(providerData, level)` → `{ examStructure, chunkPlan }` | vía `ProviderRegistry.apply` |
| `languageId` | validación registry |

### 6.7 `prompts/PromptBuilder.js`

| API | Callers |
|-----|---------|
| `buildPrompt(spec)` | `ExamGenerator`, `ContentGenerator`, tests |
| `buildExamChunks(spec)` | legacy chunk plan |
| `buildExamChunksFromBlueprint(spec, blueprint)` | `ExamGenerator` (AI path con blueprint) |
| `expandChunkPlan`, `chunksForSpec` | interno / tests |
| `aiPathBlueprintsEnabled`, `resolveSpecBlueprint` | flags AI path |

### 6.8 `prompts/blueprintPromptBinding.js` (`BlueprintPromptBinding`)

| API | Callers |
|-----|---------|
| `validationRetryHint(errors)` | `ExamGenerator.runGeneration` retry |
| (otros bindings parte ↔ prompt) | `PromptBuilder.buildExamChunksFromBlueprint` |

### 6.9 `prompts/promptShell.js` / `moduleInstructions.js`

| API | Callers |
|-----|---------|
| `PromptShell.getLocale`, `JSON_RULES` | `PromptBuilder` |
| `ModuleInstructions.*` | prompts por módulo |

### 6.10 `generators/ExamGenerator.js`

| API | Callers |
|-----|---------|
| `generate(spec, hooks, options)` | `LexiCoilEngine`, `ContentGenerator` |
| `generatePersonal(spec, hooks)` | `LexiCoilEngine`, `ContentGenerator` (vocab) |
| `aiPathBlueprintsEnabled()` | `examGeneration.generateExamChunks` |

### 6.11 `generators/ChunkRunner.js`

| API | Callers |
|-----|---------|
| `run(chunks, hooks)` | `ExamGenerator.runGeneration` |

### 6.12 `generators/ContentGenerator.js`

| API | Callers |
|-----|---------|
| `generate(spec, hooks, options)` | `LexiCoilEngine.generateFromSpec` |
| `REGISTRY()` | routing por `contentType` |

### 6.13 Otros generadores

| Módulo | API | Callers |
|--------|-----|---------|
| `ExerciseGenerator` | `generate`, `contentTypeForQuickMod` | `ContentGenerator`, quick mod |
| `FlashcardGenerator` | `generate` | `ContentGenerator` |
| `StoryGenerator` | `generate` | `ContentGenerator` |
| `DialogueGenerator` | `generate` | `ContentGenerator` |

### 6.14 `validation/ExamValidator.js` (clase)

| API | Callers |
|-----|---------|
| `new ExamValidator().validate(exam, { strict, blueprint })` | `ExamGenerator`, `ExamBuilder.annotateCurationNeeds`, `examGeneration.lcExamPassesValidator`, pipeline, Netlify quality gate |
| Métodos internos | `_validateMcq`, `_validateMatch`, blueprint part counts, placeholder scan |

Integración CEFR (si `cefrGateEnabled(options)`): llama `CefrGate.validateExam` como **warning**, no bloqueante en browser.

### 6.15 `validation/blueprintResolver.js`

| API | Callers |
|-----|---------|
| `resolveBlueprintForSpec(spec)` | `ExamGenerator`, `PromptBuilder` |
| `loadBlueprintFileSync`, `resolveBlueprintByType` | Node tests, validator |
| `aiPathBlueprintsEnabled()` | duplicado con env `AI_PATH_BLUEPRINTS` |
| `BLUEPRINT_INDEX`, `cacheBlueprint` | tests |

### 6.16 `validation/CefrGate.js` (Node / pipeline)

| API | Callers |
|-----|---------|
| `validatePassage(text, { level, lang })` | curación |
| `validateExam(exam, opts)` | `ExamValidator`, `netlify/functions/lib/examQualityGate.js` |
| `extractLongestReadingText`, `normalizeLemma`, `tokenize` | interno / tests |
| Constantes `COVERAGE_THRESHOLD`, `MIN_VOCAB_FOR_HARD_COVERAGE` | tests |

### 6.17 `validation/CefrVocabLoader.js`

| API | Callers |
|-----|---------|
| `loadLevelVocab` / `loadCumulativeVocab` (+ sync) | `CefrGate.coverageMetrics` |
| `LEVEL_ORDER`, `clearCache` | tests, seed scripts |

### 6.18 `validation/cefrGateFlags.js` / `strategyBFlags.js`

| API | Callers |
|-----|---------|
| `cefrGateEnabled(options)` | `ExamValidator` |
| `strategyBEnabled(options)` | pipeline tests; **no wired en browser** (browser usa `LC_STRATEGY_B`) |
| `isPersonalVocabExamRequest(opts)` | pipeline |

### 6.19 `validation/AnswerKeyVerifier.js` / `blueprintFidelity.js`

| API | Callers |
|-----|---------|
| `AnswerKeyVerifier` | server validation, tests |
| `checkBlueprintFidelity` | audit tests |

### 6.20 `targetUsage.js` (`TargetUsage`)

| API | Callers |
|-----|---------|
| `deriveTargetUsage` / `verifyTargetUsage` / `applyVerified` | `ExamBuilder` (personal), `examGeneration` pool quality |
| `isVerifiedSurface` | `examRunner` highlights (vocab personal) |

---

## 7. UI y bootstrap relacionados (fuera de library/engine pero en el flujo)

| Módulo | Rol en generación |
|--------|-------------------|
| `js/ui/exam/examGeneration.js` | Chunks IA, pool, personal/weakness, validación cliente |
| `js/ui/exam/examValidation.js` | `validateExamCandidate`, `normalizeExam` helpers |
| `js/ui/exam/examRunner.js` | Render exam (no genera) |
| `js/ui/exam/results.js` | Scoring + **`AnalyticsStore.recordExamResult`** |
| `js/services/claudeClient.js` | `callAI`, `fetchExamFromPool` |
| `js/bootstrap/quota.js` | `canGenerate`, `commitExamQuota` |
| `netlify/functions/claude-chat` | IA + validateExam server-side |
| `netlify/functions/exam-pool` | Pool curated exams |

---

## 8. Orden de carga en browser (`index.html`)

Engine **antes** de library (KnowledgeEngine disponible para IA). Library **antes** de `examSources` / `appFeatures`.

```
lexicoilDomain → KnowledgeLoader → providers → KnowledgeEngine → PromptBuilder → ExamValidator
→ ChunkRunner → ExamGenerator → … → ContentGenerator → LexiCoilEngine
libraryCatalog → TaggingGate → LibraryLoader → PassageResolver → ExamBlueprint → ExamBuilder
→ AnalyticsStore → WeaknessEngine → PracticeDictionary → QuestionLibrary
examSources → examGeneration → examRunner → results → appFeatures (generateExam)
```

**No cargados en browser:** `CefrGate`, `CefrVocabLoader`, `strategyBFlags` (flags vía globals/env alternativos).

---

## 9. Gaps detectados (input para Fase 1+)

| Gap | Impacto | Fase plan |
|-----|---------|-----------|
| `hasLibrary` no mide volumen real | Niveles vacíos aparecen servibles | Fase 1 |
| Bancos ~10 ítems vs blueprint 30+ | `needsCuration`, assemble incompleto | Fase 1 + contenido |
| `ExamLibrary` ausente | Paso ③ cascada siempre miss | legacy / opcional |
| Strategy B flag global, OFF | IA sigue siendo fallback default | Fase 2 |
| `dele_C1.json` duplica `sprechen` | cobertura blueprint incorrecta | Fase 2 |
| CefrGate OFF + vocab partial-seed | sin gate de publicación real | Fase 3 |
| Sin split 70/30 en WeaknessEngine | personalización parcial | Fase 5 |
| Mastery sin sync servidor / UI | loop de aprendizaje implícito | Fases 4–6 |

---

## 10. Comandos de validación existentes

| Script | Qué cubre |
|--------|-----------|
| `npm run test:engine` | suite completa engine + library + nav + visual |
| `npm run validate:library` | esquema bancos |
| `npm run test:library` | builder + passages |
| `npm run validate:blueprint` / `test:blueprint` | blueprints |
| `npm run test:strategy-b` | pipeline curación |
| `npm run test:cefr-gate` | CefrGate (Node) |
| `npm run test:exam-sources` | cascada |

---

*Documento listo para Fase 1. No modifica código.*
