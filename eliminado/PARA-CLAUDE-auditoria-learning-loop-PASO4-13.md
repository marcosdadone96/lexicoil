# Auditoría técnica — Learning loop LexiCoil / lexiloop (PASO 4–13)

**Fecha del estado auditado:** 2026-07-11  
**Alcance:** desde Content Corrections hasta Reindex vocabulario `v3-quality`, incluyendo Generation Feedback, Quality Gates (staging) y Runtime Sync.  
**Naturaleza:** descripción factual del código y datos existentes. Sin propuestas de mejora. Sin cambios. Sin código nuevo.

**Numeración PASO (autoritativa en cabeceras de código, distinta de otros docs “PASO” del repo):**

| PASO | Tema |
|------|------|
| 4 | Cola de content corrections (Blobs) |
| 5 | Apply engine + learning extraction |
| 6 | Observation / resolver de generation feedback |
| 7 | Cableado a prompts de generación |
| 8 | Gate de activación + modos A/B + auditoría |
| 9 | `qualityGateRunner` (orquestador staging) |
| 10 | Política de promoción (`qualityGatePolicy`) |
| 13 P0-1 | Sync Apply → Runtime (seed / blobs / published) |
| 13 P0-2 | Promoción feedback (`candidate→approved→active`) + Admin UI |
| 13 P0-3/P0-4 | `vocabIndex` quality + canonicalize query |
| 13 P0-5 | Reindex batch a `v3-quality` |

**Nota de numeración cruzada:** existen otros “PASO 5/6” en `batches/PROMPT_crear_celda_contenido.md` y `claude-audit-pack/BRIEFING.md` que **no** corresponden a este learning loop. `PARA-CLAUDE-auditoria-pipeline-completo.md` describe el pipeline Lesen/pool y **no** documenta corrections/feedback/v3.

---

## 1. Resumen ejecutivo

### Qué funcionalidades existen

1. **Content Corrections:** cola en Netlify Blobs; creación desde revisión de examen o Admin; estados `pending → approved|rejected → applied|conflict|failed`.
2. **Apply Engine:** aplica parches aprobados al JSON en disco (`batches/ready/pool-verified/` u otros fallbacks), con backup, conflicto si el valor actual ≠ `oldValue`, regeneración parcial de metadata (`correct`/`correctAnswer`, tags obsoletos).
3. **Learning Extraction:** tras apply, heurística decide si la corrección genera una regla reutilizable; si sí, crea registro en `generation_feedback:*` siempre como `candidate`.
4. **Runtime Sync (P0-1):** propaga el parche aplicado a seed local, Blobs `reusable_part:*` y (opcional) published exams. Separado de `correction.status` mediante `syncStatus`.
5. **Generation Feedback store + workflow:** `candidate → approved → active → deprecated`; solo `active` entra en prompts; activación pasa por `validateGenerationFeedbackRule`.
6. **Prompt wiring:** builders de generación pueden inyectar bloque de feedback según modo `off|preview|active`.
7. **Quality Gates (PASO 9–10):** runner de 5 gates sobre candidatos de staging; política `advisory|review|enforced`; metadatos `qualityMetadata`; bridge a `approve_candidate`.
8. **Vocabulary Index v3-quality:** construcción de `vocabIndex` enriquecido (lemma/concept/aliases/sources/quality); canonicalize de queries; búsqueda/`buscar`/`rankPartsByVocab`.
9. **Reindex v3 (P0-5):** CLI obligatorio `--dry-run`/`--confirm` para reescribir solo `vocabIndex` + `vocabIndexVersion` en pool-verified, seed y blobs.
10. **Admin UI:** pestañas Correcciones, Generation Feedback, Staging (quality badges + run quality).

### Qué flujo completo soporta hoy el sistema

Flujo **soportado extremo a extremo** (con opt-ins):

Corrección en examen → Pending (Blobs) → Approve (Admin) → Apply (pool-verified en disco) → Learning extract (`candidate`) → [manual] Approve/Activate feedback → [si `GENERATION_FEEDBACK_MODE=active`] Prompt → Nueva generación → [staging] Quality Gates → [approve_candidate] Pool/reusable.

Flujo **de distribución runtime de una corrección ya aplicada:**

Apply (`syncStatus=sync_pending` por defecto) → CLI `sync-correction-to-runtime` (`--confirm`, opcional `--confirm-publish`) → seed → blobs → published.

Flujo **de índice vocabulario:**

Texto + `vocabularyTags` → `buildVocabIndex` / `applyPartIndex` → `vocabIndexVersion=v3-quality` → búsqueda con `canonicalizeVocabQuery` (servidor) o `ManualVocab.canonicalizeForGeneration` (cliente UI) → match por lemma/concept/aliases.

### Qué partes siguen desactivadas por flags

| Capacidad | Flag / condición | Efecto con default |
|-----------|------------------|--------------------|
| Inyección de feedback en generación | `GENERATION_FEEDBACK_MODE` unset → **`off`** | No altera prompts; metadata `usedFeedback=false` |
| Legacy enable | `GENERATION_FEEDBACK_ENABLED` unset | No activa |
| Sync runtime al apply | `syncEnabled` default **`false`** | Solo marca `sync_pending` |
| Published en sync | `confirmPublish` default **`false`** | Published queda `stale` / `published_stale` |
| Quality gates bloqueantes | `QUALITY_GATE_POLICY_MODE` / policy file → **`advisory`** | No bloquea promoción |
| Escritura apply/sync/reindex | `confirm` / `--confirm` | Sin confirmación = dry-run |

### Qué partes están en producción y cuáles son opt-in

**En producción / cableado por defecto (comportamiento activo sin flags especiales):**

- Cola de corrections (crear, listar, aprobar, rechazar) vía Admin + `/api/admin/content-corrections`.
- Apply a disco pool-verified (con `confirm:true` desde Admin/CLI).
- Learning extract → crea `candidate` en Blobs (salvo typo / no reusable / `skipLearning`).
- Rebuild de `vocabIndex` v3 en **nuevas** partes vía `applyPartIndex` cuando falta índice o versión ≠ `v3-quality`.
- Canonicalize en `exam-part.js` al buscar por vocabulario.
- Quality gates en modo advisory al evaluar candidatos de staging (si se invoca `run_quality_on_candidate`).
- Admin UI Correcciones + Generation Feedback + badges staging.

**Opt-in / no default:**

- `GENERATION_FEEDBACK_MODE=preview|active`
- `syncEnabled=true` en apply, o CLI sync con `--confirm`
- `--confirm-publish` para published
- `QUALITY_GATE_POLICY_MODE=review|enforced`
- Reindex masivo P0-5 (`--confirm`) — operación batch manual
- Blobs reindex sin `NETLIFY_SITE_ID` + token

**Estado de datos local tras P0-5 (2026-07-11, confirm ejecutado en esta máquina):**

- `pool-verified` + `library/reusable-seed/de_B1.json` (+ `.bank.json`): reindexados a `v3-quality` (539 partes en informe; seed principal 384 records con versión).
- Blobs producción: **no** reindexados en esa corrida (sin credenciales en el informe local).
- Published: **no** reescrito por reindex.

---

## 2. Arquitectura

### Flujo completo (textual)

```
[Usuario / Admin en examen]
        │  edita campo (adminContentReview)
        ▼
 POST /api/admin/content-corrections
        │  status = pending
        ▼
 Blobs: content_correction:{id} + content_corrections_index
        │
        ▼
[Admin UI — Correcciones]
        │  approve / reject
        ▼
 status = approved | rejected
        │
        ▼
[Apply Engine]  confirm:true
        │  backup → patch disk JSON → validate
        │  status = applied | conflict | failed
        ├──────────────────────────────┐
        ▼                              ▼
 Learning Extraction            syncEnabled?
 extractLearningFromCorrection     │ false (default)
        │                          ▼
        │                   syncStatus = sync_pending
        ▼                          │
 reusable? ──no──► (skip)          │ true
        │                          ▼
        ▼                   syncCorrectionToRuntime
 createFeedback                    │
 status = candidate                ├─► seed (reusable-seed)
        │                          ├─► blobs reusable_part:* (+ applyPartIndex)
        ▼                          └─► published (solo confirmPublish)
[Admin UI — Generation Feedback]
 approve → approved
 activate (+ validateGenerationFeedbackRule) → active
 deprecate → deprecated
        │
        ▼
[Generación Gemini / templates]
 GENERATION_FEEDBACK_MODE
   off     → sin bloque; usedFeedback=false
   preview → bloque visible; usedFeedback=false (observación)
   active  → bloque en prompt; usedFeedback=true; solo reglas active
        │
        ▼
 batches/generated/*.json  (+ metadata feedback*)
        │
        ▼
[Staging / Quality Gates]  (pipeline de candidatos, no del apply)
 runQualityGates → qualityMetadata
 canPromotePart(policyMode)
        │
        ▼
 approve_candidate → pool / reusable-parts
        │
        ▼
[Pool runtime]
 seed + blobs vocabIndex (v3-quality si rebuild/reindex)
        │
        ▼
 Búsqueda vocab (exam-part / pool assembly)
 canonicalize → match lemma/concept/aliases
```

### Diagrama textual (compacto)

```
Corrección examen
    → Pending (Blobs)
    → Approved (Admin)
    → Apply → pool-verified (disco) + backup
         ├→ Learning → generation_feedback candidate
         │      → approved → active (gate) → Prompt (si MODE=active)
         │           → Nueva generación → Quality Gates (staging)
         │                → Pool / reusable
         └→ Sync Runtime (opt-in)
                → seed → blobs → published (opt-in publish)
```

### Capas de autoridad de contenido (hecho documentado en diseño previo y código sync)

1. **Published mocks** — snapshots de examen publicados (inmutables salvo sync con `confirmPublish` o scripts de publish).
2. **Blobs / seed personal (reusable parts)** — runtime de ensamblado de partes.
3. **pool-verified** — fuente de verdad de apply de corrections en disco.

Apply **no** escribe published ni blobs por defecto. Sync es el puente explícito.

---

## 3. Componentes

### 3.1 Content Corrections

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Capturar parches de contenido (examen/admin) con localización estable (`sourceFile`, `targetId`, `fieldPath` sin índices de array), revisión humana y cola en Blobs. |
| **Archivos** | `netlify/functions/lib/contentCorrectionSchema.js`; `scripts/lib/contentCorrectionSchema.mjs`; `netlify/functions/lib/contentCorrectionsStore.js`; `netlify/functions/content-corrections.js`; `netlify/functions/admin-api.js` (acciones mirror); `js/ui/admin/contentCorrectionsPanel.js`; `js/ui/exam/adminContentReview.js`; `admin.html` (tab corrections); `netlify.toml` redirects `/api/admin/content-corrections`. |
| **APIs** | Ver §13. GET/POST/PATCH/DELETE en `content-corrections`; acciones en `admin-api`. |
| **Dependencias** | Netlify Blobs store `lexicoil-data`; auth admin (JWT / `lc_token` + roles); schema de fieldPath. |
| **Entrada** | Payload corrección: `sourceFile`, `targetId`, `fieldPath`, `oldValue`, `newValue`, `reason`, `module`, `teil`, `origin` (`content`\|`assembly`), etc. |
| **Salida** | Registro Blobs `content_correction:{id}`; índice `content_corrections_index` (cap ~2000); estados de ciclo de vida. |

### 3.2 Apply Engine

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Aplicar correcciones `approved` al JSON en disco; detectar conflictos; backup; marcar `applied`/`conflict`/`failed`; opcional learning; opcional sync. |
| **Archivos** | `netlify/functions/lib/applyContentCorrections.js`; `scripts/lib/applyContentCorrections.mjs`; `scripts/apply-content-corrections.mjs`; `netlify/functions/lib/regenerateCorrectionMetadata.js`. |
| **APIs** | `dry_run_apply` / `apply_correction` / `apply_approved` (content-corrections); `dry_run_apply_corrections` / `apply_content_correction` / `apply_approved_corrections` (admin-api). |
| **Dependencias** | `contentCorrectionsStore`, schema, `extractLearningFromCorrection`, `generationFeedbackStore.createFeedback`, opcional `syncCorrectionToRuntime.mjs` (import dinámico). |
| **Entrada** | IDs de corrección `approved`; ctx: `confirm`, `dryRun`, `skipLearning`, `syncEnabled`, `confirmPublish`, `localOnly`, skips por capa, `email`, `projectRoot`. |
| **Salida** | JSON de pool (u otro path resuelto) parcheado; backup en `backups/content-corrections/`; corrección actualizada; learning opcional; sync opcional. |

**Resolución de archivo fuente (store):** preferencia `batches/ready/pool-verified/{sourceFile}.json`, con fallbacks a `batches/generated`, `batches/ready/lesen`, `batches/merged`.

**fieldPaths aplicables:** `title`, `text`, `topicTag`, `question`, `options`, `correct`, `correctAnswer`, `explanation`, `vocabularyTags`, `grammarTags`, `difficulty`, `transcript`, `signText`, `statement`.

### 3.3 Runtime Sync

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Tras apply a disco, localizar la misma parte en seed/blobs/published y aplicar el mismo parche de campo; actualizar `syncStatus`. |
| **Archivos** | `scripts/lib/syncCorrectionToRuntime.mjs`; `scripts/sync-correction-to-runtime.mjs`; usa `mergeSeedBlobPayload.mjs`, `partContentHash.mjs`, `publishedExamLib.mjs`, `reusablePartsStore.js`, `partIndex.applyPartIndex`, funciones de apply para localizar campo. |
| **APIs** | **Ninguna HTTP.** Solo CLI / llamada desde apply si `syncEnabled===true`. Admin apply **no** pasa `syncEnabled`. |
| **Dependencias** | Corrección `applied` + archivo pool-verified legible; Blobs credenciales para capa blob/published remota. |
| **Entrada** | Corrección o `--id`; flags `--dry-run`\|`--confirm`, `--confirm-publish`, `--local-only`, `--skip-blob/seed/published`. |
| **Salida** | Seed actualizado; blob `reusable_part:*` (con `applyPartIndex` force); published opcional; `syncStatus` ∈ `sync_pending`\|`synced`\|`sync_failed`\|`published_stale`. |

### 3.4 Learning Extraction

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Decidir si una corrección aplicada produce una regla de generación reutilizable. |
| **Archivos** | `netlify/functions/lib/extractLearningFromCorrection.js`. |
| **APIs** | Ninguna directa; invocado por Apply Engine. |
| **Dependencias** | Schema/types de feedback; `createFeedback` del store. |
| **Entrada** | Corrección `applied` (valores old/new, reason, fieldPath, módulo). |
| **Salida** | `{ reusable, kind, feedback?, skipReason? }`. Typos / edits mínimos → `reusable:false`. Si reusable → feedback draft (tipo lexical/grammar/naturalness/cefr/exam_quality/…). |

### 3.5 Generation Feedback

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Almacenar reglas de aprendizaje; workflow de promoción; resolución hacia prompts; auditoría. |
| **Archivos** | `netlify/functions/lib/generationFeedbackSchema.js`; `generationFeedbackStore.js`; `validateGenerationFeedbackRule.js`; `generationFeedbackResolver.js`; `auditGenerationFeedback.js`; façades `scripts/lib/generationFeedbackResolver.mjs`, `scripts/lib/resolveGenerationFeedback.mjs`; cableado `scripts/lib/examTemplatePrompt.mjs`, `lesenTemplatePrompt.mjs`, `generatePartGeminiLib.mjs`; UI `js/ui/admin/generationFeedbackPanel.js`; scripts audit/preview (ver §12). **Distinto:** `scripts/lib/generationFeedback.mjs` y `submit-feedback.js` / `feedbackModal.js` = feedback de usuario sobre batches/vocab, no el learning loop de corrections. |
| **APIs** | Acciones approve/activate/deprecate/update/list en content-corrections y admin-api (ver §13). |
| **Dependencias** | Blobs `generation_feedback:{id}`, índice `generation_feedback_index` (cap ~3000); env mode flags. |
| **Entrada** | Draft desde learning o edición admin (`rule`, `category`, `severity`, `evidence[]`, `examples[]`, wrong/correct, …). |
| **Salida** | Reglas con status; en generación: bloque de prompt + metadata `usedFeedback`, `feedbackRules`, `feedbackCount`, `feedbackCategories`, `feedbackMode`, `feedbackVersion` (`v1`). |

**Consumo en generación:** solo status `active` (`GENERATION_STATUSES`). Cap default `DEFAULT_MAX_FEEDBACK_RULES = 12`.

**Gate de activación (`validateGenerationFeedbackRule`):** rechaza tipográficos, cambios solo de mayúsculas, categorías no permitidas, reglas genéricas/overbroad, falta de evidencia según reglas del gate; `requireRule: true` en activate.

### 3.6 Vocabulary Index

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Índice de vocabulario de parte para búsqueda/ranking en pool; versión `v3-quality`. |
| **Archivos** | `netlify/functions/lib/vocabIndexQuality.js`; `scripts/lib/vocabIndexQuality.mjs`; `netlify/functions/lib/partIndex.js`; consumidores: `reusablePartsStore.js`, `exam-part.js`, `poolSearchCache` (vía keys), `publishToPool.mjs`, `push-seed-to-blobs.mjs`, `enrich-reusable-index.mjs`, sync blob path. |
| **APIs** | Indirecto: `exam-part` query param `words`; UI exam generation pool assembly. |
| **Dependencias** | Sets `NEVER_INDEX`, `TYPO_OR_TRUNCATED`, `BARE_LIGHT_VERBS`, `KEEP_FULL_VERBS`, `CONCEPT_FAMILIES`, lemma sets CEFR; `MAX_VOCAB_INDEX=45`. |
| **Entrada** | Texto de parte (`partText`) + `vocabularyTags` (preguntas / parte). |
| **Salida** | `vocabIndex: [{ word, lemma, concept?, aliases?, sources[], quality:'validated' }]`, `vocabIndexVersion:'v3-quality'`. También puede setear `topicTag`/`topicSlug` vía `applyPartIndex` (no vía reindex P0-5). |

### 3.7 Canonicalization

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Normalizar términos de búsqueda/query antes de match contra índice. |
| **Archivos / dos caminos coexistentes** | **A)** `canonicalizeVocabQuery` en `vocabIndexQuality.js` — typos map, lemma, concept, aliases, expansión `verzichten_auf`↔`verzichten`; usado en `partIndex.normalizeSearchWords` / `buscar`, `exam-part.js`. **B)** `ManualVocab.canonicalizeForGeneration` en `js/data/manualVocab.js` — índice de biblioteca + spelling overrides + Levenshtein; usado en `js/ui/exam/examGeneration.js` (live/hybrid y pool assembly cliente). |
| **APIs** | Query vocab en exam-part; flujo UI de generación. |
| **Dependencias** | A: quality maps; B: word index de library. |
| **Entrada** | Lista de palabras del usuario / config. |
| **Salida** | A: `{ words, corrections, version }`; B: formas canónicas de spelling/library. |

### 3.8 Reindex v3

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Alinear índices existentes al pipeline v3 sin regenerar contenido. |
| **Archivos** | `scripts/lib/reindexVocabV3.mjs`; `scripts/reindex-vocab-v3.mjs`; reporte `batches/generated/vocab-reindex-v3-report.json`. |
| **APIs** | Ninguna. |
| **Dependencias** | `partText`, `buildVocabIndex`, Blobs opcional. |
| **Entrada** | Capas `pool-verified`, `seed`, `blobs`; `--dry-run` XOR `--confirm`. |
| **Salida** | Solo `vocabIndex` + `vocabIndexVersion` (+ lang/level/id auxiliares en batch roots si faltaban); backups seed `*.pre-v3-reindex.*`; informe numérico; skip si ya `v3-quality` con lemma. |

### 3.9 Quality Gates

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Evaluar candidatos de staging (integridad JSON, estructura Goethe, CEFR, language quality, metadata); política de promoción. **No** se ejecutan en el apply de corrections. |
| **Archivos** | `scripts/lib/qualityGates/qualityGateRunner.mjs` + CJS `netlify/functions/lib/qualityGateRunner.js`; `qualityGatePolicy.json` + `qualityGatePolicy.js` / `.mjs`; `stagingQualityBridge.mjs`; `buildQualityDashboard.mjs`; `pipelineIntegration.mjs`; gates individuales (`metadataSchemaGate.mjs`, `duplicateContentGate.mjs`, `passageCoherenceGate.mjs`, `answerKeyCoherenceGate.mjs`, `semanticCoherenceGate.mjs`, `contentTopicCheck.mjs`, …); schemas `qualityGates/schema/*.json`; CLI `scripts/run-quality-gates.mjs`; tests bajo `scripts/lib/qualityGates/__tests__/`. Gates legacy aparte: `netlify/functions/lib/partQualityGate.js`, `examQualityGate.js` (preexistentes al runner PASO 9). |
| **APIs** | `admin-api`: `run_quality_on_candidate`, `approve_candidate` (usa `canPromotePart`). |
| **Dependencias** | Policy file; env `QUALITY_GATE_POLICY_MODE`. |
| **Entrada** | Parte / candidato staging; opciones `forceApprove`, `manualReviewed`. |
| **Salida** | Report + `qualityMetadata`; staging hints `candidate_ready`\|`needs_review`\|`rejected`; dashboard JSON en `generation-evaluation/reports/QUALITY-DASHBOARD.json` (CLI). **No hay tab Admin “Quality Dashboard”.** |

### 3.10 Admin UI

| Campo | Detalle |
|-------|---------|
| **Finalidad** | Operar corrections, feedback promotion, quality en staging. |
| **Archivos** | `admin.html`; `js/ui/admin/contentCorrectionsPanel.js`; `js/ui/admin/generationFeedbackPanel.js`; lógica staging inline en `admin.html`; `js/ui/exam/adminContentReview.js`. |
| **APIs** | Principalmente `admin-api` actions; creación desde examen vía `/api/admin/content-corrections`. |
| **Dependencias** | Auth admin; Blobs vía functions. |
| **Entrada** | Interacciones de UI (filtros, botones approve/apply/activate). |
| **Salida** | Llamadas API; sin sync runtime UI; sin reindex UI. |

---

## 4. Estado de cada módulo

| Módulo | Estado | Justificación |
|--------|--------|---------------|
| Content Corrections (cola + schema + store + UI + API) | **IMPLEMENTADO** | CRUD, estados, panel, exam review create, redirects. |
| Apply Engine | **IMPLEMENTADO** | Apply/dry-run, conflictos, backups, metadata regen, learning hook. |
| Runtime Sync | **IMPLEMENTADO** (opt-in) | Código + CLI + tests; **no** cableado por defecto en Admin apply (`syncEnabled` false). |
| Learning Extraction | **IMPLEMENTADO** | Heurística + createFeedback candidate; typos skip. |
| Generation Feedback store + promote UI | **IMPLEMENTADO** | Workflow P0-2, gate, panel, APIs. |
| Generation Feedback → Prompt | **PARCIAL** | Cableado en templates/generators existe; **default MODE=off** → no efecto en producción hasta activar flag. |
| Vocabulary Index v3 build | **IMPLEMENTADO** | `buildVocabIndex` / `applyPartIndex` versionados. |
| Canonicalization (servidor) | **IMPLEMENTADO** | `canonicalizeVocabQuery` en exam-part / partIndex. |
| Canonicalization (cliente UI) | **IMPLEMENTADO** (camino distinto) | `ManualVocab.canonicalizeForGeneration` — no es el mismo módulo v3. |
| Reindex v3 | **IMPLEMENTADO** | CLI + helpers + tests; local pool+seed confirmados; blobs/published según alcance. |
| Quality Gates runner + policy | **IMPLEMENTADO** (advisory default) | Runner + policy + staging bridge + CLI; no bloquea prod por default. |
| Admin UI sync / reindex / feedback mode toggle | **PENDIENTE** / ausente | No hay UI para sync runtime, reindex, ni toggle de `GENERATION_FEEDBACK_MODE`. |
| Auto-activate feedback | **PENDIENTE** (explícitamente no existe) | Solo activate admin + gate. |
| Published auto-update en apply | **PENDIENTE** (explícitamente bloqueado) | Requiere sync + `confirmPublish`. |

---

## 5. Cambios sobre la arquitectura original

### Antes (pre learning-loop / pre v3)

- Correcciones de contenido: no había cola Blobs formal PASO 4–5; fixes eran manuales sobre JSON/batches.
- Runtime: usuarios/consumidores leían seed/blobs/published **sin** puente automático desde un apply de corrección.
- Generación: prompts sin bloque de reglas aprendidas de corrections.
- Staging: gates de pool-ready / finalize previos; no el orquestador PASO 9 con `qualityMetadata` unificado ni policy PASO 10.
- `vocabIndex`: entradas legacy principalmente `{ word }` (post `enrich-reusable-index`); sin `vocabIndexVersion`, sin filtro de ruido/typos/concept families, sin aliases estructurados.
- Búsqueda: match sobre keys simples de words; sin canonicalize v3 de query en servidor.

### Ahora

- Cola corrections + apply a pool-verified + learning candidates.
- Sync runtime explícito y auditable (`syncStatus`).
- Feedback promote workflow; prompts gated por MODE.
- Quality policy modes sobre staging promote.
- Índice v3-quality en pipeline nuevo + reindex batch local ejecutado.
- Dos canonicalize coexistentes (servidor v3 vs cliente ManualVocab).

### Módulos modificados / añadidos (inventario de archivos del loop)

**Nuevos / centrales del loop:**  
`contentCorrectionSchema.js`, `contentCorrectionsStore.js`, `applyContentCorrections.js`, `regenerateCorrectionMetadata.js`, `extractLearningFromCorrection.js`, `content-corrections.js`, `generationFeedbackSchema.js`, `generationFeedbackStore.js`, `generationFeedbackResolver.js`, `validateGenerationFeedbackRule.js`, `auditGenerationFeedback.js`, `syncCorrectionToRuntime.mjs`, `sync-correction-to-runtime.mjs`, `apply-content-corrections.mjs`, `vocabIndexQuality.js`, `reindexVocabV3.mjs`, `reindex-vocab-v3.mjs`, `qualityGateRunner` (+ policy + bridge + dashboard), paneles admin, tests listados en §11, scripts audit/preview.

**Modificados para integrar:**  
`partIndex.js` (rebuild v3), `exam-part.js` (canonicalize), `examGeneration.js` (canonicalize cliente en pool path), `reusablePartsStore.js` / publish/push scripts (stamp index), `admin-api.js`, `admin.html`, templates de prompt (`examTemplatePrompt.mjs`, `lesenTemplatePrompt.mjs`, `generatePartGeminiLib.mjs`), façades ESM bajo `scripts/lib/*`.

---

## 6. Flujo de datos

### Una corrección

1. Create → Blobs record `pending` (+ index).
2. Approve → `approved` (PATCH/update; no escribe pool).
3. Apply confirm → lee batch disco; compara `oldValue`; si mismatch → `conflict`; si ok → backup, escribe campo, `regenerateCorrectionMetadata`, `applied`.
4. Learning (default on): extract → maybe `generation_feedback` `candidate`.
5. Sync (default off): `syncStatus=sync_pending` + history `syncEnabled=false`.
6. Sync CLI confirm: patch seed record matching partId; blob get/merge/`applyPartIndex`/setJSON; published solo con confirmPublish; actualiza `syncStatus`.

### Un `vocabularyTag`

1. Vive en `questions[].vocabularyTags` (u otros) del JSON de contenido — **no** lo borra el reindex P0-5.
2. Apply puede parchear `vocabularyTags` si fieldPath lo permite.
3. `collectVocabularyTags` + tokens de texto alimentan `buildVocabIndex`.
4. Tags en `NEVER_INDEX` / typos / bare light verbs **no** entran al índice (pueden seguir en el array `vocabularyTags` del JSON).
5. Entrada indexada lleva `sources` incluyendo `'vocabularyTag'` cuando aplica.
6. Búsqueda no usa el array crudo de tags del pool search path principal; usa `vocabIndex` / vocabKeys derivados.

### Una regla de feedback

1. Nace `candidate` (createFeedback / learning).
2. Admin `approve` → `approved`.
3. Admin `activate` → valida gate → `active` (+ `activatedAt`/`activatedBy` según store).
4. `updateFeedback` edita campos pero **no** puede cambiar `status`.
5. Resolver con MODE=active: lista solo `active`, prioriza severity, cap 12, filtra módulo, append al prompt, metadata en output.
6. MODE=off: no carga efecto; MODE=preview: puede construir preview sin marcar usedFeedback de producción según resolver.

### Un apply

Ver §3.2 y §6 corrección. Garantía documentada: no escribe seed/blobs/published salvo `syncEnabled`. Admin API apply no setea `syncEnabled`.

### Una búsqueda de vocabulario

**Servidor (`exam-part.js`):** words → `canonicalizeVocabQuery` → lemmas → `pickReusablePartByVocab` / scoring sobre índices de partes (blobs/seed).

**Cliente pool assembly (`examGeneration.js`):** config words → `ManualVocab.canonicalizeForGeneration` → búsqueda pool; el match final depende de keys construidas desde `vocabIndex` de partes cargadas.

**partIndex.buscar:** canonicalize vía `normalizeSearchWords` → `scorePartWordCoverage` (lemma/concept/aliases) → opcional `rankPartsByVocab`.

### Una generación nueva

1. Generator resuelve feedback (`resolveGenerationFeedbackRules` / resolver) según MODE.
2. Template append bloque si procede.
3. Gemini produce JSON → `batches/generated/`.
4. Metadata feedback stamp si modo lo indica.
5. Downstream staging puede correr quality gates (separado del apply de corrections).
6. Promoción a pool/reusable vía `approve_candidate` y/o scripts de publish/push (fuera del apply de una sola corrección).

---

## 7. Flags

| Flag | Default | Dónde | Qué hace | Al activarlo |
|------|---------|-------|----------|--------------|
| `GENERATION_FEEDBACK_MODE` | unset → **`off`** | `generationFeedbackResolver.resolveFeedbackMode` | Modo A/B | `preview`: observación; `active`: inyecta reglas active en prompt |
| `GENERATION_FEEDBACK_ENABLED` | unset | mismo | Legacy boolean | `1/true/yes/on` → trata como `active` |
| `opts.feedbackMode` / `opts.enabled` | — | llamada resolver | Override explícito | Gana sobre env |
| `syncEnabled` | **`false`** | apply ctx | Sync runtime post-apply | `true` ejecuta `syncCorrectionToRuntime` con confirm |
| `confirmPublish` | **`false`** | apply/sync | Published | `true` permite escribir published |
| `localOnly` | **`false`** | sync | Evita writes remotos Blobs | Usa paths locales published/seed |
| `skipBlob` / `skipSeed` / `skipPublished` | **`false`** | sync | Omite capas | — |
| `skipLearning` | **`false`** | apply | Omite createFeedback | — |
| `dryRun` / ausencia de `confirm` | dry-run por defecto en CLIs | apply/sync/reindex | No escribe | — |
| `confirm: true` / `--confirm` | false | apply/sync/reindex | Escritura real | — |
| `CONTENT_CORRECTIONS_STORE=memory` | unset (Blobs) | store | Tests/CLI memoria | — |
| `QUALITY_GATE_POLICY_MODE` | unset → file **`advisory`** | policy loader | Modo promoción | `review` / `enforced` cambian `canPromotePart` |
| `REUSABLE_WRITE_TIMEOUT_MS` | **20000** | reindex blobs | Timeout setJSON | — |
| `NETLIFY_SITE_ID` + `NETLIFY_API_TOKEN` / `NETLIFY_AUTH_TOKEN` | — | CLI Blobs | Acceso store | Requerido para blobs confirm |
| `ADMIN_EMAIL` | `cli@local` | apply CLI | Actor history | — |
| Policy JSON `mode` | **`advisory`** | `qualityGatePolicy.json` | Baseline | — |
| Policy `failBlocksPromotion` | **`false`** | thresholds | Con advisory no bloquea | En enforced/review interactúa con modo |
| Policy `warningRequiresReview` | **`true`** | thresholds | Warnings piden review en modos no advisory | — |
| `forceApprove` / `manualReviewed` | false | `approve_candidate` | Override promoción | Permite promover pese a bloques de policy |

Constantes relacionadas (no env): `DEFAULT_MAX_FEEDBACK_RULES=12`, `FEEDBACK_VERSION='v1'`, `VOCAB_INDEX_VERSION='v3-quality'`, `MAX_VOCAB_INDEX=45`, store name `lexicoil-data`.

---

## 8. Persistencia

### Blobs (`lexicoil-data`)

| Key pattern | Quién escribe | Quién consume |
|-------------|---------------|---------------|
| `content_correction:{id}` | store create/update/apply | Admin API, apply, sync |
| `content_corrections_index` | store | listados |
| `generation_feedback:{id}` | createFeedback, approve/activate/deprecate | resolver, admin, audits |
| `generation_feedback_index` | store | listados |
| `reusable_part:{lang}:{level}:{module}:{id}` | addReusablePart, sync, reindex blobs, push-seed | exam-part, pool search |
| `reusable_part_idx:...` | reusablePartsStore | list/index |
| `published_exam:{lang}:{level}:{examId}` | publish scripts, sync+confirmPublish | runtime published |
| `published_catalog:{lang}:{level}` | idem | catálogo |

### Seed

| Path | Quién escribe | Quién consume |
|------|---------------|---------------|
| `library/reusable-seed/{lang}_{level}.json` | sync confirm, reindex confirm, enrich-reusable-index, push flows | exam-part fallback, pool cache, sync |
| `library/reusable-seed/{lang}_{level}.bank.json` | reindex (si existe), otros flujos bank | mismo |
| `library/reusable-seed/backups/*.pre-v3-reindex.*` | reindex | recuperación manual |
| otros backups seed previos | enrich / jobs anteriores | — |

### Pool

| Path | Quién escribe | Quién consume |
|------|---------------|---------------|
| `batches/ready/pool-verified/*.json` | apply, reindex vocab fields, otros scripts pool | apply source of truth, assembly, sync read, reindex |
| `batches/generated/*.json` | generadores | staging, audits feedback metadata |
| Fallbacks apply | — | si no está en pool-verified |

### Published

| Path / key | Quién escribe | Quién consume |
|------------|---------------|---------------|
| Blobs published_* | publish + sync confirmPublish | app published exams |
| `library/published-exams/{lang}/{level}/` | sync local / publish local | fallback local |
| Reindex v3 | **no escribe** | — |

### Runtime

Consumidores de partes indexadas: `exam-part.js`, UI generación/pool, `reusablePartsStore.pickReusablePartByVocab`, caches de vocabKeys. Tras apply sin sync, runtime **sigue** sirviendo seed/blobs/published antiguos hasta sync/reindex/publish.

### Backups

| Backup | Origen |
|--------|--------|
| `backups/content-corrections/{basename}_{stamp}.json` | Apply |
| `library/reusable-seed/backups/*.pre-v3-reindex.*` | Reindex seed |
| Backups varios históricos en `backups/` | otros jobs (no exclusivos del loop) |

### Reportes / artefactos

| Path | Origen |
|------|--------|
| `batches/generated/vocab-reindex-v3-report.json` | reindex CLI |
| `generation-evaluation/quality-reports/*` | run-quality-gates |
| `generation-evaluation/reports/QUALITY-DASHBOARD.json` | dashboard builder |
| `generation-evaluation/feedback-audit-latest.json` | audit feedback |

---

## 9. Compatibilidad

### Hacia atrás

- **Corrections:** orígenes `content` y `assembly`; assembly no se auto-aplica a disco sin `sourceFile` resoluble.
- **Feedback:** tipos legacy + categories nuevas; solo `active` en generación.
- **vocabIndex:** `vocabEntryKey` / `vocabEntryKeys` aceptan string legacy `{word}` y objetos v3.
- **applyPartIndex:** si `vocabIndexVersion !== v3-quality` o vacío → rebuild automático al indexar parte (force o needsRebuild).
- **Resolver mode:** `GENERATION_FEEDBACK_ENABLED` legacy sigue mapeando a active.
- **Quality:** policy advisory no cambia comportamiento bloqueante previo de producción.

### Migraciones existentes

- **P0-5 reindex:** migración de metadata de vocab en pool-verified + seed local (ejecutada 2026-07-11 en entorno documentado); blobs pendientes de corrida con credenciales.
- **No** hay migración SQL del learning loop (corrections/feedback viven en Blobs). `supabase/migrations/006_feedback.sql` pertenece al feedback de usuario distinto.
- **schemaVersion** de partes: `applyPartIndex` puede subir a `>=2` cuando corre (reindex P0-5 **no** llama applyPartIndex; solo buildVocabIndex).

### Versiones que conviven

| Versión | Dónde |
|---------|-------|
| `vocabIndexVersion: 'v3-quality'` | Pipeline nuevo; seed/pool local post-reindex |
| Índice legacy `{word}` sin version | Posible en blobs/published no reindexados |
| `feedbackVersion: 'v1'` | Metadata generación |
| Policy quality modes | advisory (default) / review / enforced |
| Feedback statuses | candidate, approved, active, deprecated |
| Correction statuses + syncStatuses | dos ejes independientes |

---

## 10. Riesgos conocidos

Limitaciones y decisiones conscientes (sin soluciones):

1. **Apply ≠ runtime por defecto:** usuarios pueden seguir viendo texto viejo en seed/blobs/published tras `applied` hasta sync manual.
2. **Admin apply no activa sync:** ni UI ni API pasan `syncEnabled`.
3. **Published requiere doble confirmación:** fácil quedar en `published_stale`.
4. **Generation feedback default off:** reglas `active` no afectan generación hasta env/ops.
5. **Quality gates default advisory:** FAIL no bloquea promoción en advisory.
6. **Dos canonicalizers distintos** (servidor v3 vs ManualVocab cliente): mismas palabras de usuario pueden normalizarse distinto según path.
7. **`vocabularyTags` sucios pueden permanecer** en JSON aunque el índice los filtre.
8. **Cap 45** en vocabIndex: conceptos presentes en texto pueden no entrar al índice (p.ej. ranking).
9. **Lemmatizer artifacts** visibles en v3 (p.ej. lemma truncado `verzich` con concept `verzichten`) — comportamiento actual del pipeline.
10. **Aliases sum ≈ 0** en reindex masivo local: aliases solo en colocaciones; fusión de conceptos puede perder aliases según scoring.
11. **Blobs/producción pueden mezclar** índices legacy y v3 hasta reindex blobs + publish habitual.
12. **Learning typos no reutilizan** y gate bloquea `typo` en activate — decisión consciente.
13. **`updateFeedback` no cambia status** — evita bypass del workflow.
14. **Deprecated no reabre** (`FEEDBACK_TRANSITIONS.deprecated=[]`).
15. **Assembly-origin corrections** no aplican automáticamente a código de assembly.
16. **Reindex no toca published** — decisión explícita P0-5.
17. **Quality dashboard solo fichero** — no tab Admin.
18. **Sync puede fallar** si no resuelve partId en blob (no inventa IDs) → `sync_pending` / missing.
19. **Tests no cubren** E2E producción Netlify ni reindex blobs real.
20. **Deuda:** coexistencia gates legacy (`partQualityGate` / `examQualityGate`) con runner PASO 9; naming “PASO” inconsistente entre docs.

---

## 11. Tests

Ejecución típica: `node <path-to-test.mjs>`.

| Test | Cubre | No cubre |
|------|-------|----------|
| `scripts/lib/__tests__/contentCorrectionSchema.test.mjs` | Validación payload, fieldPath sin índices, origins, default pending | Persistencia Blobs real |
| `scripts/lib/__tests__/contentCorrectionsStore.test.mjs` | Dedupe, no-op, assembly origin, valuesEqual | Auth HTTP |
| `scripts/lib/__tests__/applyContentCorrections.test.mjs` | Dry-run, conflicto, write+backup, learning grammar/lexical, typo skip | Sync runtime, Admin API |
| `scripts/lib/__tests__/syncCorrectionToRuntime.test.mjs` | Resolve partId, dry-run targets, seed confirm, published stale vs confirmPublish | Blobs red real |
| `scripts/lib/__tests__/generationFeedbackResolver.test.mjs` | Solo active, filtros, typo/narrow ban, dedupe, preview | Persistencia |
| `scripts/lib/__tests__/generationFeedbackPromptWire.test.mjs` | Flag off, append active, módulo, cap, metadata | Gemini real |
| `scripts/lib/__tests__/generationFeedbackPaso8.test.mjs` | Activation gate, modos off/preview/active, audit | UI |
| `scripts/lib/__tests__/generationFeedbackPaso13.test.mjs` | Promote workflow, invalid activate, update sin status, metrics | Admin HTML |
| `scripts/lib/__tests__/vocabIndexQuality.test.mjs` | mitmachen/machen, NEVER_INDEX, typos, families, rank/buscar | Reindex CLI |
| `scripts/lib/__tests__/reindexVocabV3.test.mjs` | Skip v3, fingerprint contenido, diff noise/typo, batch shape | Blobs write |
| `scripts/lib/qualityGates/__tests__/qualityGateRunner.test.mjs` | Orquestador PASO 9 | Promote Admin E2E |
| `scripts/lib/qualityGates/__tests__/qualityGatePolicy.test.mjs` | canPromotePart, buildQualityMetadata, modos | — |
| `scripts/lib/qualityGates/__tests__/qualityGates.test.mjs` | Gates individuales del pack | — |
| `scripts/lib/qualityGates/__tests__/answerKeyCoherenceGate.test.mjs` | Coherence gate + fixtures | — |

**No son tests unitarios del loop pero existen:** `scripts/test-pool-index-search.mjs`, `scripts/verify-pool-index.mjs`, `scripts/test-submit-feedback.mjs` (feedback usuario).

---

## 12. Scripts nuevos (y satélites del loop)

| Script | Qué hace | Cómo se ejecuta | ¿Modifica datos? |
|--------|----------|-----------------|------------------|
| `scripts/apply-content-corrections.mjs` | Apply/dry-run corrections | `node scripts/apply-content-corrections.mjs --dry-run` / `--confirm` | Sí con `--confirm` (pool + Blobs status/feedback) |
| `scripts/sync-correction-to-runtime.mjs` | Sync runtime | `node scripts/sync-correction-to-runtime.mjs --dry-run --id cc-…` / `--confirm` [`--confirm-publish`] | Sí con `--confirm` |
| `scripts/reindex-vocab-v3.mjs` | Reindex v3 | `--dry-run` XOR `--confirm`; `--layers`; `--lang`; `--level` | Sí con `--confirm` (vocab metadata) |
| `scripts/run-quality-gates.mjs` | Corre gates + reports | `node scripts/run-quality-gates.mjs …` | Escribe reports bajo `generation-evaluation/` (no pool por defecto) |
| `scripts/preview-generation-feedback.mjs` | Preview prompt/rules | `node scripts/preview-generation-feedback.mjs --module lesen …` | Solo lectura |
| `scripts/audit-generation-feedback.mjs` | Auditoría store feedback | `node scripts/audit-generation-feedback.mjs [--out]` | Opcional escribe JSON report |
| `scripts/audit-generation-feedback-metrics.mjs` | Métricas en batches generated | `--batches batches/generated` | Solo lectura |
| `scripts/audit-generated-with-feedback.mjs` | Chequea avoid-phrases | `--file …` | Solo lectura |
| `scripts/prepare-generation-evaluation.mjs` | Harness A/B docs | `node scripts/prepare-generation-evaluation.mjs` | Solo lectura / docs |
| `scripts/enrich-reusable-index.mjs` | Enrich topic+vocab (pre-P0-5; `--apply`) | `--lang --level [--apply]` | Sí con `--apply` (también force topic) |

**Libs CLI asociadas (no entrypoints):**  
`scripts/lib/syncCorrectionToRuntime.mjs`, `reindexVocabV3.mjs`, `applyContentCorrections.mjs`, `contentCorrectionSchema.mjs`, `generationFeedbackResolver.mjs`, `resolveGenerationFeedback.mjs`, `qualityGates/*`, `vocabIndexQuality.mjs`.

---

## 13. APIs nuevas

### Auth común

JWT Bearer o cookie `lc_token` + rol admin (`lc_admin_roles` / chequeos en functions). Sin auth admin → rechazo.

### `/.netlify/functions/content-corrections`  
Alias: `/api/admin/content-corrections` (`netlify.toml`)

| Método | Acción / query | Payload relevante | Respuesta típica |
|--------|----------------|-------------------|------------------|
| GET | `?status=pending` (default) | — | lista corrections |
| GET | `?id=` | — | una correction |
| POST | create | campos corrección | `{ ok, correction }` / errores validación |
| POST | `action=dry_run_apply` | filtros batch | resultado dry-run |
| POST | `action=apply_correction` | `{ id, confirm? }` | apply result; confirm≠true → dry |
| POST | `action=apply_approved` | `{ confirm? }` | batch result |
| POST | `action=list_generation_feedback` | filtros status | lista rules |
| POST | `action=approve_generation_feedback` | `{ id }` | rule approved |
| POST | `action=activate_generation_feedback` | `{ id, rule?, … }` | active o error gate |
| POST | `action=deprecate_generation_feedback` | `{ id, note? }` | deprecated |
| POST | `action=update_generation_feedback` | `{ id, fields… }` **sin status** | updated |
| PATCH | `?id=` | status/fields permitidos | updated (no fuerza applied/conflict/failed desde API genérica) |
| DELETE | `?id=` / `hard=1` | — | soft reject o hard delete |

**No expone:** sync runtime, reindex, toggle GENERATION_FEEDBACK_MODE.

### `/.netlify/functions/admin-api`

| action | Método | Notas |
|--------|--------|-------|
| `content_corrections` | GET | list |
| `content_correction` | GET | one |
| `generation_feedback` | GET | default status candidate |
| `generation_feedback_one` | GET | one |
| `create_content_correction` | POST | create |
| `update_content_correction` | POST | patch |
| `reject_content_correction` | POST | reject |
| `dry_run_apply_corrections` | POST | dry-run |
| `apply_content_correction` | POST | apply one (**sin syncEnabled**) |
| `apply_approved_corrections` | POST | batch |
| `update_generation_feedback` | POST | edit fields |
| `approve_generation_feedback` | POST | approve |
| `activate_generation_feedback` | POST | activate+gate |
| `deprecate_generation_feedback` | POST | deprecate |
| `run_quality_on_candidate` | POST | `{ id, lang, level, persist? }` |
| `approve_candidate` | POST | `{ id, forceApprove?, manualReviewed? }` + `canPromotePart` |

### Relacionadas (no “nuevas” del loop pero consumidoras)

- `exam-part` — búsqueda vocab con canonicalize v3.
- `submit-feedback` — feedback de usuario (otro dominio).

---

## 14. Resumen final

| Componente | Estado | Cobertura | Dependencias | Riesgo |
|------------|--------|-----------|--------------|--------|
| Content Corrections | IMPLEMENTADO | Schema/store/API/UI/tests | Blobs, auth admin | Medio: assembly origin sin apply automático |
| Apply Engine | IMPLEMENTADO | Tests apply+conflict+backup+learning | Disco pool-verified, store | Alto operacional: applied ≠ visible runtime |
| Runtime Sync | IMPLEMENTADO opt-in | Tests sync seed/published flags | Seed, Blobs, published lib | Alto si se olvida CLI; published_stale |
| Learning Extraction | IMPLEMENTADO | Cubierto en apply tests | feedback store | Bajo–medio: heurística puede saltar casos |
| Generation Feedback store/UI | IMPLEMENTADO | Tests P0-2/8 | Blobs, gate | Medio: reglas activas sin efecto si MODE=off |
| Feedback → Prompt | PARCIAL (flag off) | Tests wire/resolver | MODE env, templates | Alto de “falsa sensación” de loop cerrado |
| Vocabulary Index v3 | IMPLEMENTADO | Tests quality | partIndex, lemma sets | Medio: cap 45, lemmas raros |
| Canonicalization | IMPLEMENTADO dual | Tests servidor; ManualVocab aparte | exam-part vs UI | Medio: divergencia paths |
| Reindex v3 | IMPLEMENTADO | Tests helpers; confirm local hecho | CLI, opcional Blobs | Medio: blobs/published pueden quedar legacy |
| Quality Gates | IMPLEMENTADO advisory | Tests runner/policy/gates | staging, policy file | Medio: advisory no bloquea |
| Admin UI | IMPLEMENTADO parcial | Paneles corrections/feedback/staging | admin-api | Medio: sin sync/reindex/mode controls |

---

## Anexo A — Inventario de archivos del learning loop (para revisión Claude)

### Core Netlify
- `netlify/functions/content-corrections.js`
- `netlify/functions/admin-api.js` (acciones listadas)
- `netlify/functions/lib/contentCorrectionSchema.js`
- `netlify/functions/lib/contentCorrectionsStore.js`
- `netlify/functions/lib/applyContentCorrections.js`
- `netlify/functions/lib/regenerateCorrectionMetadata.js`
- `netlify/functions/lib/extractLearningFromCorrection.js`
- `netlify/functions/lib/generationFeedbackSchema.js`
- `netlify/functions/lib/generationFeedbackStore.js`
- `netlify/functions/lib/generationFeedbackResolver.js`
- `netlify/functions/lib/validateGenerationFeedbackRule.js`
- `netlify/functions/lib/auditGenerationFeedback.js`
- `netlify/functions/lib/vocabIndexQuality.js`
- `netlify/functions/lib/partIndex.js`
- `netlify/functions/lib/qualityGateRunner.js`
- `netlify/functions/lib/qualityGatePolicy.js`
- `netlify/functions/exam-part.js` (canonicalize consumer)
- `netlify/functions/lib/reusablePartsStore.js`
- `netlify/functions/lib/blobStore.js` (`STORE_NAME=lexicoil-data`)

### Scripts / libs
- `scripts/apply-content-corrections.mjs`
- `scripts/sync-correction-to-runtime.mjs`
- `scripts/lib/syncCorrectionToRuntime.mjs`
- `scripts/reindex-vocab-v3.mjs`
- `scripts/lib/reindexVocabV3.mjs`
- `scripts/lib/applyContentCorrections.mjs`
- `scripts/lib/contentCorrectionSchema.mjs`
- `scripts/lib/vocabIndexQuality.mjs`
- `scripts/lib/generationFeedbackResolver.mjs`
- `scripts/lib/resolveGenerationFeedback.mjs`
- `scripts/lib/examTemplatePrompt.mjs`
- `scripts/lib/lesenTemplatePrompt.mjs`
- `scripts/lib/generatePartGeminiLib.mjs`
- `scripts/lib/mergeSeedBlobPayload.mjs`
- `scripts/lib/publishedExamLib.mjs`
- `scripts/preview-generation-feedback.mjs`
- `scripts/audit-generation-feedback.mjs`
- `scripts/audit-generation-feedback-metrics.mjs`
- `scripts/audit-generated-with-feedback.mjs`
- `scripts/prepare-generation-evaluation.mjs`
- `scripts/run-quality-gates.mjs`
- `scripts/enrich-reusable-index.mjs` (precedente indexación)
- `scripts/lib/qualityGates/qualityGateRunner.mjs`
- `scripts/lib/qualityGates/qualityGatePolicy.mjs`
- `scripts/lib/qualityGates/qualityGatePolicy.json`
- `scripts/lib/qualityGates/stagingQualityBridge.mjs`
- `scripts/lib/qualityGates/buildQualityDashboard.mjs`
- `scripts/lib/qualityGates/pipelineIntegration.mjs`
- `scripts/lib/qualityGates/qualityGateCommon.mjs`
- `scripts/lib/qualityGates/metadataSchemaGate.mjs`
- `scripts/lib/qualityGates/duplicateContentGate.mjs`
- `scripts/lib/qualityGates/passageCoherenceGate.mjs`
- `scripts/lib/qualityGates/answerKeyCoherenceGate.mjs`
- `scripts/lib/qualityGates/semanticCoherenceGate.mjs`
- `scripts/lib/qualityGates/contentTopicCheck.mjs`
- `scripts/lib/qualityGates/dedupCorpus.mjs`
- `scripts/lib/qualityGates/dedupIndex.mjs`
- `scripts/lib/qualityGates/dedupNormalize.mjs`
- `scripts/lib/qualityGates/topicFamilies.mjs`
- `scripts/lib/qualityGates/schema/lesen-fields.json`
- `scripts/lib/qualityGates/schema/horen-fields.json`

### UI
- `admin.html`
- `js/ui/admin/contentCorrectionsPanel.js`
- `js/ui/admin/generationFeedbackPanel.js`
- `js/ui/exam/adminContentReview.js`
- `js/ui/exam/examGeneration.js` (canonicalize cliente / pool)
- `js/data/manualVocab.js`

### Tests
- Todos los listados en §11.

### Config
- `netlify.toml` (redirects content-corrections)
- `generation-evaluation/quality-gates-map.json`
- `generation-evaluation/README.md`

### Fuera de alcance del loop pero fácil de confundir
- `scripts/lib/generationFeedback.mjs` (usage feedback batches)
- `netlify/functions/submit-feedback.js`, `js/ui/components/feedbackModal.js`, `assets/css/feedback-modal.css`
- `supabase/migrations/006_feedback.sql`
- `netlify/functions/lib/partQualityGate.js`, `examQualityGate.js` (legacy)
- `PARA-CLAUDE-auditoria-pipeline-completo.md` (pipeline Lesen, no este loop)
- `batches/PROMPT_crear_celda_contenido.md` (otra numeración PASO)

---

*Fin del documento de auditoría. Estado reflejado: código y datos del repositorio a 2026-07-11.*
